import { disponible } from '../src/progreso'
import { describe, it, expect, beforeAll } from 'vitest'
import { Editor, validarPieza } from '../src/editor'
import { nivelPorId, validarNivel } from '../src/levels'
import { initPhysics, gana } from '../src/simulation'
import { leer, guardar } from '../src/progreso'
import type { PiezaColocada, Vec3 } from '../src/types'
beforeAll(initPhysics)
const n = nivelPorId('curva')
const pieza = (id: string, x: number, z: number): PiezaColocada => ({
  id,
  tipo: 'domino',
  posicion: [x, 0, z],
  giroY: 90,
  apoyo: 'tablero',
})
describe('Edición confirmada', () => {
  it('fila atómica, IDs propios, retiro y corrección individual', () => {
    const e = new Editor(n),
      tramo = e.trazar(
        [
          [-0.14, 0, 0.07],
          [0.18, 0, 0.07],
        ],
        'tablero',
      )
    expect(tramo.error).toBe('Límite de fichas')
    expect(tramo.piezas).toHaveLength(10)
    expect(e.agregar(tramo.piezas)).toBe(true)
    expect(e.armado.saldo.domino).toBe(0)
    const inicial = structuredClone(e.armado)
    const id = e.armado.piezas[3].id
    e.seleccion = id
    e.retirar()
    expect(e.armado.saldo.domino).toBe(1)
    e.agregar([pieza('nueva', 0, -0.08)])
    e.deshacer()
    e.deshacer()
    expect(e.armado).toEqual(inicial)
    e.mover({ ...e.armado.piezas[3], posicion: [0, 0, -0.06] })
    expect(
      e.armado.piezas
        .filter((p, i) => JSON.stringify(p) !== JSON.stringify(inicial.piezas[i]))
        .map((p) => p.id),
    ).toEqual([id])
    e.deshacer()
    e.deshacer()
    expect(e.armado.piezas).toHaveLength(0)
    expect(e.armado.saldo.domino).toBe(10)
  })
  it('corta un arrastre rápido en un obstáculo y acepta huecos amplios', () => {
    const e = new Editor(n),
      ob = n.fijos.find((o) => o.id === 'obstaculo')!
    const z = ob.posicion[2]
    const r = e.trazar(
      [
        [-0.09, 0, z],
        [0.12, 0, z],
      ],
      'tablero',
    )
    expect(r.piezas.length).toBeGreaterThan(0)
    expect(r.piezas.every((p) => p.posicion[0] < ob.posicion[0] - .026)).toBe(true)
    expect(validarPieza(n, pieza('centro', ob.posicion[0], z), [])).toBe('Separá las piezas')
    expect(e.agregar([pieza('a', -0.08, 0.08), pieza('b', 0.11, 0.08)])).toBe(true)
    expect(e.agregar([pieza('a', -0.08, 0.08)])).toBe(false)
    expect(validarPieza(n, pieza('a', 0.211, 0), [])).toBe('Apoyá toda la base')
    const antes = e.armado
    expect(e.mover({ ...e.armado.piezas[0], posicion: [0.6, 0, 0] })).toBe(false)
    expect(e.armado).toBe(antes)
  })
  it('corta el trazo al borde de un libro y admite el asiento de la cuna', () => {
    const libro = nivelPorId('libro'),
      e = new Editor(libro)
    const s = libro.superficies.find((s) => s.objeto === libro.fijos.find((o) => o.activo === 'book')?.id)!
    const obj = libro.fijos.find((o) => o.id === s.objeto)!,
      y = (s.altura ?? 0.018) * (obj.escala?.[1] ?? 1) + obj.posicion[1]
    const z = obj.posicion[2] + 0.035
    const p: Vec3 = [obj.posicion[0], y, z]
    const r = e.trazar([p, [0.18, y, z]], s.id)
    expect(r.piezas.length).toBeGreaterThan(0)
    expect(r.piezas.length).toBeLessThan(6)
    expect(e.agregar(r.piezas)).toBe(true)
  })
})
it('rechaza nivel inválido y exige superar el umbral causal', () => {
  const malo = structuredClone(n)
  malo.fijos.push(malo.fijos[0])
  expect(() => validarNivel(malo)).toThrow()
  expect(gana(true, 0.5)).toBe(false)
  expect(gana(true, 0.49999)).toBe(true)
  expect(gana(false, 0)).toBe(false)
})
it('conserva ajustes y soporta almacenamiento ilegible o bloqueado', () => {
  let data = ''
  const storage = () => ({
    getItem: () => data,
    setItem: (_key: string, value: string) => {
      data = value
    },
  })
  const p = leer(storage)
  p.completados = ['recta', 'curva']
  p.movimiento = 'reducido'
  p.audio = false
  expect(guardar(p, storage)).toBe(true)
  expect(leer(storage)).toEqual(p)
  for (const d of ['{', '{"version":2}']) {
    data = d
    expect(leer(storage).completados).toEqual([])
  }
  expect(
    guardar(p, () => {
      throw Error()
    }),
  ).toBe(false)
  expect(p.completados).toEqual(['recta', 'curva'])
})

it('acredita La recta una vez al abrir un progreso anterior', () => {
  const anterior = { version: 1, completados: ['curva', 'libro'], audio: false, movimiento: 'reducido' }
  let data = JSON.stringify(anterior)
  let escrituras = 0
  const storage = () => ({
    getItem: () => data,
    setItem: (_key: string, value: string) => { data = value; escrituras++ },
  })
  const esperado = { ...anterior, campana: 2, puenteAnterior: false, completados: ['recta', 'curva', 'libro'], volumenes: { musica: 40, mesa: 85, ambiente: 25, interfaz: 65 } }
  expect(leer(storage)).toEqual(esperado)
  expect(leer(storage)).toEqual(esperado)
  expect(JSON.parse(data)).toEqual(esperado)
  expect(escrituras).toBe(1)
  expect(leer(() => ({ getItem: () => JSON.stringify(anterior), setItem: () => { throw Error() } }))).toEqual(esperado)
})

it('mantiene el acceso antiguo al puente y exige la puerta en una campaña nueva', () => {
  const datos = { version: 1, audio: false, movimiento: 'reducido', completados: ['subibaja'] }
  const leerComo = (p: object) => leer(() => ({ getItem: () => JSON.stringify(p), setItem() { } }))
  const anterior = leerComo(datos), actual = leerComo({ ...datos, campana: 2 })
  expect(anterior.completados).not.toContain('puerta')
  expect(disponible(nivelPorId('puerta'), anterior)).toBe(true)
  expect(disponible(nivelPorId('puente'), anterior)).toBe(true)
  expect(disponible(nivelPorId('puente'), actual)).toBe(false)
})
