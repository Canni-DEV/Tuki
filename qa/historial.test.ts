import { beforeAll, expect, it } from 'vitest'
import { Editor } from '../src/editor'
import { initPhysics } from '../src/simulation'
import { nivelPorId } from '../src/levels'
import { armadoDeMesa, mesaNueva, nivelTaller } from '../src/taller'
import type { PiezaColocada } from '../src/types'

beforeAll(initPhysics)
const ficha = (x: number): PiezaColocada => ({ id: 'nueva', tipo: 'domino', posicion: [x, 0, .08], giroY: 90, apoyo: 'tablero' })

it('rehace IDs, saldo y selección; solamente una edición confirmada descarta el futuro', () => {
  const e = new Editor(nivelPorId('curva'))
  expect(e.agregar([ficha(0)])).toBe(true)
  const antes = structuredClone(e.armado), seleccion = e.seleccion
  expect(e.retirar()).toBe(true)
  const retirada = structuredClone(e.armado)
  e.deshacer()
  expect(e.armado).toEqual(antes)
  expect(e.seleccion).toBe(seleccion)
  e.rehacer()
  expect(e.armado).toEqual(retirada)
  expect(e.seleccion).toBeNull()
  e.deshacer()
  expect(e.agregar([ficha(0)])).toBe(false)
  expect(e.futuro).toHaveLength(1)
  expect(e.agregar([ficha(.06)])).toBe(true)
  expect(e.futuro).toHaveLength(0)
  const editado = e.armado
  e.rehacer()
  expect(e.armado).toBe(editado)
})

it('un rechazo o cancelación del worker conserva ambas pilas y una confirmación registra una sola acción', async () => {
  const e = new Editor(nivelPorId('curva'))
  e.agregar([ficha(0)]); e.agregar([ficha(.06)]); e.deshacer()
  const antes = e.armado
  expect(await e.editarValidado(b => b.agregar([ficha(-.06)]), async () => ({ pieza: 'nueva', mensaje: 'Inestable' }), () => true)).toBe(false)
  expect(await e.editarValidado(b => b.agregar([ficha(-.06)]), async () => null, () => false)).toBe(false)
  expect(e.armado).toBe(antes)
  expect(e.historia).toHaveLength(1)
  expect(e.futuro).toHaveLength(1)
  expect(await e.editarValidado(b => b.agregar([ficha(-.06)]), async () => null, () => true)).toBe(true)
  const despues = structuredClone(e.armado), seleccion = e.seleccion
  expect(e.historia).toHaveLength(2)
  expect(e.futuro).toHaveLength(0)
  e.deshacer(); e.rehacer()
  expect(e.armado).toEqual(despues)
  expect(e.seleccion).toBe(seleccion)
})

it('rehace una fila entera como una sola operación', () => {
  const e = new Editor(nivelPorId('curva'))
  const fila = e.trazar([[-.1, 0, .08], [.1, 0, .08]], 'tablero')
  expect(e.agregar(fila.piezas)).toBe(true)
  const antes = structuredClone(e.armado)
  e.deshacer()
  expect(e.armado.piezas).toHaveLength(0)
  e.rehacer()
  expect(e.armado).toEqual(antes)
  expect(e.historia).toHaveLength(1)
})

it('rehace una pila y restaura cables y secuencias al retirar un mando', () => {
  const n = nivelTaller('Historial'), e = new Editor(n)
  const doc = mesaNueva(n.nombre)
  doc.piezas = [
    { id: 'base', tipo: 'libro', posicion: [0, 0, -.1], giroY: 0, apoyo: 'tablero' },
    { id: 'arriba', tipo: 'domino', posicion: [0, .018, -.1], giroY: 0, apoyo: 'base/apoyo' },
    { id: 'a', tipo: 'palanca', posicion: [-.1, 0, .1], giroY: 0, apoyo: 'tablero' },
    { id: 'b', tipo: 'palanca', posicion: [0, 0, .1], giroY: 0, apoyo: 'tablero' },
    { id: 'c', tipo: 'puerta', posicion: [.2, 0, .1], giroY: 0, apoyo: 'tablero' },
  ]
  e.cargar(armadoDeMesa(n, doc))
  e.seleccion = 'base'
  expect(e.mover({ ...e.armado.piezas[0], giroY: 15 })).toBe(true)
  const pila = structuredClone(e.armado)
  e.deshacer(); e.rehacer()
  expect(e.armado).toEqual(pila)
  e.conectar('a', 'c'); e.conectar('b', 'c'); e.configurarSecuencia('c', ['b', 'a'])
  const circuito = structuredClone(e.armado)
  e.seleccion = 'b'; expect(e.retirar()).toBe(true)
  const retirada = structuredClone(e.armado)
  e.deshacer(); expect(e.armado).toEqual(circuito)
  e.rehacer(); expect(e.armado).toEqual(retirada)
  e.cargar(circuito)
  expect(e.historia).toHaveLength(0); expect(e.futuro).toHaveLength(0)
})
