import { beforeAll, expect, it } from 'vitest'
import { baseCubierta, contactosDePieza } from '../src/contactos'
import { Editor, validarPieza } from '../src/editor'
import { predeterminadas } from '../src/dispositivos'
import { bases } from '../src/shapes'
import { initPhysics, Simulation } from '../src/simulation'
import { armadoDeMesa, leerMesa, nivelTaller } from '../src/taller'
import { apoyosDe, pieceAsset, tipos, type PiezaColocada, type TipoColocable, type Vec3 } from '../src/types'
import { alturaApoyos as altura, mesaApoyosCompartidos } from './apoyos-compartidos'

beforeAll(initPhysics)

function pieza(tipo: TipoColocable, giroY = 0): PiezaColocada {
  return { id: tipo === 'inicio' || tipo === 'meta' ? tipo : 'objeto', tipo, giroY,
    posicion: [0, altura + (tipo === 'bolita' ? .008 : 0), 0], apoyo: 'libro-0/apoyo' }
}

function abrir(cantidad: 2 | 3 = 2) {
  const doc = mesaApoyosCompartidos(cantidad), n = nivelTaller(doc.nombre), e = new Editor(n)
  e.cargar(armadoDeMesa(n, doc))
  return { doc, n, e }
}

it.each(tipos)('%s puede colocarse sobre la junta, girarse y guardar todos sus apoyos', tipo => {
  for (const giro of [0, 37, 90]) {
    const { doc, n, e } = abrir(), p = pieza(tipo, giro)
    // Hinges and switch stands have offset feet: centre the feet on the seam,
    // rather than assuming that every model pivot lies inside its support base.
    const ang = giro * Math.PI / 180
    const xs = bases(pieceAsset(tipo)).flat().map(([x, z]) => x * Math.cos(ang) + z * Math.sin(ang))
    if (xs.length) p.posicion[0] = -(Math.min(...xs) + Math.max(...xs)) / 2
    expect(validarPieza(n, p, doc.piezas)).toBeNull()
    expect(e.agregar([p]), JSON.stringify(e.fallo)).toBe(true)
    const colocada = e.armado.piezas.at(-1)!
    if (tipo === 'bolita') expect(apoyosDe(colocada)).toEqual(['libro-0/apoyo'])
    else expect(apoyosDe(colocada)).toEqual(['libro-0/apoyo', 'libro-1/apoyo'])
    expect(leerMesa({ ...doc, piezas: e.armado.piezas }).piezas).toEqual(e.armado.piezas)
    e.deshacer()
    expect(e.armado.piezas).toEqual(doc.piezas)
  }
})

it.each(['rampa', 'canal', 'curva90', 'embudo'] as const)('%s reparte su base entre tres libros y conserva las dependencias', tipo => {
  const { doc, e } = abrir(3)
  expect(e.agregar([pieza(tipo)])).toBe(true)
  const colocada = e.armado.piezas.at(-1)!, antes = structuredClone(e.armado)
  expect(apoyosDe(colocada)).toEqual(['libro-0/apoyo', 'libro-1/apoyo', 'libro-2/apoyo'])
  for (const libro of doc.piezas) {
    e.seleccion = libro.id
    expect(e.retirar()).toBe(false)
    expect(e.mover({ ...libro, posicion: [libro.posicion[0] * 1.2, 0, libro.posicion[2] * 1.2] })).toBe(false)
    expect(e.armado).toEqual(antes)
  }
  expect(e.mover({ ...colocada, posicion: [-.10, altura, 0], giroY: 90 })).toBe(true)
  expect(e.armado.piezas.at(-1)!.apoyos).toBeUndefined()
  expect(e.retirar()).toBe(true) // The last selected book is no longer needed.
  e.deshacer(); e.deshacer()
  expect(e.armado).toEqual(antes)
})

it.each(['rampa', 'canal', 'curva90', 'embudo'] as const)('%s rechaza huecos y tapas a distintas alturas', tipo => {
  const { n, doc } = abrir()
  const p = pieza(tipo, tipo === 'embudo' ? 90 : 0)
  for (const delta of [.0005, .002]) {
    const hueco = doc.piezas.map((libro, i) => i ? { ...libro, posicion: [.145 + delta, 0, 0] as Vec3 } : libro)
    expect(validarPieza(n, p, hueco)).toBeTruthy()
    const desnivel = doc.piezas.map((libro, i) => i ? { ...libro, posicion: [.145, delta, 0] as Vec3 } : libro)
    expect(validarPieza(n, p, desnivel)).toBeTruthy()
  }
})

it('la canaleta conserva el espacio libre entre sus pies y el embudo identifica la pata que falta', () => {
  const { n } = abrir()
  const apoyos: PiezaColocada[] = [-.012, .012].map((x, i) => ({ id: 'pie-' + i, tipo: 'taco',
    posicion: [x, 0, -.034], giroY: 0, apoyo: 'tablero' }))
  const delante = apoyos.map(p => ({ ...p, id: p.id + '-delante', posicion: [p.posicion[0], 0, .034] as Vec3 }))
  const canal: PiezaColocada = { ...pieza('canal'), posicion: [0, .018, 0], apoyo: 'pie-0/apoyo' }
  expect(validarPieza(n, canal, [...apoyos, ...delante])).toBeNull()
  const embudo: PiezaColocada = { ...pieza('embudo', 90), posicion: [0, .018, 0], apoyo: 'pie-0/apoyo' }
  // At 90 degrees the left leg is at Z=+.023; both patches cover that leg only.
  const izquierda = apoyos.map(p => ({ ...p, posicion: [p.posicion[0], 0, .023] as Vec3 }))
  expect(validarPieza(n, embudo, izquierda)).toBe('Falta apoyo en la pata derecha')
})

it('los contactos cubren las bases reales, sin sumar dos veces superficies superpuestas ni aceptar bases vacías', () => {
  const { doc, n } = abrir(), p = pieza('rampa')
  const contactos = contactosDePieza(n, p, doc.piezas)
  expect(baseCubierta(p, contactos)).toBe(true)
  const mitad = contactos.filter(c => c.apoyo === 'libro-0/apoyo')
  expect(baseCubierta(p, [...mitad, ...mitad])).toBe(false)
  expect(baseCubierta(pieza('bolita'), [])).toBe(false)
  expect(baseCubierta(p, contactos, bases(pieceAsset(p.tipo)).length)).toBe(false)
})

it.each(['lanzador', 'placa', 'elevador'] as const)('reconfigurar %s conserva los apoyos compartidos y deshacer recupera el estado', tipo => {
  const { e } = abrir()
  expect(e.agregar([pieza(tipo)])).toBe(true)
  const antes = structuredClone(e.armado), p = antes.piezas.at(-1)!
  const config = tipo === 'lanzador' ? { ...predeterminadas.lanzador, inclinacion: 60 as const } :
    tipo === 'placa' ? { ...predeterminadas.placa, inclinacion: 30 as const } : { ...predeterminadas.elevador, lastre: 24 as const }
  expect(e.configurarDispositivo(p.id, config)).toBe(true)
  expect(e.armado.piezas.at(-1)!.apoyos).toEqual(p.apoyos)
  e.deshacer()
  expect(e.armado).toEqual(antes)
})

it('el anclaje compartido de un mecanismo transmite el peso y rechaza una pila que vuelca', () => {
  const { n, doc } = abrir()
  const tacos: PiezaColocada[] = [-.0475, .0475].map((x, i) => ({ id: 'taco-' + i, tipo: 'taco',
    posicion: [x, 0, -.0115], giroY: 0, apoyo: 'tablero' }))
  const libros: PiezaColocada[] = [-.0475, .0475].map((x, i) => ({ id: 'libro-' + i, tipo: 'bolsillo',
    posicion: [x, .018, 0], giroY: 0, apoyo: 'taco-' + i + '/apoyo' }))
  const e = new Editor(n)
  e.cargar(armadoDeMesa(n, { ...doc, piezas: [...tacos, ...libros] }))
  const antes = e.armado
  expect(e.agregar([{ ...pieza('puente'), posicion: [0, .03, .01] }])).toBe(false)
  expect(e.fallo).not.toBeNull()
  expect(e.armado).toEqual(antes)
})

it.each(['rampa', 'canal', 'curva90'] as const)('%s funciona como piso fijo sobre tres libros mientras rueda una bolita', tipo => {
  const { e, n } = abrir(3)
  expect(e.agregar([pieza(tipo)])).toBe(true)
  const guia = e.armado.piezas.at(-1)!
  expect(e.agregar([
    { ...pieza('inicio'), posicion: [-.35, 0, -.18], apoyo: 'tablero' },
    { ...pieza('meta'), posicion: [.35, 0, .18], apoyo: 'tablero' },
    { ...pieza('bolita'), posicion: [.35, .008, 0], apoyo: 'tablero' },
  ])).toBe(true)
  const bolaId = e.armado.piezas.at(-1)!.id
  const sim = new Simulation(n, e.armado)
  try {
    const cuerpo = sim.actors.get(guia.id)!.body, bola = sim.actors.get(bolaId)!.body
    const posicion = cuerpo.translation(), rotacion = cuerpo.rotation()
    const z = -.035, pendiente = tipo === 'rampa' ? .0255 / .095 : .0105 / .09
    const superficie = tipo === 'rampa' ? .001 + (.0475 - z) * pendiente : .003 + (.045 - z) * pendiente
    bola.setTranslation(tipo === 'curva90' ? { x: -.0235, y: altura + .0091, z: -.0235 } :
      { x: 0, y: altura + superficie + .008 * Math.hypot(1, pendiente) + .0001, z }, true)
    if (tipo === 'curva90') {
      bola.setLinvel({ x: 0, y: 0, z: .3 }, true)
      bola.setAngvel({ x: .3 / .008, y: 0, z: 0 }, true)
    }
    let contacto = false, salida = false
    for (let paso = 0; paso < 480; paso++) {
      sim.world.step()
      sim.world.contactPairsWith(bola.collider(0), c => {
        if (c.parent()?.handle === cuerpo.handle) sim.world.contactPair(bola.collider(0), c, m => {
          if (m.numSolverContacts()) contacto = true
        })
      })
      expect(cuerpo.isFixed()).toBe(true)
      expect(cuerpo.translation()).toEqual(posicion)
      expect(cuerpo.rotation()).toEqual(rotacion)
      const actual = bola.translation()
      expect(actual.y).toBeGreaterThan(altura + .007)
      salida = tipo === 'curva90' ? actual.x > .025 && Math.abs(actual.z - .0235) < .01 : actual.z > .045
      if (salida) break
    }
    expect(contacto).toBe(true)
    expect(salida).toBe(true)
    for (const libro of e.armado.piezas.filter(p => p.tipo === 'atlasGrande'))
      expect(sim.actors.get(libro.id)!.body.isFixed()).toBe(true)
  } finally { sim.dispose() }
})
