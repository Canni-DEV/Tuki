import type { Armado } from '../src/types'
import type { SimEvent } from '../src/simulation'
type Montaje = { armado: Armado; grupos: string[][] }

/** Reachable devices use causal activation. Fixed guides use the ball's first impact. */
export function trazaMontaje(fixture: Montaje, events: SimEvent[]) {
  const targets = new Set(fixture.grupos.flat())
  const activated = new Map<string, number>()
  const balls = fixture.armado.piezas.filter(p => p.tipo === 'bolita').map(p=>p.id)
  for (const e of events) {
    let id: string | undefined
    if (e.tipo === 'empujon') id = e.a
    else if (e.tipo === 'activo') id = e.b
    else if (e.tipo === 'impacto') {
      const ball=balls.find(b=>(b===e.a||b===e.b) && activated.has(b))
      const other=e.a===ball?e.b:e.a
      const guia = fixture.armado.piezas.find(p => p.id === other)
      if (ball && (['rampa','embudo','canal','curva90'].includes(guia?.tipo ?? '') ||
        ['slider','diverter','tray'].includes((other ?? '').split('/')[1]))) id = other
    }
    if (id && targets.has(id) && !activated.has(id)) activated.set(id, e.paso)
  }
  const steps = new Map<number, string[]>()
  for (const [id, step] of activated) {
    if (!steps.has(step)) steps.set(step, [])
    steps.get(step)!.push(id)
  }
  return [...steps.entries()].sort((a,b) => a[0]-b[0]).map(([paso, ids]) => ({paso,ids:ids.sort()}))
}
