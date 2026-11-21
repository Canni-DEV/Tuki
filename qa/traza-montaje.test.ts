import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nivelPorId } from '../src/levels'
import { nivelTaller } from '../src/taller'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import type { Armado } from '../src/types'
import { trazaMontaje } from './traza-montaje'

beforeAll(initPhysics)

it.each(['recta', 'puerta', 's', 'rampa', 'taza-fichas', 'taza-mixta', 'llave-abierta',
  'bola-temprana', 'vuelta', 'subibaja', 'puente', 'puente-tarde', 'taller100'])(
  '%s mantiene vigente la referencia de contactos de aceptación', nombre => {
    const fixture: { armado: Armado; grupos: string[][]; esperado: string } =
      JSON.parse(readFileSync(new URL('./fixtures/' + nombre + '.json', import.meta.url), 'utf8'))
    const n = fixture.armado.nivel === 'taller' ? nivelTaller('Mesa de control') : nivelPorId(fixture.armado.nivel)
    const sim = new Simulation(n, fixture.armado), eventos: SimEvent[] = []
    try {
      while (!sim.result && sim.tick < 36000) eventos.push(...sim.step())
      expect(sim.result).toBe(fixture.esperado)
      expect(trazaMontaje(fixture, eventos).map(g => g.ids)).toEqual(fixture.grupos.map(g => [...g].sort()))
    } finally { sim.dispose() }
  })
