import { beforeAll, expect, it } from 'vitest'
import R from '@dimforge/rapier3d-compat'
import { contactosDePieza } from '../src/contactos'
import { Editor, validarPieza } from '../src/editor'
import { ensayarEquilibrio } from '../src/equilibrio'
import { initPhysics, Simulation } from '../src/simulation'
import { armadoDeMesa, leerMesa, mesaNueva, nivelTaller } from '../src/taller'
import { modelosNuevos, pieceAsset, type PiezaColocada, type TipoColocable } from '../src/types'
import { escenario, shapes } from '../src/shapes'

beforeAll(initPhysics)
const n = nivelTaller('Prueba de apoyos')
const p = (id: string, tipo: TipoColocable, x: number, y = 0, z = 0, apoyo = 'tablero'): PiezaColocada =>
  ({ id, tipo, posicion: [x, y, z], giroY: 0, apoyo })
const cajas = [p('izq', 'cajaCubica', -.060), p('der', 'cajaCubica', .060)]
const atlas = (x = 0) => p('atlas', 'atlas', x, .055, 0, 'izq/apoyo')
function abrir(piezas: PiezaColocada[]) {
  const e = new Editor(n)
  e.cargar(armadoDeMesa(n, leerMesa({ ...mesaNueva(n.nombre), piezas })))
  return e
}
it('ofrece diecisiete piezas fijas y mantiene abierto el paso bajo el asa de acero', () => {
  const catalogo: TipoColocable[] = ['libro', ...modelosNuevos]
  expect(catalogo).toHaveLength(17)
  for (const tipo of catalogo) {
    const e = abrir([p('obj', tipo, 0), p('inicio', 'inicio', -.20), p('meta', 'meta', .20)])
    const sim = new Simulation(n, e.armado)
    try {
      expect(sim.actors.get('obj')!.body.isFixed()).toBe(true)
      if (tipo === 'pava') {
        sim.step()
        const pava = sim.actors.get('obj')!.body
        const bola = new R.Ball(.008)
        const libre = (x: number, y: number, z: number) =>
          !Array.from({ length: pava.numColliders() }, (_, i) => pava.collider(i))
            .some(c => c.intersectsShape(bola, { x, y, z }, { x: 0, y: 0, z: 0, w: 1 }))
        expect(libre(0, .145, 0)).toBe(true)
        expect(libre(0, .175, 0)).toBe(false)
        expect(libre(.1044, .1062, 0)).toBe(true)
        expect(libre(.1044, .1062, .007)).toBe(false)
      }
    } finally { sim.dispose() }
    expect(pieceAsset(tipo)).toBeTruthy()
  }
})
it.each([
  ['libro', 'libroGrande', [.140,.018,.085], [.220,.030,.145]],
  ['bolsillo', 'bolsilloGrande', [.095,.012,.060], [.170,.020,.110]],
  ['atlas', 'atlasGrande', [.180,.015,.115], [.290,.027,.210]],
  ['cajaGrapas', 'cajaGrapasGrande', [.140,.018,.085], [.200,.032,.120]],
  ['cajaZapatos', 'cajaZapatosGrande', [.155,.050,.090], [.300,.110,.180]],
  ['cajaCubica', 'cajaCubicaGrande', [.055,.055,.055], [.120,.120,.120]],
] as const)('reabre %s apilado sobre su variante grande %s', (tipo, grande, medidas, medidasGrandes) => {
  for (const [modelo, [w,h,d]] of [[tipo, medidas], [grande, medidasGrandes]] as const) {
    const tapa = escenario[pieceAsset(modelo)]!.tapa!
    expect(tapa.ancho).toBeCloseTo(w, 8)
    expect(tapa.altura).toBeCloseTo(h, 8)
    expect(tapa.fondo).toBeCloseTo(d, 8)
  }
  const pila = [p('base', grande, 0), p('tapa', tipo, 0, medidasGrandes[1], 0, 'base/apoyo')]
  expect(abrir(pila).armado.piezas).toEqual(pila)
})
it('mide los cinco objetos de mesa en la misma escala que el dominó de 5 cm', () => {
  expect(shapes('domino')[0].size[1]).toBe(.05)
  expect(shapes('mate')[1].at[1] + shapes('mate')[1].size[1] / 2).toBeCloseTo(.090, 6)
  expect(escenario.coaster!.tapa).toMatchObject({ ancho:.100, altura:.006 })
  expect(escenario.tin!.tapa!.altura).toBeCloseTo(.130, 6)
  expect(escenario.napkins!.tamanoEnPlanta[0]).toBeCloseTo(.145, 6)
})
it.each(['servilletero', 'yerbera', 'pava'] as const)('la bola se desvía por contacto repetible con %s', tipo => {
  const objeto = { ...p('tope', tipo, 0), giroY: 32 }
  const e = abrir([objeto, p('bola', 'bolita', .018, .008, -.10), p('inicio', 'inicio', -.25), p('meta', 'meta', .25)])
  function tiro() {
    const sim = new Simulation(n, e.armado)
    try {
      const bola = sim.actors.get('bola')!.body, tope = sim.actors.get('tope')!.body
      bola.setLinvel({ x: 0, y: 0, z: .65 }, true)
      bola.setAngvel({ x: .65 / .008, y: 0, z: 0 }, true)
      let llego = false, lateral = 0
      for (let i = 0; i < 65; i++) {
        sim.step()
        sim.world.contactPairsWith(bola.collider(0), c => {
          if (c.parent()?.handle === tope.handle) sim.world.contactPair(bola.collider(0), c, m => {
            if (m.numSolverContacts()) llego = true
          })
        })
        if (llego) lateral = Math.max(lateral, Math.abs(bola.linvel().x))
      }
      expect(llego).toBe(true)
      expect(lateral).toBeGreaterThan(.03)
      expect(tope.translation()).toMatchObject({ x: 0, y: 0, z: 0 })
      return bola.translation()
    } finally { sim.dispose() }
  }
  expect(tiro()).toEqual(tiro())
})
it('admite un atlas sobre dos cajas y dibuja los dos parches sin cubrir el hueco', () => {
  const e = abrir([...cajas, atlas(), p('f', 'domino', 0, .070, 0, 'atlas/apoyo')])
  expect(e.armado.piezas[2].apoyos).toEqual(['der/apoyo', 'izq/apoyo'])
  const parches = contactosDePieza(n, atlas(), cajas)
  expect(parches.map(c => c.apoyo)).toEqual(['izq/apoyo', 'der/apoyo'])
  expect(parches[0].poligono.every(([x]) => x < -.032)).toBe(true)
  expect(parches[1].poligono.every(([x]) => x > .032)).toBe(true)
  const antes = e.armado
  e.seleccion = 'izq'
  expect(e.retirar()).toBe(false)
  expect(e.armado).toBe(antes)
  expect(e.historia).toHaveLength(0)
  expect(e.fallo?.pieza).toBe('atlas')
})
it('recalcula la retirada de una caja redundante y deshace las referencias juntas', () => {
  const e = abrir([...cajas, atlas(-.043)])
  e.seleccion = 'der'
  const antes = e.armado
  expect(e.retirar()).toBe(true)
  expect(e.armado.piezas.at(-1)?.apoyo).toBe('izq/apoyo')
  expect(e.armado.piezas.at(-1)?.apoyos).toBeUndefined()
  e.deshacer()
  expect(e.armado).toEqual(antes)
})
it('evalúa el peso de la pava sobre el atlas y rechaza una pila desequilibrada al importar', () => {
  const piezas = [p('c', 'cajaCubica', 0), p('a', 'atlas', .017, .055, 0, 'c/apoyo')]
  const e = abrir(piezas), inicial = e.armado
  const pava = p('carga', 'pava', .080, .070, 0, 'a/apoyo')
  expect(e.agregar([pava])).toBe(false)
  expect(e.fallo?.pieza).toBe('a')
  expect(e.armado).toBe(inicial)
  expect(e.agregar([{ ...pava, posicion: [0, .070, 0] }])).toBe(true)
  expect(() => leerMesa({ ...mesaNueva(n.nombre), piezas: [...piezas, pava] })).toThrow(/Atlas/)
})
it.each([[0, 0, 0], [-.18, .05, 0], [.25, -.17, 75], [-.30, -.17, 194], [.34, .21, 317]])(
  'mantiene el mate sobre corcho en X %d, Z %d y giro %d', (x, z, giroY) => {
    const mate = { ...p('mate', 'mate', x, .006, z, 'corcho/apoyo'), giroY }
    const corcho = { ...p('corcho', 'posavasos', x, 0, z), giroY }
    expect(abrir([corcho, mate]).armado.piezas).toHaveLength(2)
    expect(abrir([{ ...mate, apoyo: 'tablero', posicion: [x, 0, z] }]).armado.piezas).toHaveLength(1)
  })
it('incluye la carga retirada en la red que debe volver a comprobarse', () => {
  const piezas = [p('c', 'cajaCubica', 0), p('a', 'atlasGrande', 0, .055, 0, 'c/apoyo'),
  p('derecha', 'pava', .092, .082, 0, 'a/apoyo'), { ...p('izquierda', 'pava', -.092, .082, 0, 'a/apoyo'), giroY:180 }]
  const e = abrir(piezas), antes = e.armado
  e.seleccion = 'izquierda'
  expect(e.retirar()).toBe(false)
  expect(e.fallo?.pieza).toBe('a')
  expect(e.armado).toBe(antes)
})
it('registra una caja que se desliza bajo un atlas ya colocado', () => {
  const e = abrir([cajas[0], atlas(-.043), p('der', 'cajaCubica', .18)])
  expect(e.mover(cajas[1])).toBe(true)
  expect(e.armado.piezas[1].apoyos).toEqual(['der/apoyo', 'izq/apoyo'])
  e.deshacer()
  expect(e.armado.piezas[1].apoyos).toBeUndefined()
})
it('admite voladizo exterior, giro y apoyos redondos sin inventar las esquinas de la tapa', () => {
  const e = abrir([p('lib', 'libro', .40)])
  expect(e.mover({ ...e.armado.piezas[0], giroY: 90 })).toBe(true)
  expect(e.mover({ ...e.armado.piezas[0], posicion: [.44, 0, 0] })).toBe(false)
  const corcho = p('corcho', 'posavasos', 0), mate = p('m', 'mate', 0, .006, 0, 'corcho/apoyo')
  expect(abrir([corcho, mate]).armado.piezas).toHaveLength(2)
  expect(validarPieza(n, p('b', 'bolita', .041, .014, .041, 'corcho/apoyo'), [corcho])).toBeTruthy()
})
it('reabre 200 libros en veinte pilas independientes a escala de mesa', () => {
  const piezas: PiezaColocada[] = []
  for (let columna = 0; columna < 20; columna++) {
    const x = (columna % 5 - 2) * .125, z = (Math.floor(columna / 5) - 1.5) * .092
    for (let fila = 0; fila < 10; fila++) {
      const id = 'p' + columna + '-' + fila
      const apoyo = fila ? 'p' + columna + '-' + (fila - 1) + '/apoyo' : 'tablero'
      piezas.push(p(id, 'bolsillo', x, fila * .012, z, apoyo))
    }
  }
  const mesa = leerMesa({ ...mesaNueva('Biblioteca'), piezas })
  expect(mesa.piezas).toEqual(piezas)
})
it('migra en el primer cambio válido y descarta un ensayo cancelado o con una revisión vieja', async () => {
  const e = new Editor(n)
  const vieja = leerMesa({ ...mesaNueva(n.nombre), version: 1, piezas: [p('lib', 'libro', 0)] })
  e.cargar(armadoDeMesa(n, vieja))
  const original = e.armado
  expect(original.version).toBe(2)
  const agregar = (b: Editor) => b.agregar([p('m', 'mate', 0, .018, 0, 'lib/apoyo')])
  expect(await e.editarValidado(agregar, async ps => ensayarEquilibrio(ps), () => false)).toBe(false)
  expect(e.armado).toBe(original)
  let terminar!: () => void
  const tardia = e.editarValidado(agregar, () => new Promise(r => { terminar = () => r(null) }), () => true)
  expect(e.mover({ ...original.piezas[0], giroY: 90 })).toBe(true)
  terminar()
  expect(await tardia).toBe(false)
  expect(e.armado.version).toBe(3)
  e.deshacer()
  expect(e.armado).toEqual(original)
})
