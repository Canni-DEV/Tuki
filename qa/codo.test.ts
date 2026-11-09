import R from '@dimforge/rapier3d-compat'
import { beforeAll, expect, it } from 'vitest'
import { Editor } from '../src/editor'
import { nivelPorId } from '../src/levels'
import { initPhysics, Simulation } from '../src/simulation'
import type { PiezaColocada, TipoColocable, Vec3 } from '../src/types'

beforeAll(initPhysics)

const casos = [-39, -20, 0, 20, 35].flatMap(suelta =>
  [-3, 0, 3].flatMap(desvio => [-5, 0, 5].map(giro => ({ suelta, desvio, giro }))))

it.each(casos)('el codo entrega la bola con suelta $suelta mm, desvío $desvio mm y giro $giro°', ({ suelta, desvio, giro }) => {
  // Isolate a ramp and bend on a level table. Keep the start and flag clear of the course.
  const nivel = structuredClone(nivelPorId('recta'))
  nivel.fijos.find(p => p.id === 'mesa')!.posicion = [0, 0, -.03]
  nivel.fijos.find(p => p.id === 'inicio')!.posicion = [-.15, 0, .05]
  nivel.fijos.find(p => p.id === 'meta')!.posicion = [.15, 0, .05]
  const armado = new Editor(nivel).armado
  const pieza = (id: string, tipo: TipoColocable, posicion: Vec3, giroY = 0): PiezaColocada =>
    ({ id, tipo, posicion, giroY, apoyo: 'tablero' })
  const radio = .047, medio = radio / 2, radioBola = .008
  const largoRampa = .095, pendiente = .0255 / largoRampa
  const angulo = giro * Math.PI / 180
  const puntaX = -medio + desvio / 1000, puntaZ = -medio - .002
  const sobreRampa = (distancia: number, altura: number): Vec3 =>
    [puntaX - Math.sin(angulo) * distancia, altura, puntaZ - Math.cos(angulo) * distancia]
  const distancia = largoRampa / 2 - suelta / 1000
  const altura = .001 + distancia * pendiente + radioBola * Math.hypot(1, pendiente)
  armado.piezas = [
    pieza('codo', 'curva90', [0, 0, 0]),
    pieza('rampa', 'rampa', sobreRampa(largoRampa / 2, 0), giro),
    pieza('bola', 'bolita', sobreRampa(distancia, altura)),
  ]
  const sim = new Simulation(nivel, armado)
  try {
    const codo = sim.actors.get('codo')!.body
    expect(codo.numColliders()).toBe(1)
    expect(codo.collider(0).shapeType()).toBe(R.ShapeType.TriMesh)
    expect(codo.collider(0).friction()).toBeCloseTo(.06)
    expect(codo.collider(0).frictionCombineRule()).toBe(R.CoefficientCombineRule.Min)
    const bola = sim.actors.get('bola')!.body
    const tercios = new Set<number>()
    let salio = false
    for (let paso = 0; paso < 480; paso++) {
      sim.world.step()
      const { x, y, z } = bola.translation()
      const theta = Math.atan2(z + medio, medio - x)
      if (theta >= 0 && theta < Math.PI / 2) {
        const r = Math.hypot(z + medio, medio - x)
        expect(r).toBeGreaterThan(radio - .014)
        expect(r).toBeLessThan(radio + .014)
        expect(y).toBeGreaterThan(.007)
        expect(y).toBeLessThan(.020)
        tercios.add(Math.floor(theta / (Math.PI / 6)))
      }
      if (x >= medio && Math.abs(z - medio) < .010 && bola.linvel().x > 0) {
        salio = true
        break
      }
    }
    expect([...tercios]).toEqual([0, 1, 2])
    expect(salio).toBe(true)
  } finally { sim.dispose() }
})
