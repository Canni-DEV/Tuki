import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Quaternion, Vector3 } from 'three'
import { Editor } from '../src/editor'
import { nivelPorId } from '../src/levels'
import { gana, initPhysics, Simulation, type SimEvent } from '../src/simulation'
import { armadoDeMesa, leerMesa, mesaNueva, nivelTaller } from '../src/taller'
import { armadoSolucion, desafioDesdeMesa, nivelDesafio } from '../src/desafios'
import type { Armado, Nivel } from '../src/types'

beforeAll(initPhysics)
const fixture = (nombre = 'subibaja-contacto-simultaneo'): Armado =>
  JSON.parse(readFileSync(new URL('./fixtures/' + nombre + '.json', import.meta.url), 'utf8')).armado
function correr(sim: Simulation, pasosPorCuadro = 1) {
  const eventos: SimEvent[] = []
  while (!sim.result && sim.tick < 36000) {
    for (let j = 0; j < pasosPorCuadro && !sim.result; j++) {
      expect(sim.motivoDetencion).toBeNull()
      eventos.push(...sim.step())
    }
  }
  return eventos
}
function probar(a: Armado, n: Nivel = nivelPorId(a.nivel), pasosPorCuadro = 1) {
  const sim = new Simulation(n, a)
  try {
    const eventos = correr(sim, pasosPorCuadro)
    return { eventos, resultado: sim.result, motivo: sim.motivoDetencion, paso: sim.tick, poses: [...sim.poses()] }
  } finally { sim.dispose() }
}

it('el giro de 97° gana y transmite la carga en el mismo paso que el golpe al balancín', () => {
  const a = fixture(), n = nivelPorId(a.nivel)
  new Editor(n).cargar(a)
  const r = probar(a)
  expect(r.resultado).toBe('victoria')
  expect(r.motivo).toBeNull()
  expect(r.eventos.filter(e => e.tipo === 'victoria')).toHaveLength(1)
  const activacion = (id: string) => r.eventos.filter(e => e.tipo === 'activo' && e.b === id)
  expect(activacion('bola2')).toHaveLength(1)
  expect(activacion('bola2')[0].a).toBe('lever/lever')
  expect(activacion('bola2')[0].paso).toBe(activacion('lever/lever')[0].paso)
  expect(activacion('bola2')[0].paso).toBeLessThan(activacion('fin0')[0].paso)
  for (const pasos of [4, 4, 4, 1]) expect(probar(a, n, pasos)).toEqual(r)
})

it('un nuevo golpe causal transmite la carga aunque el balancín ya estuviera activo', () => {
  const a = fixture(), sim = new Simulation(nivelPorId(a.nivel), a)
  try {
    // The arriving ball hits at step 60. Model a lever reached by an earlier
    // branch without changing any velocities or the supported ball's state.
    for (let i = 0; i < 59; i++) sim.step()
    expect(sim.activas.has('bola2')).toBe(false)
    sim.activas.add('lever/lever')
    const eventos = correr(sim)
    expect(eventos.filter(e => e.tipo === 'activo' && e.b === 'bola2').map(e => e.paso)).toEqual([60])
    expect(sim.result).toBe('victoria')
  } finally { sim.dispose() }
})

it('conserva el apoyo dormido hasta que un golpe causal despierta el balancín y lanza la bola', () => {
  const a = fixture(), sim = new Simulation(nivelPorId(a.nivel), a)
  try {
    for (let i = 0; i < 30; i++) sim.step()
    sim.actors.get('lever/lever')!.body.sleep()
    sim.actors.get('bola2')!.body.sleep()
    const eventos = correr(sim)
    const carga = eventos.find(e => e.tipo === 'activo' && e.b === 'bola2')!
    const golpe = eventos.find(e => e.tipo === 'activo' && e.b === 'lever/lever')!
    expect(carga?.paso).toBe(golpe?.paso)
    expect(carga?.a).toBe('lever/lever')
    expect(sim.result).toBe('victoria')
    expect(sim.motivoDetencion).toBeNull()
  } finally { sim.dispose() }
})

const cambios: [string, 'x' | 'z' | 'giroY', number][] = [
  ['d2', 'x', 3], ['d2', 'z', -7], ['d2', 'z', 15], ['d2', 'giroY', 1], ['d2', 'giroY', 7],
  ['bola', 'x', 5], ['bola', 'x', 7], ['bola', 'z', -5], ['bola', 'z', -3], ['bola', 'z', -2],
]
it.each(cambios)('reconoce la caída causal al variar %s en %s por %s mm o grados', (id, eje, delta) => {
  const a = fixture('subibaja'), n = nivelPorId(a.nivel), editor = new Editor(n)
  editor.cargar(a)
  const p = structuredClone(a.piezas.find(p => p.id === id)!)
  if (eje === 'giroY') p.giroY += delta
  else p.posicion[eje === 'x' ? 0 : 2] += delta / 1000
  expect(editor.mover(p)).toBe(true)
  const r = probar(editor.armado)
  expect(r.eventos.filter(e => e.tipo === 'victoria')).toHaveLength(1)
  expect(r.resultado).toBe('victoria')
  expect(r.motivo).toBeNull()
})

it.each([[90, .02], [96, .01], [84, 0]])('un dominó a %s° cae sobre el balancín en X=%s y lanza la única bolita', (giroY, x) => {
  const a = fixture('subibaja'), n = nivelPorId(a.nivel), editor = new Editor(n)
  editor.cargar(a)
  for (const id of ['bola', 'taco']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(true)
  }
  expect(editor.agregar([{ id: 'carga', tipo: 'domino', posicion: [-.083, .24, -.006], giroY, apoyo: 'libro-alto/apoyo' }])).toBe(true)
  const peso = editor.seleccion!
  const lever = editor.armado.piezas.find(p => p.tipo === 'balancin')!
  expect(editor.mover({ ...lever, posicion: [x, 0, -.004] })).toBe(true)
  expect(editor.armado.piezas.filter(p => p.tipo === 'bolita')).toHaveLength(1)
  const r = probar(editor.armado)
  const entrada = r.eventos.filter(e => e.tipo === 'activo' && e.b === 'lever/lever')
  expect(entrada).toHaveLength(1)
  expect(entrada[0]).toMatchObject({ a: peso, materialA: 'domino' })
  expect(r.eventos.filter(e => e.tipo === 'activo' && e.b === 'bola2')).toHaveLength(1)
  expect(r.eventos.find(e => e.tipo === 'activo' && e.b === 'bola2')!.a).toBe('lever/lever')
  expect(r.resultado).toBe('victoria')
  expect(r.eventos.filter(e => e.tipo === 'victoria')).toHaveLength(1)
})

it.each(['puente', 'puente-tarde'])('%s conserva el desenlace de la cadena y la ventana de reposo', nombre => {
  const r = probar(fixture(nombre))
  expect(r.resultado).toBe(nombre === 'puente' ? 'victoria' : 'detenida')
  expect(r.eventos.filter(e => e.tipo === 'victoria')).toHaveLength(nombre === 'puente' ? 1 : 0)
})

it('funciona en Taller y desafíos personalizados con otras identidades y orden de piezas', () => {
  const a = fixture(), n = nivelPorId(a.nivel), renombrar = (id: string) => ['inicio', 'meta', 'tablero'].includes(id) ? id : 'otro-' + id
  const piezas = [...n.objetos!, ...a.piezas].map(p => ({ ...structuredClone(p), id: renombrar(p.id),
    apoyo: p.apoyo.split('/').map((v, i) => i ? v : renombrar(v)).join('/') }))
  const m = leerMesa({ ...mesaNueva('Otra mesa', n.formatoMesa), empujon: n.empujon, piezas: piezas.reverse() })
  const libre = nivelTaller(m.nombre, m), r = probar(armadoDeMesa(libre, m), libre)
  expect(r.resultado).toBe('victoria')
  expect(r.eventos.some(e => e.tipo === 'activo' && e.a === 'otro-lever/lever' && e.b === 'otro-bola2')).toBe(true)
  const d = desafioDesdeMesa(m)
  expect(probar(armadoSolucion(d), nivelDesafio(d)).resultado).toBe('victoria')
})

it.each(['sin empujón', 'sin primera bola', 'bola independiente'])('%s no transmite una carga ajena a la cadena', caso => {
  const a = fixture(), n = structuredClone(nivelPorId(a.nivel))
  if (caso !== 'sin primera bola') n.empujon.impulsoLocal = [0, 0, 0]
  else a.piezas = a.piezas.filter(p => p.id !== 'bola')
  const sim = new Simulation(n, a)
  try {
    if (caso === 'bola independiente') {
      // Let the unrelated ball fall onto the receiving cup after the load settles.
      const bola = sim.actors.get('bola')!.body
      bola.setTranslation({ x: 0, y: .22, z: -.006 }, true)
    }
    const eventos = correr(sim)
    expect(eventos.filter(e => e.tipo === 'victoria')).toEqual([])
    expect(sim.activas.has('bola2')).toBe(false)
    expect(sim.activas.has('meta')).toBe(false)
    expect(sim.result).toBe('detenida')
    if (caso === 'bola independiente') expect(eventos.some(e => e.tipo === 'impacto' &&
      [e.a, e.b].includes('bola') && [e.a, e.b].includes('lever/lever'))).toBe(true)
  } finally { sim.dispose() }
})

it('un balancín previamente activo conserva el detector habitual sin adelantos por la nueva transferencia', () => {
  const a = fixture(), n = structuredClone(nivelPorId(a.nivel))
  n.empujon.impulsoLocal = [0, 0, 0]
  const sim = new Simulation(n, a)
  try {
    sim.activas.add('lever/lever')
    const eventos = correr(sim)
    // Baseline before this fix: the ordinary detector marks the load at step 17
    // while the joint settles. Earlier post-solver motion must not add a transfer
    // without a fresh causal input. Preserve that legacy behavior deliberately.
    expect(eventos.filter(e => e.tipo === 'activo').map(e => [e.paso, e.a, e.b]))
      .toEqual([[17, 'lever/lever', 'bola2']])
    expect(eventos.some(e => e.tipo === 'victoria')).toBe(false)
    expect(sim.activas.has('meta')).toBe(false)
    expect(sim.result).toBe('detenida')
  } finally { sim.dispose() }
})

it('una carga en reposo no se activa por tener debajo un balancín activo', () => {
  const a = fixture(), n = structuredClone(nivelPorId(a.nivel))
  n.empujon.impulsoLocal = [0, 0, 0]
  const sim = new Simulation(n, a)
  try {
    for (const actor of sim.actors.values()) if (actor.dynamic) actor.body.sleep()
    sim.activas.add('lever/lever')
    const eventos = correr(sim)
    expect(eventos.some(e => e.tipo === 'activo' || e.tipo === 'victoria')).toBe(false)
    expect(sim.activas.has('bola2')).toBe(false)
    expect(sim.result).toBe('detenida')
  } finally { sim.dispose() }
})

it('compartir el libro con la ficha de inicio no activa otra pieza apoyada', () => {
  const a = fixture(), n = nivelPorId(a.nivel)
  a.piezas = a.piezas.filter(p => p.id === 'd2')
  a.piezas[0].posicion = [-.12, .24, .038]
  const sim = new Simulation(n, a)
  try {
    correr(sim)
    expect([...sim.activas]).toEqual(['inicio'])
    expect(sim.result).toBe('detenida')
    expect(sim.motivoDetencion).toBeNull()
  } finally { sim.dispose() }
})

it('explica una meta caída sin cadena solo al finalizar y reinicia el motivo', () => {
  const a = fixture(), n = structuredClone(nivelPorId(a.nivel))
  n.empujon.impulsoLocal = [0, 0, 0]
  const sim = new Simulation(n, a)
  try {
    sim.actors.get('meta')!.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2), true)
    expect(sim.motivoDetencion).toBeNull()
    expect(correr(sim).some(e => e.tipo === 'victoria')).toBe(false)
    expect(sim.result).toBe('detenida')
    expect(sim.motivoDetencion).toBe('meta-sin-cadena')
  } finally { sim.dispose() }
  const repetida = new Simulation(n, a)
  try {
    expect(repetida.motivoDetencion).toBeNull()
    correr(repetida)
    expect(repetida.motivoDetencion).toBeNull()
  } finally { repetida.dispose() }
  expect(gana(true, .5)).toBe(false)
  expect(gana(true, .49999)).toBe(true)
  expect(gana(false, 0)).toBe(false)
})
