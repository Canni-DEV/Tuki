import { beforeAll, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { Editor, validarPieza } from '../src/editor'
import { nivelPorId, surfaceRect } from '../src/levels'
import { initPhysics, Simulation } from '../src/simulation'
import { armadoDeMesa, faltantes, leerMesa, mesaNueva, nivelTaller } from '../src/taller'
import type { Armado, IdNivel, PiezaColocada, TipoColocable, Vec3 } from '../src/types'
import { readFileSync } from 'node:fs'

beforeAll(initPhysics)
function pieza(id: string, tipo: TipoColocable, posicion: Vec3, apoyo = 'tablero'): PiezaColocada {
  return { id, tipo, posicion, giroY: 0, apoyo }
}
const fixture = (id: string): Armado => JSON.parse(readFileSync(new URL('./fixtures/' + id + '.json', import.meta.url), 'utf8')).armado

it('mueve una pila como una acción y restaura la pose ante una colisión', () => {
  const n = nivelTaller('Mis libros'), editor = new Editor(n)
  const doc = {
    ...mesaNueva(n.nombre), piezas: [
      pieza('a', 'libro', [0, 0, 0]), pieza('b', 'libro', [0, .018, 0], 'a/apoyo'),
      pieza('ficha', 'domino', [.015, .036, 0], 'b/apoyo'), pieza('vaso', 'vasito', [.17, 0, 0]),
    ]
  }
  editor.cargar(armadoDeMesa(n, leerMesa(doc)))
  const antes = structuredClone(editor.armado)
  editor.seleccion = 'a'
  expect(editor.retirar()).toBe(false)
  expect(editor.mover({ ...antes.piezas[0], posicion: [.17, 0, 0] })).toBe(false)
  expect(editor.armado).toEqual(antes)
  expect(editor.mover({ ...antes.piezas[0], posicion: [0, 0, .1], giroY: 90 })).toBe(true)
  expect(editor.armado.piezas[2].posicion[2]).toBeCloseTo(.085)
  expect(editor.armado.piezas[2].giroY).toBe(90)
  editor.deshacer()
  expect(editor.armado).toEqual(antes)
})

it('valida extremos, apoyos y permisos también al importar una mesa', () => {
  const doc = mesaNueva('Desde una amiga')
  doc.piezas = [pieza('libro', 'libro', [0, 0, 0]), pieza('inicio', 'inicio', [0, .018, 0], 'libro/apoyo')]
  expect(faltantes(leerMesa(doc), ['recta'])).toEqual(['libro'])
  expect(faltantes(doc, ['recta', 'libro'])).toEqual([])
  for (const piezas of [
    [...doc.piezas, doc.piezas[0]], [pieza('meta', 'domino', [0, 0, 0])],
    [pieza('a', 'libro', [0, 0, 0], 'a/apoyo')], [pieza('a', 'bolita', [0, 0, 0], 'b/apoyo')],
    [pieza('inicio', 'inicio', [1, 0, 0])], Array(101).fill(doc.piezas[0]),
  ]) expect(() => leerMesa({ ...doc, piezas })).toThrow()
  expect(leerMesa(mesaNueva('Borrador')).piezas).toEqual([])
})

it('respeta los cien objetos y permite retirar y reutilizar la plaza', () => {
  const armado = fixture('taller100'), n = nivelTaller('Cien'), editor = new Editor(n)
  editor.cargar(armado)
  expect(editor.disponibles('bolita')).toBe(0)
  expect(editor.agregar([pieza('otra', 'estampa', [0, 0, .25])])).toBe(false)
  editor.seleccion = armado.piezas.at(-1)!.id
  expect(editor.retirar()).toBe(true)
  expect(editor.agregar([pieza('otra', 'estampa', [0, 0, .24])])).toBe(true)
})

it.each(['llave', 'puente'] as const)('cada %s responde sólo a su propio disparador', tipo => {
  const n = nivelTaller('Dos mecanismos'), doc = mesaNueva(n.nombre)
  const latch = tipo === 'puente' ? [-.027, .002, -.004] : [-.03, 0, -.018]
  doc.piezas = [pieza('a', tipo, [0, 0, 0]), pieza('b', tipo, [.2, 0, 0]),
  pieza('inicio', 'inicio', [latch[0], 0, latch[2] - .026]), pieza('meta', 'meta', [-.3, 0, .2])]
  const sim = new Simulation(n, armadoDeMesa(n, doc))
  try {
    const eventos = []
    for (let i = 0; i < 250; i++)eventos.push(...sim.step())
    expect(eventos.filter(e => e.tipo === 'llave').map(e => e.b)).toEqual([tipo === 'puente' ? 'a/leaf' : 'a/gate'])
    expect(eventos.find(e => e.tipo === 'llave')?.materialB).toBe(tipo === 'puente' ? 'leaf' : 'gate')
    if (tipo === 'puente') {
      expect(Math.abs(sim.actors.get('a/leaf')!.body.rotation().x)).toBeLessThan(.15)
      expect(Math.abs(sim.actors.get('b/leaf')!.body.rotation().x)).toBeGreaterThan(.4)
    }
  } finally { sim.dispose() }
})

it('sigue el material de cada bolita y pierde sólo la rodadura que se levanta', () => {
  const n = nivelTaller('Dos bolitas'), doc = mesaNueva(n.nombre)
  doc.piezas = [
    pieza('inicio', 'inicio', [-.23, 0, -.2]), pieza('meta', 'meta', [.23, 0, .2]),
    pieza('tomo', 'libro', [.12, 0, 0]), pieza('azul', 'bolita', [.12, .026, 0], 'tomo/apoyo'),
    pieza('ocre', 'bolita', [-.12, .008, 0]),
  ]
  const sim = new Simulation(n, armadoDeMesa(n, doc))
  try {
    for (let i = 0; i < 5; i++) sim.step()
    for (const id of ['azul', 'ocre']) sim.actors.get(id)!.body.setLinvel({ x: .06, y: 0, z: 0 }, true)
    sim.step()
    expect(sim.rodaduras.get('azul')?.material).toBe('book')
    expect(sim.rodaduras.get('ocre')?.material).toBe('table')
    expect([...sim.rodaduras.values()].every(r => r.velocidad > .015)).toBe(true)
    sim.actors.get('azul')!.body.setTranslation({ x: .12, y: .1, z: 0 }, true)
    sim.step()
    expect(sim.rodaduras.has('azul')).toBe(false)
    expect(sim.rodaduras.has('ocre')).toBe(true)
  } finally { sim.dispose() }
})

function ejecutar(m: Armado) {
  const n = nivelPorId(m.nivel)
  new Editor(n).cargar(m)
  const sim = new Simulation(n, m)
  try {
    const eventos = []
    for (let i = 0; i < 5000 && !sim.result; i++) eventos.push(...sim.step())
    return { resultado: sim.result, eventos, poses: sim.poses() }
  } finally { sim.dispose() }
}
it.each(['vuelta', 'subibaja', 'puente'] as IdNivel[])('%s gana por la cadena, admite una corrección y permite otra colocación', id => {
  const m = fixture(id), original = structuredClone(m)
  const bien = ejecutar(m)
  expect(bien.resultado).toBe('victoria')
  expect(bien.eventos.filter(e => e.tipo === 'empujon')).toHaveLength(1)
  if (id === 'puente' || id === 'subibaja') {
    expect(bien.eventos.some(e => e.tipo === 'tope' && e.materialA === (id === 'puente' ? 'leaf' : 'lever'))).toBe(true)
  }
  const roto = id === 'puente' ? fixture('puente-tarde') : m
  if (id !== 'puente') {
    const desplazada = roto.piezas.find(p => p.id === (id === 'subibaja' ? 'd2' : 's0'))!
    desplazada.apoyo = 'tablero'
    desplazada.posicion = [.17, 0, .12]
  }
  const fallo = ejecutar(roto)
  expect(fallo.resultado).toBe('detenida')
  if (id === 'puente') {
    const caida = fallo.eventos.find(e => e.tipo === 'impacto' && [e.a, e.b].includes('bola2') && [e.a, e.b].includes('bandeja'))!
    expect(caida.paso).toBeLessThan(fallo.eventos.find(e => e.tipo === 'llave' && e.a === 'cruce/latch')!.paso)
    const bandeja = nivelPorId(id).fijos.find(o => o.id === 'bandeja')!
    const [x, y, z] = fallo.poses.get('bola2')!.p
    expect(Math.abs(x - bandeja.posicion[0])).toBeLessThan(.024)
    expect(Math.abs(z - bandeja.posicion[2])).toBeLessThan(.021)
    expect(y).toBeLessThan(.013)
    const abrir = bien.eventos.find(e => e.tipo === 'llave' && e.a === 'cruce/latch')!.paso
    const cruzar = bien.eventos.find(e => e.tipo === 'impacto' && [e.a, e.b].includes('bola2') && [e.a, e.b].includes('cruce/leaf'))!.paso
    expect(abrir).toBeLessThan(cruzar)
  }
  const variante = structuredClone(original)
  const ultima = variante.piezas.find(p => p.id === (id === 'vuelta' ? 's2' : id === 'subibaja' ? 'fin2' : 'receptor'))!
  ultima.giroY += 2
  expect(ejecutar(variante).resultado).toBe('victoria')
  expect(ejecutar(original)).toEqual(bien)
})

it('El subibaja recibe la caída en la cazoleta y lanza la segunda bola sobre el libro desde el inicio', () => {
  const n = nivelPorId('subibaja'), editor = new Editor(n)
  editor.cargar(editor.armado)
  const balancin = editor.armado.piezas.find(p => p.tipo === 'balancin')!
  const salida = n.fijos.find(p => p.id === 'cuna')!
  const libro = surfaceRect(n, 'tapa-recepcion')
  expect(balancin.giroY).toBe(salida.giroY)
  expect(balancin.posicion[2]).toBeCloseTo(salida.posicion[2])
  expect(balancin.posicion[2]).toBeCloseTo(libro.z)

  const sim = new Simulation(n, editor.armado)
  const brazo = sim.actors.get('lever/lever')!.body
  const bola = sim.actors.get('bola')!.body
  const segunda = sim.actors.get('bola2')!.body
  let impacto: Vector3 | undefined
  let lanzada = false, sobreElLibro = false
  try {
    for (let i = 0; i < 240 && !sim.result; i++) {
      for (const evento of sim.step()) {
        if (evento.tipo !== 'activo') continue
        if (evento.a === 'bola' && evento.b === 'lever/lever')
          impacto = new Vector3().copy(bola.translation()).sub(brazo.translation())
            .applyQuaternion(new Quaternion().copy(brazo.rotation()).invert())
        if (impacto && evento.a === 'lever/lever' && evento.b === 'bola2') lanzada = true
      }
      const { x, y, z } = segunda.translation()
      if (lanzada && Math.abs(x - libro.x) < libro.w / 2 && Math.abs(z - libro.z) < libro.d / 2 && y > libro.y + .008)
        sobreElLibro = true
    }
    // The receiving cup is centred at -33 mm along the board and has a 16 mm opening.
    expect(impacto, 'La primera bola debe golpear la cazoleta receptora').toBeDefined()
    expect(Math.abs(impacto!.z + .033)).toBeLessThan(.008)
    expect(Math.abs(impacto!.x)).toBeLessThan(.013)
    expect(sobreElLibro).toBe(true)
    expect(sim.activas.has('meta')).toBe(false)
  } finally { sim.dispose() }
})

it('la cazoleta mantiene la bola hasta el impacto y acompaña el giro del balancín', () => {
  const n = nivelPorId('subibaja'), editor = new Editor(n)
  const lever = editor.armado.piezas.find(p => p.tipo === 'balancin')!
  editor.seleccion = 'bola'
  expect(editor.retirar()).toBe(true)
  const bolaCargada = editor.armado.piezas.find(p => p.id === 'bola2')!
  expect(editor.mover({ ...lever, giroY: 0 })).toBe(true)
  const nueva = editor.armado.piezas.find(p => p.id === 'bola2')!
  expect(nueva.posicion[0]).toBeCloseTo(lever.posicion[0], 6)
  expect(nueva.posicion[2] - lever.posicion[2]).toBeCloseTo(bolaCargada.posicion[0] - lever.posicion[0], 6)
  const sim = new Simulation(n, editor.armado)
  const inicial = sim.actors.get('bola2')!.body.translation()
  try {
    for (let i = 0; i < 120; i++) sim.step()
    const pos = sim.actors.get('bola2')!.body.translation()
    expect(Math.hypot(pos.x - inicial.x, pos.z - inicial.z)).toBeLessThan(.005)
    expect(sim.activas.has('bola2')).toBe(false)
  } finally { sim.dispose() }
})

it.each(['vuelta', 'subibaja', 'puente'] as const)('%s se completa desde el armado inicial del jugador', id => {
  const n = nivelPorId(id), e = new Editor(n), referencia = fixture(id)
  const inicial = structuredClone(e.armado)
  e.cargar(inicial)
  for (const p of referencia.piezas) {
    const existente = e.armado.piezas.find(item => item.id === p.id)
    if (!existente) expect(e.agregar([p])).toBe(true)
    else if (existente.giroY !== p.giroY) expect(e.mover(p)).toBe(true)
  }
  expect(ejecutar(e.armado).resultado).toBe('victoria')
})

it('exige ambos pies de la cuna y deja volar el brazo del balancín sobre el borde', () => {
  const n = nivelTaller('Apoyos')
  expect(validarPieza(n, pieza('c', 'cuna', [.417, 0, 0]), [])).toBe('Apoyá toda la base')
  expect(validarPieza(n, pieza('c', 'cuna', [.408, 0, 0]), [])).toBeNull()
  expect(validarPieza(n, pieza('b', 'balancin', [0, 0, .245]), [])).toBeNull()
})

it('comprueba también las bandejas alejadas del pivote de dos llaves', () => {
  const n = nivelTaller('Dos desvíos')
  const a = pieza('llave-a', 'llave', [0, 0, 0])
  const b = { ...pieza('llave-b', 'llave', [.1, 0, .13]), giroY: 180 }
  expect(validarPieza(n, b, [a])).toBe('Separá las piezas')
})

it('El subibaja admite un tiro oblicuo que aterriza una ficha más lejos', () => {
  const editor = new Editor(nivelPorId('subibaja'))
  editor.cargar(fixture('subibaja'))
  editor.seleccion = 'fin0'
  expect(editor.retirar()).toBe(true)
  const lever = editor.armado.piezas.find(p => p.id === 'lever')!
  expect(editor.mover({ ...lever, posicion: [.028, 0, -.006], giroY: 84 })).toBe(true)
  const receptor = editor.armado.piezas.find(p => p.id === 'fin1')!
  expect(editor.mover({ ...receptor, posicion: [.115, .018, .001] })).toBe(true)
  const { resultado, eventos } = ejecutar(editor.armado)
  expect(eventos.some(e => e.tipo === 'activo' && e.a === 'bola2' && e.b === 'fin1')).toBe(true)
  expect(resultado).toBe('victoria')
})

it('El puente a tiempo se puede ganar rodeando el hueco por las gradas', () => {
  const editor = new Editor(nivelPorId('puente'))
  editor.cargar(fixture('puente'))
  for (const id of ['receptor', 'martillo', 'bola2', 'lever', 'codo', 'bola', 'd3', 'd2']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(true)
  }
  const relevo = [
    { ...pieza('', 'domino', [.19, .019, -.135], 'tapa-pie-pendulo'), giroY: 125 },
    { ...pieza('', 'domino', [.214, .004, -.157], 'tapa-isla'), giroY: 125 },
    { ...pieza('', 'domino', [.221, .004, -.168], 'tapa-isla'), giroY: 130 },
  ]
  expect(editor.agregar(relevo)).toBe(true)
  const { resultado, eventos } = ejecutar(editor.armado)
  const golpes = eventos.filter(e => e.tipo === 'activo').map(e => [e.a, e.b])
  expect(golpes).toEqual(expect.arrayContaining([
    ['rama12', 'pieza-1'], ['pieza-1', 'pieza-2'], ['pieza-2', 'pieza-3'], ['pieza-3', 'meta'],
  ]))
  expect(resultado).toBe('victoria')
})
