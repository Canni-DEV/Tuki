import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { consumirTiempo } from '../src/reloj'
import { nivelPorId } from '../src/levels'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import { perfil, type Armado } from '../src/types'

it('recupera más de ocho pasos cuando dibujar un fotograma tarda', () => {
  let pasos = 0
  const resto = consumirTiempo(1, perfil.paso, () => { pasos++; return true }, () => 0)
  expect(pasos).toBe(120)
  expect(resto).toBeCloseTo(0, 10)
})

it('conserva el tiempo incompleto sin adelantar la física', () => {
  let pasos = 0
  expect(consumirTiempo(.0625, .125, () => { pasos++; return true }, () => 0)).toBe(.0625)
  expect(pasos).toBe(0)
})

it('cede después del presupuesto y recupera el resto en otro fotograma', () => {
  let tiempo = 0, pasos = 0
  const resto = consumirTiempo(2, .125, () => { tiempo += 4; pasos++; return true }, () => tiempo)
  expect(pasos).toBe(3)
  expect(resto).toBe(1.625)
  expect(consumirTiempo(resto, .125, () => { pasos++; return true }, () => 0)).toBe(0)
  expect(pasos).toBe(16)
})

it('permite un paso costoso y después devuelve el control al navegador', () => {
  let tiempo = 0, pasos = 0
  const resto = consumirTiempo(1, .125, () => { tiempo += 30; pasos++; return true }, () => tiempo)
  expect(pasos).toBe(1)
  expect(resto).toBe(.875)
})

it('mantiene un límite de pasos aunque el reloj no avance', () => {
  let pasos = 0
  const resto = consumirTiempo(10, perfil.paso, () => { pasos++; return true }, () => 0)
  expect(pasos).toBe(240)
  expect(resto).toBeCloseTo(8, 10)
})

it('no ejecuta otro paso después de alcanzar el resultado', () => {
  let pasos = 0
  expect(consumirTiempo(2, .25, () => ++pasos < 3, () => 0)).toBe(1.25)
  expect(pasos).toBe(3)
})

beforeAll(initPhysics)
const montaje = (nombre: string): Armado =>
  JSON.parse(readFileSync(new URL('./fixtures/' + nombre + '.json', import.meta.url), 'utf8')).armado
const casos: [string, number, number][] = ['s', 'subibaja', 'puente'].flatMap(nombre =>
  [1 / 144, 1 / 30, 2].flatMap(intervalo => [1, .25].map(velocidad => [nombre, intervalo, velocidad] as [string, number, number])),
)

it.each(casos)('%s conserva eventos y poses con fotogramas de %fs a velocidad %f', (nombre, intervalo, velocidad) => {
  const armado = montaje(nombre), nivel = nivelPorId(armado.nivel)
  const directo = new Simulation(nivel, armado), agrupado = new Simulation(nivel, armado)
  const esperados: SimEvent[] = [], eventos: SimEvent[] = []
  try {
    while (!directo.result && directo.tick < 6000) esperados.push(...directo.step())
    expect(directo.result).not.toBeNull()
    let acumulador = 0, reloj = 0, fotogramas = 0
    while (!agrupado.result && fotogramas < 100000) {
      acumulador += intervalo * velocidad
      acumulador = consumirTiempo(acumulador, perfil.paso, () => {
        eventos.push(...agrupado.step())
        reloj += .25 // Also exercise exhaustion of the per-frame work budget.
        return !agrupado.result
      }, () => reloj)
      fotogramas++
    }
    expect(agrupado.result).toBe(directo.result)
    expect(agrupado.tick).toBe(directo.tick)
    expect(eventos).toEqual(esperados)
    expect([...agrupado.poses()]).toEqual([...directo.poses()])
    expect(fotogramas * intervalo * velocidad + 1e-8).toBeGreaterThanOrEqual(agrupado.tick * perfil.paso)
  } finally {
    directo.dispose()
    agrupado.dispose()
  }
})
