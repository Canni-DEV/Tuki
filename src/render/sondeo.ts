import { Espacio } from '../espacio'
import { nivelPorId } from '../levels'
import { perfil, type Armado } from '../types'
import { initPhysics, Simulation } from '../simulation'
import { PresentacionRender } from './presentacion'
import { habilitable, resumir } from './metricas'
import type { Calidad, SesionVisual } from './contrato'
import vuelta from '../../qa/fixtures/vuelta.json'

export type InformeSondeo = Awaited<ReturnType<typeof sondear>>

function nextFrame(signal: AbortSignal): Promise<number> {
  return new Promise((resolve,reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    if(document.hidden){reject(new Error('Volvé a la pestaña y repetí la comprobación.'));return}
    const cleanup=()=>{signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility)}
    const abort = () => { cancelAnimationFrame(id);cleanup(); reject(signal.reason) }
    const visibility=()=>{if(document.hidden){cancelAnimationFrame(id);cleanup();reject(new Error('Volvé a la pestaña y repetí la comprobación.'))}}
    const id = requestAnimationFrame(t => { cleanup(); resolve(t) })
    signal.addEventListener('abort',abort,{once:true})
    document.addEventListener('visibilitychange',visibility)
  })
}
/** A separate real Tuki level; never steps or modifies the player's simulation. */
export async function sondear(session: SesionVisual, viewport: HTMLCanvasElement, quality:Calidad, signal: AbortSignal, status: (text:string)=>void) {
  const rect = viewport.getBoundingClientRect(), canvas = document.createElement('canvas')
  Object.assign(canvas.style,{position:'fixed',left:'-10000px',top:'0',width:`${rect.width}px`,height:`${rect.height}px`,pointerEvents:'none'})
  canvas.setAttribute('aria-hidden','true'); document.body.append(canvas)
  let space: Espacio | undefined, sim: Simulation | undefined
  const results = []
  try {
    session.setProbe(true)
    signal.throwIfAborted(); await initPhysics(); signal.throwIfAborted()
    space = new Espacio(canvas)
    const nivel = nivelPorId('vuelta'), armado = structuredClone(vuelta.armado) as unknown as Armado
    const mesa = (await space.mostrar('juego',nivel,armado))!
    const presentation = new PresentacionRender()
    // Qualify at the profile's pixel ceiling, including when activated in a small window.
    const scale=Math.sqrt((quality==='alta'?2560*1440:1920*1080)/(Math.max(1,rect.width)*Math.max(1,rect.height)))
    const capture=(dark:boolean)=>({...presentation.capture(space!.scene,space!.camera,rect.width,rect.height,dark),width:rect.width*scale,height:rect.height*scale,dpr:1})
    for (const dark of [false,true]) {
      signal.throwIfAborted(); space.aplicarApariencia(dark)
      status(`Comprobando ${dark?'iluminación nocturna':'luz de día'}…`)
      mesa.dibujar(armado.piezas,null,[],null)
      session.update(capture(dark))
      await session.compile(); signal.throwIfAborted()
      // Warm all pipelines without counting compilation or shader uploads as steady-state FPS.
      let start = await nextFrame(signal), now = start
      while (now-start < 2000) { session.render(); await session.waitForGPU(); now = await nextFrame(signal); if(document.hidden) throw new Error('Volvé a la pestaña y repetí la comprobación.') }
      sim = new Simulation(nivel,armado)
      const samples: number[] = []; start = await nextFrame(signal); let previous = start
      for (;;) {
        now = await nextFrame(signal)
        if(document.hidden) throw new Error('Volvé a la pestaña y repetí la comprobación.')
        samples.push(now-previous); previous=now
        while (!sim.result && sim.tick*perfil.paso < (now-start)/1000) sim.step()
        mesa.dibujar(armado.piezas,null,[],null,sim.poses(),armado.conexiones)
        session.update(capture(dark)); session.render(); await session.waitForGPU(); signal.throwIfAborted()
        if(now-start>=5000)break
      }
      results.push({theme:dark?'oscuro':'claro',...resumir(samples),accepted:habilitable(samples)})
      sim.dispose(); sim=undefined
    }
    return {accepted:results.every(r=>r.accepted),results}
  } finally { session.setProbe(false); sim?.dispose(); space?.dispose(); canvas.remove() }
}
