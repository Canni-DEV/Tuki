import type { Espacio } from '../espacio'
import type { Calidad, ModuloVisual, SesionVisual } from './contrato'
import { PresentacionRender } from './presentacion'
import type { TipoColocable } from '../types'

export interface EstadoVisual { active: boolean; busy: boolean; message: string; quality: Calidad; report?: unknown }
export async function compatible(): Promise<string | null> {
  if (!isSecureContext || !navigator.gpu) return 'Este navegador no tiene WebGPU disponible. Podés seguir usando los visuales actuales.'
  try {
    const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'})
    if (!adapter || adapter.limits.maxTextureDimension2D < 4096 || adapter.limits.maxColorAttachments < 4)
      return 'Este dispositivo no reúne los requisitos del modo fotorealista.'
    return null
  } catch { return 'No se pudo acceder a WebGPU. Podés volver a comprobarlo.' }
}

export class ControlVisual {
  state: EstadoVisual = {active:false,busy:false,message:'',quality:'alta'}
  private generation = 0
  private abort?: AbortController
  private session?: SesionVisual
  private canvas?: HTMLCanvasElement
  private presentation = new PresentacionRender()
  private certified = new Set<string>()
  private thumbnails=new Map<TipoColocable,string>()
  private thumbnailJob=false
  private catalogVersion=''
  private thumbnailError=''
  constructor(private space: Espacio, private pause: (paused:boolean)=>void, private changed: (state:EstadoVisual)=>void) {}
  private notify(values: Partial<EstadoVisual>) { Object.assign(this.state,values); this.changed({...this.state}) }
  private frame() { return this.presentation.capture(this.space.scene,this.space.camera,this.space.width,this.space.height,this.space.oscuro) }
  private draw() {
    try { this.session?.update(this.frame()); this.session?.render(); void this.prepareThumbnails() }
    catch (error) { this.fail(error instanceof Error ? error.message : String(error)) }
  }
  private fail(reason: string) { this.certified.clear(); this.stop(); this.notify({message:reason+' Se restauraron los visuales actuales.'}) }
  private async prepareThumbnails() {
    if(this.thumbnailJob||!this.session||!this.state.active)return
    const mesa=this.space.mesaVisual,version=mesa?mesa.grupo.uuid+':'+mesa.revisionCatalogo:''
    if(!mesa||version===this.catalogVersion)return
    this.catalogVersion=version
    const generation=this.generation,session=this.session
    this.thumbnailJob=true
    try {
      const frames=mesa.capturarMiniaturas((scene,camera)=>this.presentation.capture(scene,camera,120,120,false))
      for(const [type,frame] of frames??[]) {
        if(this.thumbnails.has(type))continue
        const image=await session.thumbnail(frame)
        if(generation!==this.generation)return
        this.thumbnails.set(type,image)
        this.space.canvas.dispatchEvent(new Event('miniaturasvisuales'))
      }
    } catch (error) { if(generation===this.generation)this.thumbnailError=String(error) /* Keep the original thumbnail usable. */ }
    finally {if(generation===this.generation)this.thumbnailJob=false}
  }
  async activate(quality: Calidad, repeat = false): Promise<boolean> {
    this.stop(); const generation = this.generation, abort = new AbortController(); this.abort = abort
    this.notify({busy:true,message:'Comprobando compatibilidad…',quality,report:undefined})
    try {
      const reason = await compatible(); abort.signal.throwIfAborted()
      if(reason) throw new Error(reason)
      this.pause(true)
      this.notify({message:'Preparando materiales e iluminación…'})
      const module = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}fotorealista/runtime/index.js`) as ModuloVisual
      abort.signal.throwIfAborted()
      const canvas = document.createElement('canvas'); this.canvas=canvas
      canvas.dataset.render='fotorealista'; canvas.setAttribute('aria-hidden','true')
      Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',visibility:'hidden'})
      this.space.canvas.parentElement!.insertBefore(canvas,this.space.canvas.nextSibling)
      const session = await module.create({canvas,backend:'webgpu',quality,effect:'contacto',signal:abort.signal,resourceURL:`${import.meta.env.BASE_URL}fotorealista/recursos/`,
        onFirstFrame:()=>{if(generation===this.generation)canvas.style.visibility='visible'},
        onFailure:reason=>queueMicrotask(()=>{if(generation===this.generation)this.fail(reason)})})
      if(abort.signal.aborted) {session.dispose();canvas.remove();return false}
      this.session=session
      const key=`187:${quality}:${this.space.width}x${this.space.height}:${devicePixelRatio}`
      if(repeat || !this.certified.has(key)) {
        const {sondear}=await import('./sondeo')
        const report=await sondear(session,this.space.canvas,quality,abort.signal,message=>this.notify({message}))
        this.notify({report})
        if(!report.accepted) throw new Error(quality==='alta'?'El perfil Alta no mantuvo la fluidez necesaria. Probá Equilibrada.':'Este equipo no mantuvo la fluidez necesaria para Fotorealista.')
        this.certified.add(key)
      }
      abort.signal.throwIfAborted()
      session.update(this.frame());await session.compile();abort.signal.throwIfAborted()
      this.space.renderAlternativo=()=>this.draw();this.draw();this.space.invalidar()
      if(generation!==this.generation||!this.session)return false
      this.space.miniaturasFotorealistas=this.thumbnails
      this.pause(false);this.notify({busy:false,active:true,message:'Fotorealista listo.'});void this.prepareThumbnails();return true
    } catch(error) {
      if(generation===this.generation) this.fail(error instanceof Error?error.message:String(error))
      return false
    }
  }
  statistics() {return { ...this.state, renderer:this.session?.statistics(), thumbnails:this.thumbnails.size, thumbnailError:this.thumbnailError}}
  simulateDeviceLoss() { this.session?.simulateDeviceLoss() }
  stop() {
    this.generation++;this.abort?.abort(new DOMException('Preparación cancelada.','AbortError'));this.abort=undefined
    this.space.renderAlternativo=undefined;this.session?.dispose();this.session=undefined
    this.thumbnails=new Map();this.thumbnailJob=false;this.catalogVersion='';this.thumbnailError='';this.space.miniaturasFotorealistas=undefined
    this.space.canvas.dispatchEvent(new Event('miniaturasvisuales'))
    this.canvas?.remove();this.canvas=undefined;this.space.invalidar();this.pause(false)
    this.notify({active:false,busy:false,message:''})
  }
}
