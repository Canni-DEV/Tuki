import { readFileSync } from 'node:fs'
import { beforeAll, expect, it } from 'vitest'
import { Editor } from '../src/editor'
import { campana, nivelPorId, validarNivel } from '../src/levels'
import { acreditarVictoria, disponible, leer } from '../src/progreso'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import { armadoDeMesa, faltantes, leerMesa, mesaNueva, nivelTaller } from '../src/taller'
import type { Armado, Nivel, PiezaColocada } from '../src/types'

beforeAll(initPhysics)
function montaje(nombre: string): Armado {
  return JSON.parse(readFileSync(new URL('./fixtures/' + nombre + '.json', import.meta.url), 'utf8')).armado
}
function probar(n: Nivel, a: Armado) {
  new Editor(n).cargar(a)
  const sim = new Simulation(n, a), eventos: SimEvent[] = [], recorrido: string[] = []
  try {
    while (!sim.result && sim.tick < 1800) {
      eventos.push(...sim.step())
      const apoyo = sim.rodaduras.get('bola')?.apoyo
      if (apoyo && !recorrido.includes(apoyo)) recorrido.push(apoyo)
    }
    return { resultado: sim.result, eventos, recorrido, estados: sim.secuencias }
  } finally { sim.dispose() }
}

it.each(['ABC','ACB','BAC','BCA','CAB','CBA'])('el cableado %s recibe las palancas en el orden físico B, A, C', orden => {
  const n = structuredClone(nivelPorId('mate'))
  n.instalacion!.secuencias![0].mandos = [...orden]
  const { resultado, estados, eventos } = probar(n, montaje('mate'))
  const estado = estados.get('compuerta')!
  const correcta = orden === 'BAC'
  expect(resultado).toBe(correcta ? 'victoria' : 'detenida')
  const aperturas = eventos.filter(e => e.tipo === 'llave')
  expect(aperturas).toHaveLength(correcta ? 1 : 0)
  if (correcta) {
    expect(estado.aciertos).toEqual(['B','A','C'])
    const abierta = eventos.find(e => e.tipo === 'tope' && e.a === 'compuerta/slider')!
    expect(abierta.paso).toBeLessThan(eventos.find(e => e.tipo === 'activo' && e.b === 'fila20')!.paso)
  } else {
    expect(estado.error).toEqual(['BAC'[estado.aciertos.length]])
    expect(eventos.some(e => e.tipo === 'impacto' && [e.a,e.b].includes('compuerta/slider') && [e.a,e.b].includes('fila19'))).toBe(true)
    expect(eventos.some(e => e.tipo === 'activo' && ['fila20','meta'].includes(e.b))).toBe(false)
  }
})

it('el mismo montaje recibe los seis órdenes de llegada al cambiar los nombres físicos de las palancas', () => {
  for (const orden of ['ABC','ACB','BAC','BCA','CAB','CBA']) {
    const n = structuredClone(nivelPorId('mate')), instalacion = n.instalacion!
    const nombre = (id: string) => orden['BAC'.indexOf(id)]
    for (const mando of instalacion.dispositivos.filter(p => p.tipo === 'palanca')) mando.id = nombre(mando.id)
    for (const cable of instalacion.conexiones) cable.mando = nombre(cable.mando)
    const { eventos, resultado } = probar(validarNivel(n),montaje('mate'))
    const golpes = eventos.filter(e => e.tipo === 'activo' && e.materialB === 'paddle')
    expect(golpes.map(e => e.b.split('/')[0]).join('')).toBe(orden)
    expect(resultado).toBe(orden === 'BAC' ? 'victoria' : 'detenida')
  }
})
it('la llegada temprana pierde incluso cuando la combinación termina abriendo la hoja', () => {
  const n = nivelPorId('mate'), temprano = montaje('mate-temprano')
  const { eventos, resultado, estados } = probar(n,temprano)
  const golpe = eventos.find(e => e.tipo === 'impacto' && [e.a,e.b].includes('compuerta/slider') && [e.a,e.b].includes('fila19'))!
  expect(golpe.paso).toBeLessThan(eventos.find(e => e.tipo === 'llave')!.paso)
  expect(estados.get('compuerta')?.completa).toBe(true)
  expect(resultado).toBe('detenida')
  const rapido = montaje('mate')
  Object.assign(rapido.piezas.find(p => p.id === 'fila20')!, temprano.piezas.find(p => p.id === 'fila20'))
  expect(probar(n,rapido).resultado).toBe('victoria')
})

it('la llegada queda entre dos paredes y un fondo más altos que una ficha', () => {
  const n = nivelPorId('mate'), meta = n.fijos.find(p => p.id === 'meta')!
  for (const [x,z] of [[-.020,0],[.020,0],[0,-.086]]) {
    const e = new Editor(n)
    expect(e.agregar([{id:'atajo',tipo:'domino',apoyo:'tablero',giroY:180,posicion:[meta.posicion[0]+x,0,meta.posicion[2]+z]}])).toBe(false)
  }
})

it('la bolita cruza las cuatro terrazas y un codo retirado corta el recorrido hasta reponerlo', () => {
  const n = nivelPorId('bajada'), a = montaje('bajada'), e = new Editor(n)
  e.cargar(a)
  const bien = probar(n,e.armado)
  expect(bien.resultado).toBe('victoria')
  expect(bien.recorrido.filter(id => /^(cima|codo|canal|rampa)/.test(id))).toEqual(['cima','rampa1','codo1','canal2','codo2','canal3','codo3'])
  expect(bien.eventos.filter(v => v.tipo === 'activo').map(v => [v.a,v.b])).toEqual([['inicio','bola'],['bola','meta']])
  e.seleccion = 'codo2'
  expect(e.retirar()).toBe(true)
  expect(probar(n,e.armado).resultado).toBe('detenida')
  e.deshacer()
  expect(probar(n,e.armado).resultado).toBe('victoria')
})
it.each([['bola',2,-.002,0], ['bola',2,.002,0], ['bola',0,-.002,0], ['bola',0,.002,0],
  ['rampa1',2,.002,0], ['codo1',2,-.002,0], ['canal2',2,.002,0], ['codo2',0,0,-2], ['canal3',0,0,2], ['codo3',2,.002,0]] as const)(
  '%s tolera el ajuste en la unión', (id,eje,desvio,giro) => {
    const a = montaje('bajada'), p = a.piezas.find(v => v.id === id)!
    p.posicion[eje] += desvio
    p.giroY += giro
    expect(probar(nivelPorId('bajada'),a).resultado).toBe('victoria')
  })

function mesaConMandos(izq: string, der: string) {
  const doc = mesaNueva('Dos salidas')
  const pieza = (id: string, tipo: PiezaColocada['tipo'], x: number, z: number): PiezaColocada =>
    ({ id,tipo,posicion:[x,0,z],apoyo:'tablero',giroY:0 })
  doc.piezas = [pieza(izq,'palanca',-.01,0), pieza(der,'palanca',.01,0), pieza('inicio','inicio',0,-.032),
    pieza('meta','meta',-.32,.18), pieza('puerta','puerta',.16,.025), pieza('puente','puente',.25,-.12), pieza('extra','boton',-.17,.08)]
  doc.conexiones = [{mando:izq,receptor:'puerta'},{mando:der,receptor:'puerta'},{mando:der,receptor:'puente'}]
  doc.version = 4
  doc.secuencias = [{receptor:'puerta',mandos:[izq,der]}]
  return doc
}
it.each([['izq','der'],['z','a']])('el empate bloquea solo el receptor secuencial con mandos %s y %s', (izq,der) => {
  const n = nivelTaller('Empate'), doc = leerMesa(mesaConMandos(izq,der))
  const { eventos, estados } = probar(n,armadoDeMesa(n,doc))
  expect(estados.get('puerta')?.error).toEqual([izq,der].sort())
  expect(eventos.filter(e => e.tipo === 'llave').map(e => e.b)).toEqual(['puente/leaf'])
})
it('edita, guarda y deshace los cables y su orden como una sola operación', () => {
  const n = nivelTaller('Prueba'), doc = mesaConMandos('a','b')
  const editor = new Editor(n)
  editor.cargar(armadoDeMesa(n,leerMesa(doc)))
  expect(editor.configurarSecuencia('puerta',['b','a'])).toBe(true)
  expect(editor.conectar('extra','puerta')).toBe(true)
  expect(editor.armado.secuencias![0].mandos).toEqual(['b','a','extra'])
  expect(editor.conectar('b','puerta')).toBe(true)
  expect(editor.armado.secuencias![0].mandos).toEqual(['a','extra'])
  const antes = structuredClone(editor.armado)
  editor.seleccion = 'a'
  expect(editor.retirar()).toBe(true)
  expect(editor.armado.version).toBe(3)
  editor.deshacer()
  expect(editor.armado).toEqual(antes)
  const archivo = JSON.parse(JSON.stringify({...doc,...antes}))
  expect(leerMesa(archivo).secuencias).toEqual(antes.secuencias)
  for (const mandos of [['a','a'],['a'],['a','b']])
    expect(() => leerMesa({...archivo,secuencias:[{receptor:'puerta',mandos}]})).toThrow()
  expect(() => leerMesa({...archivo,version:3})).toThrow()
  expect(faltantes(doc,['recta','puerta','puente'])).toEqual(['mate'])
  expect(faltantes(doc,['recta','puerta','puente','mate'])).toEqual([])
})
it('el progreso del puente abre el 9 y su primera victoria habilita el 10', () => {
  const preferencias = leer(() => ({getItem:() => JSON.stringify({version:1,campana:2,completados:['puente'],audio:false,movimiento:'sistema'}),setItem() {}}))
  expect(campana.slice(-2).map(n => n.nombre)).toEqual(['La mesa del mate','La bajada de los libros'])
  expect(disponible(nivelPorId('mate'),preferencias)).toBe(true)
  expect(disponible(nivelPorId('bajada'),preferencias)).toBe(false)
  expect(acreditarVictoria(nivelPorId('mate'),preferencias).desafios).toEqual(['La bajada de los libros'])
  const n = structuredClone(nivelPorId('mate'))
  n.instalacion!.secuencias![0].mandos = ['B','B','C']
  expect(() => validarNivel(n)).toThrow()
})
