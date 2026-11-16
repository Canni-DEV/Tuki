import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Editor, validarPieza } from '../src/editor'
import { nivelPorId, surfaceRect } from '../src/levels'
import { shapes } from '../src/shapes'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import type { Armado, Nivel } from '../src/types'

beforeAll(initPhysics)
const leer = (nombre: string): Armado => JSON.parse(readFileSync(new URL('./fixtures/' + nombre + '.json', import.meta.url), 'utf8')).armado
function ejecutar(n: Nivel, a: Armado) {
  new Editor(n).cargar(a)
  const sim = new Simulation(n, a), eventos: SimEvent[] = []
  try {
    while (!sim.result && sim.tick < 36000) eventos.push(...sim.step())
    expect(sim.result).not.toBeNull()
    return { resultado: sim.result, eventos }
  } finally { sim.dispose() }
}

it('aísla toda la plataforma del mando y eleva la meta fuera del alcance desde la mesa', () => {
  const n = nivelPorId('disparo'), destino = surfaceRect(n, 'destino/apoyo')
  const borde = (id: string, lado: number) => {
    const r = surfaceRect(n, id)
    return r.x + lado * (Math.abs(Math.cos(r.ang)) * r.w + Math.abs(Math.sin(r.ang)) * r.d) / 2
  }
  const izquierda = n.superficies.filter(s => s.zona === 'tapa' && s.objeto !== 'mesa' && !s.objeto.startsWith('destino'))
  const extremo = Math.max(...izquierda.map(s => borde(s.id, 1)))
  expect(extremo).toBeLessThanOrEqual(-.11 + 1e-9)
  expect(borde('destino/apoyo', -1) - extremo).toBeGreaterThanOrEqual(.1975 - 1e-9)
  expect(n.objetos!.find(p => p.id === 'mando')!.posicion[0]).toBeLessThan(extremo)
  // Even the full diagonal of a falling domino on the only movable pedestal
  // stays below the goal. The tabletop cannot reconnect the two islands.
  const alcance = Math.hypot(...shapes('domino')[0].size) + shapes('spacer')[0].size[1]
  expect(destino.y).toBeGreaterThan(alcance)
  expect(n.objetos!.find(p => p.id === 'meta')!.posicion[1]).toBeCloseTo(destino.y)
})

it.each(['rampa', 'canal', 'taco'] as const)('%s no puede crear un apoyo elevado en el hueco', tipo => {
  const n = nivelPorId('disparo')
  for (const apoyo of ['libro/apoyo', 'destino/apoyo']) {
    const y = surfaceRect(n, apoyo).y
    for (const x of [-.08, -.04, 0, .04, .06]) for (const giroY of [0, 45, 90])
      expect(validarPieza(n, { id: 'puente-improvisado', tipo, posicion: [x, y, 0], giroY, apoyo }, [])).not.toBeNull()
  }
})

it('el desvío de dos dominós llega al borde izquierdo pero no cruza hasta la meta', () => {
  const { resultado, eventos } = ejecutar(nivelPorId('disparo'), leer('disparo-atajo'))
  expect(eventos.some(e => e.tipo === 'activo' && e.b === 'atajo1')).toBe(true)
  expect(eventos.some(e => e.tipo === 'activo' && ['atajo2', 'meta'].includes(e.b))).toBe(false)
  expect(eventos.some(e => e.tipo === 'disparo')).toBe(false)
  expect(resultado).toBe('detenida')
})

it('un rodeo con los 24 dominós llega al taco junto a la meta pero no la alcanza', () => {
  const a = leer('disparo-rodeo'), { resultado, eventos } = ejecutar(nivelPorId('disparo'), a)
  expect(a.saldo.domino).toBe(0)
  const activas = new Set(eventos.filter(e => e.tipo === 'activo').map(e => e.b))
  for (const p of a.piezas.filter(p => p.tipo === 'domino')) expect(activas.has(p.id), p.id).toBe(true)
  expect(activas.has('meta')).toBe(false)
  expect(eventos.some(e => e.tipo === 'disparo')).toBe(false)
  expect(resultado).toBe('detenida')
})

it.each(['disparo', 'disparo-alternativo'])('%s gana por el impacto de la bola después de cargar y señalar', nombre => {
  const { resultado, eventos } = ejecutar(nivelPorId('disparo'), leer(nombre))
  const carga = eventos.find(e => e.tipo === 'captura' && e.a === 'lanzador')!
  const señal = eventos.find(e => e.tipo === 'activo' && e.b === 'mando/paddle')!
  const disparos = eventos.filter(e => e.tipo === 'disparo')
  expect(disparos).toHaveLength(1)
  expect(señal.paso).toBeGreaterThan(carga.paso)
  expect(disparos[0]).toMatchObject({ a: 'lanzador', b: 'bola', paso: señal.paso + 60 })
  const impacto = eventos.find(e => e.tipo === 'activo' && e.b === 'meta')!
  expect(impacto.a).toBe('bola')
  expect(impacto.paso).toBeGreaterThan(disparos[0].paso)
  expect(resultado).toBe('victoria')
})

it.each(['disparo', 'disparo-alternativo'].flatMap(nombre => ['bola', 'circuito'].map(retirar => ({ nombre, retirar }))))(
  '$nombre falla sin $retirar aunque la cadena active el mando', ({ nombre, retirar }) => {
    const n = structuredClone(nivelPorId('disparo')), a = leer(nombre)
    if (retirar === 'circuito') n.instalacion!.conexiones = []
    else { a.piezas = a.piezas.filter(p => p.id !== 'bola'); a.saldo.bolita++ }
    const { resultado, eventos } = ejecutar(n, a)
    expect(eventos.some(e => e.tipo === 'activo' && e.b === 'mando/paddle')).toBe(true)
    expect(eventos.some(e => e.tipo === 'disparo' || (e.tipo === 'activo' && e.b === 'meta'))).toBe(false)
    expect(resultado).toBe('detenida')
  },
)

it('rechaza montajes de la revisión anterior y las posiciones del antiguo atajo', () => {
  const n = nivelPorId('disparo'), anterior = { ...leer('disparo'), revision: 2 }
  expect(() => new Editor(n).cargar(anterior)).toThrow('Montaje de otra revisión')
  expect(validarPieza(n, { id: 'atajo-anterior', tipo: 'domino', posicion: [.087, .072, -.09], giroY: 40, apoyo: 'rama-final/apoyo' }, [])).not.toBeNull()
})
