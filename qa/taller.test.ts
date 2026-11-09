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
    [pieza('inicio', 'inicio', [1, 0, 0])],
  ]) expect(() => leerMesa({ ...doc, piezas })).toThrow()
  expect(leerMesa(mesaNueva('Borrador')).piezas).toEqual([])
})

it.each([1, 2])('abre mesas de versión %i con estampas y conserva las piezas y conexiones utilizables', version => {
  const doc = mesaNueva('Mi circuito')
  doc.piezas = [pieza('libro', 'libro', [0, 0, 0]), pieza('mando', 'palanca', [0, .018, 0], 'libro/apoyo'),
    pieza('puerta', 'puerta', [.2, 0, 0])]
  doc.conexiones = [{ mando: 'mando', receptor: 'puerta' }]
  const estampa = { id: 'flor', tipo: 'estampa', posicion: [0, .018, 0], apoyo: 'libro/apoyo', giroY: 30 }
  expect(leerMesa({ ...doc, version, piezas: [estampa, ...doc.piezas] })).toEqual(doc)
  expect(() => leerMesa({ ...doc, piezas: [{ ...estampa, tipo: 'desconocido' }] })).toThrow()
})

it('admite 200 piezas de un tipo y aplica el cupo total al colocar, trazar e importar', () => {
  const n = nivelTaller('Doscientas'), editor = new Editor(n)
  editor.cargar(fixture('taller100'))
  expect(editor.disponibles('domino')).toBe(100)

  const doc = mesaNueva(n.nombre)
  doc.piezas = Array.from({ length: 199 }, (_, i) =>
    pieza('f' + i, 'domino', [-.38 + (i % 20) * .04, 0, -.20 + Math.floor(i / 20) * .04]))
  editor.cargar(armadoDeMesa(n, leerMesa(doc)))
  expect(editor.disponibles('domino')).toBe(1)
  const ultima = pieza('ultima', 'domino', [0, 0, .22])
  const extra = pieza('inicio', 'inicio', [.12, 0, .22])
  expect(editor.agregar([ultima, extra])).toBe(false)
  expect(editor.armado.piezas).toHaveLength(199)
  const fila = editor.trazar([ultima.posicion, [.1, 0, .22]], 'tablero')
  expect(fila.piezas).toHaveLength(1)
  expect(editor.agregar(fila.piezas)).toBe(true)
  const llena = { ...doc, piezas: editor.armado.piezas }
  expect(leerMesa(llena).piezas).toHaveLength(200)
  expect(editor.disponibles('inicio')).toBe(0)
  expect(editor.agregar([extra])).toBe(false)
  const excedida = { ...llena, piezas: [...llena.piezas, extra] }
  expect(() => leerMesa(excedida)).toThrow('200')
  expect(() => editor.cargar(armadoDeMesa(n, excedida))).toThrow('200')
  expect(editor.retirar()).toBe(true)
  expect(editor.disponibles('inicio')).toBe(1)
  editor.deshacer()
  expect(editor.disponibles('inicio')).toBe(0)
  editor.seleccion = editor.armado.piezas.at(-1)!.id
  expect(editor.retirar()).toBe(true)
  expect(editor.agregar([extra])).toBe(true)
})

it.each(['llave', 'puenteClasico'] as const)('cada %s responde sólo a su propio disparador', tipo => {
  const n = nivelTaller('Dos mecanismos'), doc = mesaNueva(n.nombre)
  const latch = tipo === 'puenteClasico' ? [-.027, .002, -.004] : [-.03, 0, -.018]
  doc.piezas = [pieza('a', tipo, [0, 0, 0]), pieza('b', tipo, [.2, 0, 0]),
  pieza('inicio', 'inicio', [latch[0], 0, latch[2] - .026]), pieza('meta', 'meta', [-.3, 0, .2])]
  const sim = new Simulation(n, armadoDeMesa(n, doc))
  try {
    const eventos = []
    for (let i = 0; i < 250; i++)eventos.push(...sim.step())
    expect(eventos.filter(e => e.tipo === 'llave').map(e => e.b)).toEqual([tipo === 'puenteClasico' ? 'a/leaf' : 'a/gate'])
    expect(eventos.find(e => e.tipo === 'llave')?.materialB).toBe(tipo === 'puenteClasico' ? 'leaf' : 'gate')
    if (tipo === 'puenteClasico') {
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
    const tarde = fallo.eventos.find(e => e.tipo === 'llave' && e.a === 'paddle/paddle')!.paso
    const caida = fallo.eventos.find(e => e.tipo === 'impacto' && [e.a, e.b].includes('bola2') && [e.a, e.b].includes('mesa'))!
    expect(caida.paso).toBeLessThan(tarde)
    expect(fallo.eventos.some(e => e.tipo === 'activo' && e.b === 'receptor')).toBe(false)
    expect(fallo.eventos.some(e => e.tipo === 'impacto' && [e.a,e.b].includes('bola2') && [e.a,e.b].includes('cruce/leaf'))).toBe(false)
    const abrir = bien.eventos.find(e => e.tipo === 'llave' && e.a === 'paddle/paddle')!.paso
    const cruzar = bien.eventos.find(e => e.tipo === 'impacto' && [e.a, e.b].includes('bola2') && [e.a, e.b].includes('cruce/leaf'))!.paso
    const apoyado = bien.eventos.find(e => e.tipo === 'tope' && e.a === 'cruce/leaf')!.paso
    const entrega = bien.eventos.find(e => e.tipo === 'impacto' && [e.a, e.b].includes('bola2') && [e.a, e.b].includes('receptor'))!.paso
    expect(abrir).toBeLessThan(apoyado)
    expect(apoyado).toBeLessThan(cruzar)
    expect(cruzar).toBeLessThan(entrega)
    expect(roto.piezas.filter(p => !p.id.startsWith('rama'))).toEqual(original.piezas.filter(p => !p.id.startsWith('rama')))
  }
  const variante = structuredClone(original)
  const ultima = variante.piezas.find(p => p.id === (id === 'vuelta' ? 's2' : id === 'subibaja' ? 'fin2' : 'receptor'))!
  ultima.giroY += 2
  expect(ejecutar(variante).resultado).toBe('victoria')
  expect(ejecutar(original)).toEqual(bien)
})

it('El subibaja recibe la caída en la cazoleta y lanza la segunda bola sobre el libro desde el inicio', () => {
  const n = nivelPorId('subibaja'), editor = new Editor(n)
  editor.cargar(fixture('subibaja'))
  for (const id of ['fin0', 'fin1', 'fin2']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(true)
  }
  const balancin = editor.armado.piezas.find(p => p.tipo === 'balancin')!
  const salida = editor.armado.piezas.find(p => p.id === 'cuna')!
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
    // The centre of the arriving sphere can be one radius outside the rim at first contact.
    expect(impacto, 'La primera bola debe golpear la cazoleta receptora').toBeDefined()
    expect(Math.abs(impacto!.z + .033)).toBeLessThan(.016)
    expect(Math.abs(impacto!.x)).toBeLessThan(.013)
    expect(sobreElLibro).toBe(true)
    expect(sim.activas.has('meta')).toBe(true)
  } finally { sim.dispose() }
})

it('la cazoleta mantiene la bola hasta el impacto y acompaña el giro del balancín', () => {
  const n = nivelPorId('subibaja'), editor = new Editor(n)
  editor.cargar(fixture('subibaja'))
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

it.each(['recta', 's', 'rampa', 'taza-fichas', 'llave-abierta', 'vuelta', 'subibaja', 'puerta', 'puente'])(
  '%s se construye desde una bandeja llena y gana con un solo empujón', nombre => {
    const referencia = fixture(nombre), nivel = nivelPorId(referencia.nivel), editor = new Editor(nivel)
    expect(editor.armado.piezas).toEqual([])
    expect(nivel.fijos.every(p => ['escenario', 'inicio', 'meta'].includes(p.rol))).toBe(true)
    const ids = new Map<string, string>()
    for (const pieza of referencia.piezas) {
      const [base, superficie] = pieza.apoyo.split('/')
      const apoyo = superficie ? ids.get(base) + '/' + superficie : pieza.apoyo
      expect(editor.agregar([{ ...pieza, apoyo }]), pieza.id).toBe(true)
      ids.set(pieza.id, editor.seleccion!)
    }
    for (const cable of referencia.conexiones ?? [])
      expect(editor.conectar(ids.get(cable.mando)!, ids.get(cable.receptor)!)).toBe(true)
    for (const tipo of Object.keys(nivel.inventario) as TipoColocable[])
      expect(editor.disponibles(tipo), tipo).toBe(referencia.saldo[tipo] ?? 0)
    const intento = ejecutar(editor.armado)
    expect(intento.eventos.filter(e => e.tipo === 'empujon')).toHaveLength(1)
    expect(intento.resultado).toBe('victoria')
  },
)

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
  expect(editor.mover({ ...lever, posicion: [.022, 0, -.006], giroY: 84 })).toBe(true)
  const receptor = editor.armado.piezas.find(p => p.id === 'fin1')!
  expect(editor.mover({ ...receptor, posicion: [.10, .018, -.006] })).toBe(true)
  const { resultado, eventos } = ejecutar(editor.armado)
  expect(eventos.some(e => e.tipo === 'activo' && e.a === 'bola2' && e.b === 'fin1')).toBe(true)
  expect(resultado).toBe('victoria')
})

it('se puede rodear el cruce del último desafío por el costado de la mesa', () => {
  const editor = new Editor(nivelPorId('puente'))
  editor.cargar(fixture('puente'))
  for (const id of ['martillo', 'receptor']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(true)
  }
  const rodeo = [
    [.238, -.080, 133], [.256, -.102, 135], [.278, -.120, 156],
    [.282, -.146, 191], [.278, -.172, 214], [.253, -.189, 262],
  ]
  for (const [i, [x, z, giroY]] of rodeo.entries()) {
    const isla = i === rodeo.length - 1
    expect(editor.agregar([{ ...pieza('', 'domino', [x, isla ? .004 : 0, z], isla ? 'tapa-isla' : 'tablero'), giroY }])).toBe(true)
  }
  const { resultado, eventos } = ejecutar(editor.armado)
  expect(eventos.filter(e => e.tipo === 'llave')).toEqual([])
  expect(resultado).toBe('victoria')
})

it('registra dos apoyos coplanares del embudo y cancela mover o retirar un taco ocupado', () => {
  const n = nivelTaller('Dos patas'), editor = new Editor(n)
  const a = pieza('a', 'taco', [-.023, 0, 0]), b = pieza('b', 'taco', [.023, 0, 0])
  const embudo = pieza('embudo', 'embudo', [0, .018, 0], 'a/apoyo')
  const mesa = leerMesa({ ...mesaNueva(n.nombre), piezas: [a, b, embudo] })
  expect(mesa.piezas[2].apoyos).toEqual(['a/apoyo', 'b/apoyo'])
  expect(validarPieza(n, embudo, [a])).toMatch(/pata derecha/)
  expect(() => leerMesa({ ...mesa, piezas: [a, { ...b, posicion: [.023, .018, 0] }, embudo] })).toThrow()
  editor.cargar(armadoDeMesa(n, mesa))
  const antes = structuredClone(editor.armado)
  editor.seleccion = 'b'
  expect(editor.retirar()).toBe(false)
  expect(editor.mover({ ...b, posicion: [.07, 0, 0] })).toBe(false)
  expect(editor.armado).toEqual(antes)
  expect(editor.mover({ ...b, posicion: [.024, 0, 0] })).toBe(true)
  expect(editor.armado.piezas[2]).toEqual(antes.piezas[2])
  editor.deshacer()
  expect(editor.armado).toEqual(antes)
})

it('la cuna se apoya directamente en el libro o en su taco y se desmonta desde arriba', () => {
  const n = nivelPorId('libro'), editor = new Editor(n)
  editor.cargar(fixture('rampa'))
  for (const id of ['cuna', 'taco']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(false)
  }
  const origen = structuredClone(editor.armado)
  for (const id of ['bola', 'cuna', 'taco']) {
    editor.seleccion = id
    expect(editor.retirar()).toBe(true)
  }
  const taco = origen.piezas.find(p => p.id === 'taco')!
  expect(editor.agregar([{ ...taco, id: 'otra', tipo: 'cuna' }])).toBe(true)
  for (let i = 0; i < 4; i++) editor.deshacer()
  expect(editor.armado).toEqual(origen)
})

it('distingue un hueco real del choque entre la canaleta y la pata del embudo', () => {
  const n = nivelTaller('Desagüe')
  const canal = pieza('canal', 'canal', [0, 0, 0])
  expect(validarPieza(n, pieza('e', 'embudo', [0, 0, 0]), [canal])).toBeNull()
  expect(validarPieza(n, pieza('e', 'embudo', [.023, 0, 0]), [canal])).toBe('La pata izquierda toca la canaleta')
  expect(validarPieza(n, pieza('e', 'embudo', [0, 0, 0]), [pieza('libro', 'libro', [0, 0, 0])])).toMatch(/libro/)
})

it('dos mandos simultáneos accionan una sola vez cada salida y deshacer repone los cables', () => {
  const n = nivelTaller('Circuito'), doc = mesaNueva(n.nombre)
  doc.piezas = [pieza('a', 'palanca', [-.01, 0, 0]), pieza('b', 'palanca', [.01, 0, 0]),
  pieza('inicio', 'inicio', [0, 0, -.032]), pieza('meta', 'meta', [-.32, 0, .18]),
  pieza('c', 'puerta', [.16, 0, .025]), pieza('d', 'puente', [.25, 0, -.12])]
  const editor = new Editor(n)
  editor.cargar(armadoDeMesa(n, leerMesa(doc)))
  for (const [origen, destino] of [['a', 'c'], ['b', 'c'], ['b', 'd']]) expect(editor.conectar(origen, destino)).toBe(true)
  expect(editor.conectar('d', 'a')).toBe(false)
  const completo = structuredClone(editor.armado)
  expect(leerMesa({ ...doc, conexiones: completo.conexiones }).conexiones).toEqual(completo.conexiones)
  editor.seleccion = 'b'
  expect(editor.retirar()).toBe(true)
  expect(editor.armado.conexiones).toEqual([{ mando: 'a', receptor: 'c' }])
  editor.deshacer()
  expect(editor.armado).toEqual(completo)
  for (let intento = 1; intento <= 2; intento++) {
    const sim = new Simulation(n, editor.armado, intento)
    try {
      const eventos = []
      while (!sim.result && sim.tick < 1000) eventos.push(...sim.step())
      const avisos = eventos.filter(e => e.tipo === 'llave')
      expect(avisos.map(e => e.b).sort()).toEqual(['c/doorleaf', 'd/leaf'])
      expect(new Set(avisos.map(e => e.paso)).size).toBe(1)
      expect(sim.result).toBe('detenida')
    } finally { sim.dispose() }
  }
})

it('una bolita ya apoyada en el botón no arranca el motor', () => {
  const n = nivelTaller('Botón bajo carga'), doc = mesaNueva(n.nombre)
  doc.piezas = [pieza('boton', 'boton', [0, 0, 0]), pieza('peso', 'bolita', [0, .022, 0], 'boton/apoyo'),
  pieza('puerta', 'puerta', [.16, 0, .02]), pieza('inicio', 'inicio', [-.2, 0, 0]), pieza('meta', 'meta', [.3, 0, 0])]
  doc.conexiones = [{ mando: 'boton', receptor: 'puerta' }]
  const sim = new Simulation(n, armadoDeMesa(n, leerMesa(doc)))
  try {
    const eventos = []
    while (!sim.result && sim.tick < 1000) eventos.push(...sim.step())
    expect(eventos.filter(e => e.tipo === 'llave')).toEqual([])
    expect(sim.actors.get('puerta/doorleaf')!.body.isFixed()).toBe(true)
    expect(sim.result).toBe('detenida')
  } finally { sim.dispose() }
})

it('una obstrucción en el arco de la puerta permite construir y detiene la hoja físicamente', () => {
  const n = structuredClone(nivelPorId('puerta')), armado = fixture('puerta')
  n.fijos.push({
    id: 'freno', activo: 'casebox', rol: 'escenario', posicion: [.11, 0, .09],
    escala: [.06, 1, .06], giroY: 0, apoyo: 'tablero'
  })
  new Editor(n).cargar(armado)
  const sim = new Simulation(n, armado)
  try {
    const eventos = []
    while (!sim.result && sim.tick < 1000) eventos.push(...sim.step())
    expect(eventos.filter(e => e.tipo === 'llave')).toHaveLength(1)
    const giro = sim.actors.get('puerta/doorleaf')!.body.rotation().y
    expect(giro).toBeGreaterThan(.05)
    expect(giro).toBeLessThan(.25)
    expect(eventos.some(e => e.tipo === 'tope' && e.a === 'puerta/doorleaf')).toBe(false)
    expect(sim.result).toBe('detenida')
  } finally { sim.dispose() }
})

it('importa mecanismos integrados de la versión anterior y conserva el apoyo de su cuna', () => {
  const anterior = {
    ...mesaNueva('Mesa anterior'), version: 1, piezas: [pieza('cr', 'cuna', [0, 0, 0]),
    pieza('b', 'bolita', [0, .008, 0], 'cr/apoyo'), pieza('p', 'puente', [.15, 0, .1]), pieza('ll', 'llave', [-.2, 0, 0])]
  }
  const mesa = leerMesa(anterior)
  expect(mesa.piezas.map(p => p.tipo)).toEqual(['cunaClasica', 'bolita', 'puenteClasico', 'llave'])
  expect(leerMesa(mesa)).toEqual(mesa)
})

it('la hoja liberada por el cable queda apoyada por contacto en la otra orilla', () => {
  const sim = new Simulation(nivelPorId('puente'), fixture('puente'))
  try {
    for (let i = 0; i < 220; i++) sim.step()
    const hoja = sim.actors.get('cruce/leaf')!.body
    const orilla = sim.actors.get('caja-grapas')!.body.collider(0)
    let apoyada = false
    for (let i = 0; i < hoja.numColliders(); i++)
      sim.world.contactPair(hoja.collider(i), orilla, m => { if (m.numSolverContacts()) apoyada = true })
    expect(apoyada).toBe(true)
  } finally { sim.dispose() }
})
