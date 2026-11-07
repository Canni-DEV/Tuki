import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Editor, validarPieza } from '../src/editor'
import { nivelPorId } from '../src/levels'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import type { Armado, Vec3 } from '../src/types'

const montajes = ['s', 'rampa', 'taza-fichas', 'taza-mixta', 'llave-abierta', 'bola-temprana']
type Montaje = { nombre: string; armado: Armado; esperado: 'detenida' | 'victoria'; grupos: string[][] }

function leer(nombre: string): Montaje {
  return JSON.parse(readFileSync(new URL(`./fixtures/${nombre}.json`, import.meta.url), 'utf8'))
}

function comprobarArmado(armado: Armado) {
  const nivel = nivelPorId(armado.nivel)
  // The internal reference is subject to the same support, overlap and inventory rules as a player's route.
  new Editor(nivel).cargar(armado)
  for (const pieza of armado.piezas) {
    expect(validarPieza(nivel, pieza, armado.piezas), pieza.id).toBeNull()
  }
}

function ejecutar(armado: Armado) {
  const sim = new Simulation(nivelPorId(armado.nivel), armado)
  try {
    const eventos: SimEvent[] = []
    while (!sim.result && sim.tick < 2400) eventos.push(...sim.step())
    expect(sim.result, 'El intento tiene que terminar por reposo o victoria').not.toBeNull()
    return { resultado: sim.result, eventos, poses: sim.poses() }
  } finally {
    sim.dispose()
  }
}

const contacto = (eventos: SimEvent[], a: string, b: string) =>
  eventos.find(e => e.tipo === 'impacto' && ((e.a === a && e.b === b) || (e.a === b && e.b === a)))?.paso

beforeAll(initPhysics)

describe('montajes físicos de control', () => {
  it.each(montajes)('%s se puede construir y reproduce su desenlace', slug => {
    const { armado, esperado } = leer(slug)
    comprobarArmado(armado)
    const { resultado, eventos } = ejecutar(armado)
    expect(resultado).toBe(esperado)
    expect(eventos.filter(e => e.tipo === 'empujon').map(e => e.paso)).toEqual([0])
    expect(eventos.filter(e => e.tipo === esperado)).toHaveLength(1)
  })

  it('la longitud de una rama determina si la bola llega antes o después de la apertura', () => {
    const corta = leer('llave-abierta').armado
    const larga = leer('bola-temprana').armado
    const entrada = (a: Armado) => a.piezas.filter(p => !p.id.startsWith('rama'))
    expect(entrada(corta)).toEqual(entrada(larga))

    const temprano = ejecutar(corta)
    const tarde = ejecutar(larga)
    const apertura = (ev: SimEvent[]) => ev.find(e => e.tipo === 'llave')!.paso
    expect(apertura(temprano.eventos) + 12).toBeLessThan(contacto(temprano.eventos, 'bola', 'receptor')!)
    expect(contacto(temprano.eventos, 'bola', 'tray')).toBeUndefined()
    expect(contacto(tarde.eventos, 'bola', 'gate')).toBeLessThan(apertura(tarde.eventos))
    expect(contacto(tarde.eventos, 'bola', 'diverter')).toBeLessThan(contacto(tarde.eventos, 'bola', 'tray')!)
    expect(contacto(tarde.eventos, 'bola', 'receptor')).toBeUndefined()
    const bandeja = nivelPorId('taza-llave').fijos.find(p => p.id === 'tray')!
    const [x, y, z] = tarde.poses.get('bola')!.p
    const giro = bandeja.giroY * Math.PI / 180
    const dx = x - bandeja.posicion[0], dz = z - bandeja.posicion[2]
    expect(Math.abs(dx * Math.cos(giro) - dz * Math.sin(giro))).toBeLessThan(.024)
    expect(Math.abs(dx * Math.sin(giro) + dz * Math.cos(giro))).toBeLessThan(.021)
    expect(y).toBeGreaterThan(0)
  })
})

describe('rutas y fallos derivados', () => {
  it('una S trazada en un único gesto alcanza la meta y se deshace por completo', () => {
    const editor = new Editor(nivelPorId('curva'))
    const muestras = Array.from({ length: 56 }, (_, i): Vec3 => {
      const t = i / 55
      return [-.078 + .172 * t, 0, -.033 * Math.sin(2 * Math.PI * (t - .02))]
    })
    const fila = editor.trazar(muestras, 'tablero')
    expect(fila.piezas).toHaveLength(8)
    expect(editor.agregar(fila.piezas)).toBe(true)
    expect(editor.armado.saldo.domino).toBe(0)
    expect(ejecutar(editor.armado).resultado).toBe('victoria')
    editor.deshacer()
    expect(editor.armado.piezas).toEqual([])
    expect(editor.armado.saldo.domino).toBe(8)
  })

  it('una única ficha desplazada corta la S y volverla a su sitio la repara', () => {
    const armado = leer('s').armado
    const ficha = armado.piezas.find(p => p.id === 'd4')!
    const original = ficha.posicion[2]
    ficha.posicion[2] += .067
    comprobarArmado(armado)
    expect(ejecutar(armado).resultado).toBe('detenida')
    ficha.posicion[2] = original
    expect(ejecutar(armado).resultado).toBe('victoria')
  })

  it('una curva suave también alcanza los mismos extremos', () => {
    const armado = leer('s').armado
    armado.piezas.forEach((p, i) => {
      const t = (i + 1) / 9
      p.posicion = [-.108 + .216 * t, 0, -.03 * Math.sin(Math.PI * t)]
      p.giroY = Math.atan2(.216, -.03 * Math.PI * Math.cos(Math.PI * t)) * 180 / Math.PI
    })
    comprobarArmado(armado)
    expect(ejecutar(armado).resultado).toBe('victoria')
  })

  it('la rampa desalineada entrega la bola fuera de la fila y se repara girándola', () => {
    const armado = leer('rampa').armado
    const rampa = armado.piezas.find(p => p.tipo === 'rampa')!
    rampa.giroY = 140
    comprobarArmado(armado)
    const { resultado, eventos } = ejecutar(armado)
    expect(resultado).toBe('detenida')
    expect(contacto(eventos, 'bola', 'rampa')).toBeDefined()
    expect(eventos.some(e => e.tipo === 'descarte' && e.a === 'bola')).toBe(true)
    expect(contacto(eventos, 'bola', 'd3')).toBeUndefined()
    rampa.giroY = 90
    expect(ejecutar(armado).resultado).toBe('victoria')
  })

  it('una tercera construcción entra por el extremo expuesto del canal con piezas sobrantes', () => {
    const armado = leer('taza-mixta').armado
    armado.piezas = armado.piezas.filter(p => p.tipo !== 'embudo')
    armado.saldo.embudo++
    const receptor = armado.piezas.find(p => p.id === 'receptor')!
    receptor.posicion = [.155, 0, -.044]
    receptor.giroY = 45
    comprobarArmado(armado)
    const { resultado, eventos } = ejecutar(armado)
    expect(resultado).toBe('victoria')
    expect(contacto(eventos, 'bola', 'canal')).toBeLessThan(contacto(eventos, 'bola', 'receptor')!)
    expect(armado.saldo.domino).toBeGreaterThan(0)
  })
})
