import type { Espacio } from '../espacio'
import type { BackendComparacion, Calidad, EfectoComparacion, ModuloVisual, SesionVisual } from './contrato'
import { PresentacionRender } from './presentacion'
import { resumir } from './metricas'
import type { CuadroVisual } from './contrato'
import * as THREE from 'three'

/** QA-only entry point. The WebGL2 candidate is never a production fallback. */
export class LaboratorioRender {
  private session?: SesionVisual
  private canvas?: HTMLCanvasElement
  private generation = 0
  private presentation = new PresentacionRender()
  private samples: number[] = []
  private cpu: number[] = []
  private last = 0
  private measuring = false
  private continuous = false
  private raf = 0
  private recording=false
  private recordingStart=0
  private captured: {time:number;frame:CuadroVisual}[]=[]
  private originals=new Map<string,THREE.Object3D>()
  error: string | null = null
  constructor(private space: Espacio) {}
  async select(backend: BackendComparacion | 'actual', quality: Calidad = 'alta', effect: EfectoComparacion = 'base') {
    this.stop(); const generation = this.generation
    if (backend === 'actual') return this.stats()
    if (backend === 'webgpu') {
      if (!isSecureContext || !navigator.gpu || !await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))
        throw new Error('WebGPU no está disponible en este dispositivo.')
    }
    const canvas = document.createElement('canvas')
    canvas.dataset.render = backend; canvas.setAttribute('aria-hidden','true')
    Object.assign(canvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none' })
    this.space.canvas.parentElement!.append(canvas); this.canvas = canvas
    try {
      const module = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}fotorealista/runtime/index.js`) as ModuloVisual
      const session = await module.create({ canvas, backend, quality, effect, resourceURL: `${import.meta.env.BASE_URL}fotorealista/recursos/`,
        onFailure: reason => { this.error = reason; this.stop() } })
      if (generation !== this.generation) { session.dispose(); canvas.remove(); return this.stats() }
      this.session = session
      session.update(this.frame()); await session.compile()
      if (generation !== this.generation) return this.stats()
      this.space.renderAlternativo = () => this.draw()
      this.space.invalidar(); session.render()
      return this.stats()
    } catch (error) { this.error = String(error); this.stop(); throw error }
  }
  private frame() { return this.presentation.capture(this.space.scene, this.space.camera, this.space.width, this.space.height, this.space.oscuro) }
  private draw() {
    const start = performance.now()
    if(this.recording && (!this.captured.length || start-this.recordingStart-this.captured.at(-1)!.time>=1000/60)) {
      this.space.scene.traverse(o=>this.originals.set(o.uuid,o))
      this.captured.push({time:start-this.recordingStart,frame:this.frame()})
    }
    if (this.session) { this.session.update(this.frame()); this.session.render() }
    else this.space.renderer.render(this.space.scene, this.space.camera)
    if (this.measuring) {
      if (this.last) this.samples.push(start-this.last)
      this.last = start; this.cpu.push(performance.now()-start)
    }
  }
  forceFrames(enabled: boolean) {
    this.continuous = enabled; cancelAnimationFrame(this.raf)
    if (!this.session && enabled) this.space.renderAlternativo = () => this.draw()
    const tick = () => { if (!this.continuous) return; this.space.invalidar(); this.raf = requestAnimationFrame(tick) }
    if (enabled) tick()
  }
  measure(enabled: boolean) {
    this.measuring = enabled
    if (enabled) { this.samples = []; this.cpu = []; this.last = 0 }
    return { frame: resumir(this.samples), cpuSubmission: resumir(this.cpu) }
  }
  stats() { return { ...this.session?.statistics(), mode: this.session ? 'candidate' : 'actual', error: this.error } }
  record(enabled:boolean) {
    this.recording=enabled
    if(enabled){this.captured=[];this.originals.clear();this.recordingStart=performance.now();this.forceFrames(true);this.space.renderAlternativo=()=>this.draw()}
    else this.forceFrames(false)
    return {frames:this.captured.length,duration:this.captured.at(-1)?.time??0}
  }
  async replay(backend: BackendComparacion|'actual',quality:Calidad,effect:EfectoComparacion,seconds:number) {
    if(!Number.isFinite(seconds)||seconds<=0||seconds>300)throw new Error('La medición debe durar entre 0 y 300 segundos.')
    if(this.captured.length<2)throw new Error('Primero grabá una jugada.')
    await this.select(backend,quality,effect)
    const saved=[...this.originals.values()].map(o=>({o,visible:o.visible,auto:o.matrixWorldAutoUpdate,matrix:o.matrixWorld.clone()}))
    const camera=this.space.camera,world=camera.matrixWorld.clone(),projection=camera.projectionMatrix.clone(),auto=camera.matrixWorldAutoUpdate
    const dark=this.space.oscuro
    const frameTimes:number[]=[],cpuTimes:number[]=[]
    let start=0,last=0
    const duration=this.captured.at(-1)!.time
    try {
      await new Promise<void>((resolve,reject)=>{
        const tick=(t:number)=>{
          if(document.hidden){reject(new Error('La pestaña de medición debe permanecer visible.'));return}
          start ||= t;const elapsed=t-start,time=elapsed%duration
          let left=0,right=this.captured.length-1
          while(left<right){const mid=Math.ceil((left+right)/2);if(this.captured[mid].time<=time)left=mid;else right=mid-1}
          const frame={...this.captured[left].frame,dark}
          const begin=performance.now()
          try {
            if(this.session){this.session.update(frame);this.session.render()}
            else {
              const visible=new Set(frame.objects.map(o=>o.id))
              for(const {o} of saved)if(o instanceof THREE.Mesh||o instanceof THREE.Line||o instanceof THREE.Sprite||o instanceof THREE.Points)o.visible=visible.has(o.uuid)
              for(const d of frame.objects){const o=this.originals.get(d.id);if(o){o.matrixWorldAutoUpdate=false;o.matrixWorld.fromArray(d.matrix)}}
              camera.matrixWorldAutoUpdate=false;camera.matrixWorld.fromArray(frame.camera.matrix);camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
              camera.projectionMatrix.fromArray(frame.camera.projection);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
              this.space.renderer.render(this.space.scene,camera)
            }
          }catch(error){reject(error);return}
          // The first two seconds are warm-up, including effect-pipeline compilation.
          if(elapsed>=2000&&last){frameTimes.push(t-last);cpuTimes.push(performance.now()-begin)}
          last=t
          if(elapsed>=2000+seconds*1000)resolve();else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      return {backend,quality,effect,seconds,poses:this.captured.length,frame:resumir(frameTimes),cpuSubmission:resumir(cpuTimes),renderer:this.stats()}
    } finally {
      for(const {o,visible,auto,matrix} of saved){o.visible=visible;o.matrixWorldAutoUpdate=auto;o.matrixWorld.copy(matrix)}
      camera.matrixWorldAutoUpdate=auto;camera.matrixWorld.copy(world);camera.matrixWorldInverse.copy(world).invert();camera.projectionMatrix.copy(projection);camera.projectionMatrixInverse.copy(projection).invert()
      this.space.invalidar()
    }
  }
  stop() {
    this.generation++; this.forceFrames(false); this.measuring = false;this.recording=false
    this.space.renderAlternativo = undefined
    this.session?.dispose(); this.session = undefined; this.canvas?.remove(); this.canvas = undefined
    this.space.invalidar()
  }
}
