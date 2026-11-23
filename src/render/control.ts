import type { Espacio } from '../espacio'
import type { Calidad, ModuloVisual, SesionVisual } from './contrato'
import { PresentacionRender } from './presentacion'
import type { TipoColocable } from '../types'
import { aprobaciones, perfiles } from './aprobacion'
import type { InformeSondeo } from './sondeo'

export interface EstadoVisual { active: boolean; busy: boolean; message: string; quality: Calidad; report?: unknown; qualification?: 'saved'|'measured' }
async function compatible(): Promise<GPUAdapter | string> {
  if (!isSecureContext || !navigator.gpu) return 'Este navegador no tiene WebGPU disponible. Podés seguir usando Default.'
  try {
    const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'})
    if (!adapter || adapter.limits.maxTextureDimension2D < 4096 || adapter.limits.maxColorAttachments < 4)
      return 'Este dispositivo no reúne los requisitos de Calidad.'
    return adapter
  } catch { return 'No se pudo acceder a WebGPU. Podés volver a comprobarlo.' }
}

export class ControlVisual {
  state: EstadoVisual = {active:false,busy:false,message:'',quality:'alta'}
  private generation = 0
  private abort?: AbortController
  private session?: SesionVisual
  private canvas?: HTMLCanvasElement
  private presentation = new PresentacionRender()
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
  private fail(reason: string) {
    this.stop(); this.notify({message:reason+' Se activó Default para esta sesión.'})
  }
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
    this.notify({busy:true,message:'Comprobando compatibilidad…',quality,report:undefined,qualification:undefined})
    this.pause(true)
    const timeout=setTimeout(()=>{if(generation===this.generation)this.fail('La preparación de Calidad tardó demasiado. Podés reintentar.')},120000)
    try {
      const adapter = await compatible(); abort.signal.throwIfAborted()
      if(typeof adapter==='string') throw new Error(adapter)
      this.notify({message:'Preparando materiales e iluminación…'})
      const module = await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}fotorealista/runtime/index.js`) as ModuloVisual
      abort.signal.throwIfAborted()
      let sessionQuality: Calidad | undefined
      const create=async(q:Calidad)=>{
        this.session?.dispose();this.session=undefined;this.canvas?.remove()
        const canvas=document.createElement('canvas');this.canvas=canvas
        canvas.dataset.render='fotorealista';canvas.setAttribute('aria-hidden','true')
        Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',visibility:'hidden'})
        this.space.canvas.parentElement!.insertBefore(canvas,this.space.canvas.nextSibling)
        const session=await module.create({canvas,backend:'webgpu',quality:q,effect:'contacto',signal:abort.signal,resourceURL:`${import.meta.env.BASE_URL}fotorealista/recursos/`,
          onFailure:reason=>queueMicrotask(()=>{if(generation===this.generation)this.fail(reason)})})
        if(abort.signal.aborted){session.dispose();canvas.remove();abort.signal.throwIfAborted()}
        this.session=session;sessionQuality=q;return session
      }
      let check=aprobaciones.read()
      const measured=repeat||!check
      if(measured) {
        const {sondear}=await import('./sondeo')
        const results={} as Record<Calidad,InformeSondeo>
        for(const q of perfiles) {
          abort.signal.throwIfAborted()
          this.notify({message:`Preparando perfil ${q==='alta'?'Alta':'Equilibrada'}…`})
          const session=await create(q)
          results[q]=await sondear(session,this.space.canvas,q,abort.signal,message=>this.notify({message:`${q==='alta'?'Alta':'Equilibrada'} · ${message}`}))
        }
        abort.signal.throwIfAborted()
        // Commit both results together. A cancelled retest retains the previous check.
        aprobaciones.save(results);check=aprobaciones.read()
      }
      const selected=check?.profiles[quality]?.accepted?quality:perfiles.find(q=>check?.profiles[q]?.accepted)
      if(!selected)throw new Error('La comprobación no habilitó ningún perfil de Calidad. Podés repetirla voluntariamente desde Preferencias.')
      const report=check!.profiles[selected]
      this.notify({quality:selected})
      this.notify({report,qualification:measured?'measured':'saved',message:'Preparando tu mesa…'})
      abort.signal.throwIfAborted()
      const session=sessionQuality===selected?this.session!:await create(selected)
      session.update(this.frame())
      await session.compile()
      abort.signal.throwIfAborted()
      session.render();await session.waitForGPU();abort.signal.throwIfAborted()
      if(generation!==this.generation||!this.session)return false
      this.space.renderAlternativo=()=>this.draw();this.space.invalidar()
      // Reveal only a completed player frame. Intro time is still paused here.
      this.canvas!.style.visibility='visible'
      this.space.miniaturasFotorealistas=this.thumbnails
      this.notify({busy:false,active:true,message:selected===quality?'Calidad lista.':`Calidad lista en ${selected==='alta'?'Alta':'Equilibrada'}; el perfil solicitado no está aprobado.`})
      this.pause(false);void this.prepareThumbnails();return true
    } catch(error) {
      if(generation===this.generation) this.fail(error instanceof Error?error.message:String(error))
      return false
    } finally {clearTimeout(timeout)}
  }
  statistics() {return { ...this.state, check:aprobaciones.read(), renderer:this.session?.statistics(), thumbnails:this.thumbnails.size, thumbnailError:this.thumbnailError}}
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
