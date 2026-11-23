import { beforeAll, expect, it } from 'vitest'
import { Editor, validarPieza } from '../src/editor'
import { baseMesa } from '../src/mesas'
import { conApoyos, surfaceRect } from '../src/levels'
import { initPhysics } from '../src/simulation'
import { armadoDeMesa, leerMesa, nivelTaller } from '../src/taller'
import type { PiezaColocada, Vec3 } from '../src/types'
import { mesaLibrosTrazo, mesaPuenteTrazo } from './libros-trazo'

beforeAll(initPhysics)

function libros(alturas = [.018, .018, .018], hueco = 0, giro = 0) {
  const n = baseMesa('Prueba de juntas')
  n.contexto = 'campana'
  const ang = giro * Math.PI / 180
  const punto = (x: number, y = alturas[0]): Vec3 => [x * Math.cos(ang), y, -x * Math.sin(ang)]
  alturas.forEach((y, i) => {
    const id = 'libro-' + i
    n.fijos.push({ id, activo: 'book', rol: 'escenario', posicion: punto((i - 1) * .14 + i * hueco, 0),
      escala: [1, y / .018, 1], giroY: giro, apoyo: 'tablero' })
    n.superficies.push({ id: id + '/apoyo', objeto: id, zona: 'tapa', admite: ['domino'] })
  })
  return { n, e: new Editor(n), punto }
}

it.each([0, 32, 90])('atraviesa tres libros y una ficha comparte la junta coplanar con giro %s°', giro => {
  const { n, e, punto } = libros(undefined, 0, giro)
  const fila = e.trazar([punto(-.178), punto(.178)], 'libro-0/apoyo')
  expect(fila.error).toBeNull()
  expect(fila.piezas).toHaveLength(14)
  expect(new Set(fila.piezas.map(p => p.apoyo)).size).toBe(3)
  expect(fila.piezas[4].apoyos).toEqual(['libro-0/apoyo', 'libro-1/apoyo'])
  expect(fila.piezas.every(p => !validarPieza(n, p, fila.piezas))).toBe(true)
  expect(e.agregar(fila.piezas)).toBe(true)
  expect(e.historia).toHaveLength(1)
  e.deshacer()
  expect(e.armado.piezas).toEqual([])
})

it.each([[.018, .019, .021], [.021, .019, .018], [.018, .020, .018]])(
  'cruza tapas de %s, %s y %s m, ajustando las bases al subir y bajar', (a, b, c) => {
    const { n, e, punto } = libros([a, b, c])
    const fila = e.trazar([punto(-.178), punto(.178)], 'libro-0/apoyo')
    expect(fila.error).toBeNull()
    expect(fila.piezas.at(-1)!.posicion[0]).toBeGreaterThan(.15)
    expect(new Set(fila.piezas.map(p => p.apoyo)).size).toBe(3)
    for (const p of fila.piezas) {
      expect(p.posicion[1]).toBeCloseTo(surfaceRect(n, p.apoyo).y, 10)
      expect(validarPieza(n, p, fila.piezas)).toBeNull()
    }
    for (let i = 1; i < fila.piezas.length; i++) {
      const distancia = fila.piezas[i].posicion[0] - fila.piezas[i - 1].posicion[0]
      expect(distancia).toBeGreaterThanOrEqual(.027 - 1e-9)
      expect(distancia).toBeLessThanOrEqual(.035 + 1e-9)
    }
    expect(e.agregar(fila.piezas)).toBe(true)
  },
)

it.each([.020001, .015999])('corta un desnivel mayor a 2 mm incluso en un arrastre rápido (%s m)', altura => {
  const { e, punto } = libros([.018, altura, .018])
  const fila = e.trazar([punto(-.178), punto(.178)], 'libro-0/apoyo')
  expect(fila.error).toBe('El desnivel supera los 2 mm')
  expect(fila.piezas.length).toBeGreaterThan(0)
  expect(fila.piezas.every(p => p.apoyo === 'libro-0/apoyo')).toBe(true)
})

it('detecta una ranura de medio milímetro aunque el mouse cruce los tres libros de una vez', () => {
  const { n, e, punto } = libros(undefined, .0005)
  const fila = e.trazar([punto(-.178), punto(.178)], 'libro-0/apoyo')
  expect(fila.error).toBe('El desnivel supera los 2 mm')
  expect(fila.piezas.every(p => p.apoyo === 'libro-0/apoyo')).toBe(true)
  const junta: PiezaColocada = { id: 'junta', tipo: 'domino', posicion: punto(-.07), giroY: 90, apoyo: 'libro-0/apoyo' }
  expect(validarPieza(n, junta, [])).toBe('Apoyá toda la base')
})

it('no atraviesa un obstáculo que queda entre dos centros de fichas', () => {
  const { n, e, punto } = libros()
  n.fijos.push({ id: 'pared', activo: 'book', posicion: [-.1375, .018, 0], giroY: 0,
    escala: [.001 / .14, 3, 1], rol: 'escenario', apoyo: 'libro-0/apoyo' })
  const fila = e.trazar([punto(-.178), punto(.178)], 'libro-0/apoyo')
  expect(fila.error).toBe('Separá las piezas')
  expect(fila.piezas.every(p => p.posicion[0] < -.1375)).toBe(true)
})

function puente(bajo = false) {
  const doc = leerMesa(mesaPuenteTrazo(bajo))
  const n = nivelTaller(doc.nombre), e = new Editor(n)
  e.cargar(armadoDeMesa(n, doc))
  return { e, techo: surfaceRect(conApoyos(n, e.armado.piezas), 'cubierta/apoyo').y }
}

it('traza por debajo de un puente con espacio libre sin saltar a la cubierta', () => {
  const { e, techo } = puente()
  // A pointer sample can land on the lid even though the row stays on the table.
  const fila = e.trazar([[0, 0, -.17], [0, techo, 0], [0, 0, .17]], 'tablero')
  expect(fila.error).toBeNull()
  expect(fila.altura).toBe(0)
  expect(fila.piezas.at(-1)!.posicion[2]).toBeGreaterThan(.14)
  expect(fila.piezas.every(p => p.apoyo === 'tablero' && p.posicion[1] === 0)).toBe(true)
  expect(e.agregar(fila.piezas)).toBe(true)
})

it('mantiene la cubierta como apoyo cuando el trazo comienza arriba', () => {
  const { e, techo } = puente()
  const fila = e.trazar([[0, techo, -.08], [0, techo, .08]], 'cubierta/apoyo')
  expect(fila.error).toBeNull()
  expect(fila.altura).toBe(techo)
  expect(fila.piezas.length).toBeGreaterThan(3)
  expect(fila.piezas.every(p => p.apoyo === 'cubierta/apoyo' && p.posicion[1] === techo)).toBe(true)
})

it('no atraviesa un puente demasiado bajo para las fichas', () => {
  const { e } = puente(true)
  const fila = e.trazar([[0, 0, -.17], [0, 0, .17]], 'tablero')
  expect(fila.error).toBe('El desnivel supera los 2 mm')
  expect(fila.piezas.length).toBeGreaterThan(0)
  expect(fila.piezas.every(p => p.apoyo === 'tablero' && p.posicion[2] < -.105)).toBe(true)
})

it.each([false, true])('confirma, guarda, carga y deshace una fila sobre libros reales (desnivel: %s)', desnivel => {
  const doc = mesaLibrosTrazo(desnivel), n = nivelTaller(doc.nombre), e = new Editor(n)
  e.cargar(armadoDeMesa(n, leerMesa(doc)))
  const antes = structuredClone(e.armado)
  const x = desnivel ? .193 : .178
  const fila = e.trazar([[-x, .018, 0], [x, .018, 0]], 'libro-0/apoyo')
  expect(fila.error).toBeNull()
  expect(fila.piezas.at(-1)!.apoyo).toBe('libro-2/apoyo')
  expect(e.agregar(fila.piezas)).toBe(true)
  const cargada = leerMesa({ ...doc, piezas: e.armado.piezas })
  expect(cargada.piezas).toEqual(e.armado.piezas)
  const superficies = conApoyos(n, e.armado.piezas)
  for (const p of fila.piezas) expect(p.posicion[1]).toBe(surfaceRect(superficies, p.apoyo).y)
  if (!desnivel) {
    e.seleccion = 'libro-0'
    expect(e.retirar()).toBe(false)
  }
  e.deshacer()
  expect(e.armado).toEqual(antes)
})

it('la sesión incremental coincide con el cálculo completo al crecer, retroceder y corregir una curva', () => {
  const e = new Editor(baseMesa('Curva incremental')), sesion = e.iniciarTrazo('tablero')
  const muestras: Vec3[] = Array.from({ length: 100 }, (_, i) => [-.30 + .60 * i / 99, 0, .06 * Math.sin(i / 99 * Math.PI * 2)])
  for (const longitud of [...Array.from({ length: 99 }, (_, i) => i + 2), 45, 2, 1, 0, 60, 100]) {
    const puntos = muestras.slice(0, longitud)
    const resultado = sesion.evaluar(puntos), copia = structuredClone(resultado)
    expect(resultado).toEqual(e.trazar(puntos, 'tablero'))
    sesion.evaluar([...puntos, [.40, 0, .24]])
    expect(resultado).toEqual(copia)
  }
})

it.each([0, 32])('restaura altura y separación pendiente en juntas al agregar muestras (%s°)', giro => {
  const { e, punto } = libros([.018, .020, .018], 0, giro)
  const sesion = e.iniciarTrazo('libro-0/apoyo'), muestras: Vec3[] = []
  for (let x = -.178; x <= .178; x += .003) {
    muestras.push(punto(x))
    expect(sesion.evaluar(muestras)).toEqual(e.trazar(muestras, 'libro-0/apoyo'))
  }
  // An invalid provisional endpoint must not poison a subsequent valid route.
  sesion.evaluar([punto(-.178), punto(-.10), [.5, 0, .5]])
  expect(sesion.evaluar(muestras)).toEqual(e.trazar(muestras, 'libro-0/apoyo'))
})

it('nunca adelanta la primera ficha para que quepa y permite corregir su orientación', () => {
  const e = new Editor(baseMesa('Inicio exacto')), sesion = e.iniciarTrazo('tablero')
  const invalida = sesion.evaluar([[-.417, 0, 0], [-.30, 0, 0]])
  expect(invalida.piezas).toEqual([])
  expect(invalida.error).toBe('Apoyá toda la base')
  expect(invalida.inicio?.posicion).toEqual([-.417, 0, 0])
  const borde: Vec3 = [-.414, 0, 0]
  expect(sesion.evaluar([borde, [-.414, 0, .1]]).piezas).toEqual([])
  const corregida = sesion.evaluar([borde, [-.30, 0, 0]])
  expect(corregida.error).toBeNull()
  expect(corregida.piezas[0].posicion).toEqual(borde)
})

it('invalida sesiones al editar o deshacer y reconstruye los obstáculos', () => {
  const n = baseMesa('Caché'), e = new Editor(n)
  n.contexto = 'campana'
  const puntos: Vec3[] = [[-.15, 0, .10], [.15, 0, .10]]
  const sesion = e.iniciarTrazo('tablero'), antes = sesion.evaluar(puntos)
  expect(e.agregar([{ id: 'pared', tipo: 'domino', apoyo: 'tablero', posicion: [0, 0, .10], giroY: 0 }])).toBe(true)
  expect(sesion.evaluar(puntos).error).toBe('El armado cambió')
  const nueva = e.iniciarTrazo('tablero'), cortada = nueva.evaluar(puntos)
  expect(cortada.error).toBe('Separá las piezas')
  expect(cortada.piezas.length).toBeLessThan(antes.piezas.length)
  e.deshacer()
  expect(nueva.evaluar(puntos).error).toBe('El armado cambió')
  expect(e.trazar(puntos, 'tablero')).toEqual(antes)
})
