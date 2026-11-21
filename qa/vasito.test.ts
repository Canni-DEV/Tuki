import R from '@dimforge/rapier3d-compat'
import { beforeAll, expect, it } from 'vitest'
import { colliders } from '../src/geometry'
import { initPhysics } from '../src/simulation'

beforeAll(initPhysics)

function probarBolita(x: number, y: number, vx = 0) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 })
  try {
    world.timestep = 1 / 120
    const vasito = world.createRigidBody(R.RigidBodyDesc.fixed())
    for (const c of colliders('tumbler')) world.createCollider(c, vasito)
    world.createCollider(R.ColliderDesc.cuboid(.12, .01, .12).setTranslation(0, -.01, 0))
    const bolita = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, 0)
      .setLinvel(vx, 0, 0).setCcdEnabled(true))
    for (const c of colliders('ball')) world.createCollider(c, bolita)
    for (let paso = 0; paso < 240; paso++) world.step()
    return bolita.translation()
  } finally { world.free() }
}

it('la bolita atraviesa la boca visible del vasito y se apoya en el fondo', () => {
  const p = probarBolita(0, .11)
  expect(p.y).toBeGreaterThan(.012)
  expect(p.y).toBeLessThan(.016)
  expect(Math.abs(p.x)).toBeLessThan(.001)
})

it('la pared exterior del vasito sigue interceptando una bolita en la mesa', () => {
  const p = probarBolita(-.065, .008, .22)
  expect(p.x).toBeLessThan(-.031)
})
