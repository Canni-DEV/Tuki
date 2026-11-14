import { beforeAll, expect, it } from 'vitest'
import { SuperficiesCable, borne, type Tendido } from '../src/cables'
import { Editor, validarPieza } from '../src/editor'
import { niveles } from '../src/levels'
import { initPhysics } from '../src/simulation'
import { leerMesa, nivelTaller } from '../src/taller'
import { esMando, esReceptor, type PiezaColocada, type Vec3 } from '../src/types'

beforeAll(initPhysics)
const pieza = (id: string, tipo: PiezaColocada['tipo'], posicion: Vec3, apoyo = 'tablero', giroY = 0): PiezaColocada => ({ id, tipo, posicion, apoyo, giroY })
const comprobar = (s: SuperficiesCable, r: Tendido) => {
  expect(r).toHaveLength(1)
  expect(r[0].length).toBeGreaterThan(2)
  for (const [i, p] of r[0].entries()) if (i) expect(s.libre(r[0][i - 1], p), 'segmento ' + i).toBe(true)
}
for (const nivel of niveles.filter(n => n.instalacion)) it(nivel.nombre + ' abre con ambos bornes fijos y un tubo exterior de 2 mm', () => {
  const editor = new Editor(nivel), instalacion = nivel.instalacion!
  const [c] = instalacion.conexiones
  const s = new SuperficiesCable(nivel, [])
  for (const cable of instalacion.conexiones) comprobar(s, s.trazar(cable))
  expect(editor.armado.piezas).toEqual([])
  for (const p of instalacion.dispositivos) {
    expect(editor.disponibles(p.tipo)).toBe(0)
    editor.seleccion = p.id
    expect(editor.retirar()).toBe(false)
    expect(editor.mover({ ...p, giroY: p.giroY + 90 })).toBe(false)
    expect(esMando(p.tipo) || esReceptor(p.tipo)).toBe(true)
  }
  expect(editor.conectar(c.mando, c.receptor)).toBe(false)
  expect(editor.historia).toHaveLength(0)
  expect(() => editor.cargar({ ...editor.armado, conexiones: [c] })).toThrow()
  if (nivel.id === 'puerta') expect(validarPieza(nivel, pieza('bola', 'bolita', [-.04, .022, -.006], 'boton/apoyo'), [])).toBeNull()
})

it('saca el cable de una yerbera por el borde circular de su tapa', () => {
  const n = nivelTaller('Cable sobre la yerbera')
  const base = pieza('lata', 'yerbera', [0, 0, 0])
  const mando = pieza('m', 'palanca', [0, .130, 0], 'lata/apoyo', 270)
  const puerta = pieza('r', 'puerta', [.13, 0, .07])
  const s = new SuperficiesCable(n, [base, mando, puerta])
  const ruta = s.trazar({ mando: 'm', receptor: 'r' })
  comprobar(s, ruta)
  const borde = ruta[0].filter(p => Math.abs(p.y - .13114) < .00005)
  expect(borde.some(p => Math.abs(Math.hypot(p.x, p.z) - .0447) < .0001)).toBe(true)
})
it('el Taller baja por los cantos de dos libros y rehace el tendido al mover la taza intermedia', () => {
  const n = nivelTaller('Pila junto a la taza'), base = pieza('a', 'libro', [-.13, 0, 0]), tapa = pieza('b', 'libro', [-.15, .018, 0], 'a/apoyo')
  const m = pieza('m', 'palanca', [-.15, .036, 0], 'b/apoyo', 270), r = pieza('r', 'puerta', [.13, 0, 0]), net = { mando: m.id, receptor: r.id }
  const objetos = [base, tapa, m, r], s = new SuperficiesCable(n, objetos), libre = s.trazar(net)
  comprobar(s, libre)
  for (const y of [.036, .018, 0]) expect(libre[0].some(p => Math.abs(p.y - y - .00114) < .0001)).toBe(true)
  const taza = pieza('taza', 'taza', [.022, 0, -.006]), conTaza = new SuperficiesCable(n, [...objetos, taza])
  const rodeo = conTaza.trazar(net)
  comprobar(conTaza, rodeo)
  expect(rodeo).not.toEqual(libre)
  expect(new SuperficiesCable(n, objetos).trazar(net)).toEqual(libre)
})

it('un borne orientado hacia fuera del borde vuelve a la mesa por el lateral de la carcasa', () => {
  const n = nivelTaller('Borde'), mando = pieza('m', 'palanca', [0, 0, -.243]), receptor = pieza('r', 'puerta', [.09, 0, -.06])
  expect(validarPieza(n, mando, [receptor])).toBeNull()
  const s = new SuperficiesCable(n, [mando, receptor])
  comprobar(s, s.trazar({ mando: 'm', receptor: 'r' }))
})

it('un dominó puede cubrir el borne conservando el recorrido y la conexión', () => {
  const n = nivelTaller('Borne ocupado'), m = pieza('m', 'palanca', [0, 0, 0]), r = pieza('r', 'puerta', [.09, 0, -.05])
  // A domino resting immediately outside the socket overlaps the cosmetic terminal, fits physically.
  const d = pieza('d', 'domino', [0, 0, -.0201]), net = { mando: 'm', receptor: 'r' }
  const editor = new Editor(n)
  expect(validarPieza(n, d, [m, r])).toBeNull()
  const libre = new SuperficiesCable(n, [m, r]).trazar(net)
  const s = new SuperficiesCable(n, [m, r, d]), cubierta = s.trazar(net)
  comprobar(s, cubierta)
  expect(cubierta).toEqual(libre)
  expect(cubierta[0][0].distanceTo(borne(m).punto)).toBeLessThan(.003)
  for (const p of [m, r, d]) expect(editor.agregar([p])).toBe(true)
  expect(editor.conectar(editor.armado.piezas[0].id, editor.armado.piezas[1].id)).toBe(true)
  expect(new SuperficiesCable(n, [m, r]).trazar(net)).toEqual(libre)
})
it.each(['domino', 'inicio', 'meta', 'bolita'] as const)('%s puede ocupar el recorrido sin desplazar el cable', tipo => {
  const n = nivelTaller('Cable pisable'), m = pieza('m', 'boton', [-.12, 0, 0]), r = pieza('r', 'puerta', [.14, 0, .012])
  const net = { mando: m.id, receptor: r.id }, s = new SuperficiesCable(n, [m, r]), ruta = s.trazar(net)
  const puntos = ruta[0], i = puntos.findIndex((p, i) => i > 0 && p.distanceTo(puntos[i - 1]) > .06)
  expect(i).toBeGreaterThan(0)
  const centro = puntos[i - 1].clone().lerp(puntos[i], .5)
  const objeto = pieza('obstaculo', tipo, [centro.x, tipo === 'bolita' ? .008 : 0, centro.z])
  expect(validarPieza(n, objeto, [m, r])).toBeNull()
  expect(new SuperficiesCable(n, [m, r, objeto]).trazar(net)).toEqual(ruta)
  expect(new SuperficiesCable(n, [m, r, { ...objeto, giroY: 90 }]).trazar(net)).toEqual(ruta)
})

it.each([1, 2, 3, 4] as const)('las mesas v%s recuperan el mismo cable pisable al importar', version => {
  const n = nivelTaller('Mesa guardada'), m = pieza('m', 'palanca', [0, 0, 0]), r = pieza('r', 'puerta', [.09, 0, -.05])
  const d = pieza('d', 'domino', [0, 0, -.0201]), net = { mando: m.id, receptor: r.id }
  const guardada = leerMesa({ version, perfilFisico: 'mvp-1', nombre: 'Mesa guardada', piezas: [m, r, d], conexiones: [net] })
  expect(guardada.conexiones).toEqual([net])
  expect(new SuperficiesCable(n, guardada.piezas).trazar(net)).toEqual(new SuperficiesCable(n, [m, r]).trazar(net))
})
