/** Bake only the decorative opening. Gameplay's Simulation and profile are never used here. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { shapes } from '../src/shapes.ts'

const model = readFileSync(new URL('../public/models/domino.glb', import.meta.url))
const gltf = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)))
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  const a = gltf.accessors[primitive.attributes.POSITION]
  for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]) }
}
// Enclose even the printed line and pips, not just the nominal 8 mm body.
const center = new Vector3(...min.map((n, i) => (n + max[i]) / 2))
const half = min.map((n, i) => (max[i] - n) / 2)
const physicsHz = 960, fps = 240, count = 8, skin = .0001
await R.init()
const world = new R.World({ x: 0, y: -9.81, z: 0 })
try {
  world.timestep = 1 / physicsHz
  world.lengthUnit = .05
  world.numSolverIterations = 16
  const integration = world.integrationParameters
  integration.contact_natural_frequency = 960
  integration.numInternalPgsIterations = 4
  integration.normalizedAllowedLinearError = .00002
  integration.normalizedPredictionDistance = .02
  integration.maxCcdSubsteps = 4
  const table = shapes('table')[0]
  world.createCollider(R.ColliderDesc.cuboid(...table.size.map(n => n / 2))
    .setTranslation(...table.at).setFriction(.5))
  const bodies = Array.from({ length: count }, (_, i) => {
    const angle = -.58 + i * .16
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2 - angle)
    const p = new Vector3(.025 + .142 * Math.sin(angle), skin + .000002, -.021 + .142 * (1 - Math.cos(angle)))
      .add(new Vector3(0, 0, -.004).applyQuaternion(q))
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setRotation(q).setCcdEnabled(true))
    world.createCollider(R.ColliderDesc.cuboid(...half).setTranslation(center.x, center.y, center.z)
      .setMass(.012).setFriction(.5).setRestitution(.05).setContactSkin(skin), body)
    return body
  })
  const snapshot = () => bodies.flatMap(b => {
    const p = b.translation(), q = new Quaternion().copy(b.rotation()).normalize()
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map(n => +n.toFixed(8))
  })
  const frames = [snapshot()]
  const q = new Quaternion().copy(bodies[0].rotation())
  bodies[0].applyImpulseAtPoint(new Vector3(0, 0, .003).applyQuaternion(q),
    new Vector3(0, .04, 0).applyQuaternion(q).add(bodies[0].translation()), true)
  let quiet = 0, settled = false
  for (let tick = 1; tick <= physicsHz * 4; tick++) {
    world.step()
    const still = bodies.every(b => new Vector3().copy(b.linvel()).length() < .001 &&
      new Vector3().copy(b.angvel()).length() < .03)
    quiet = still ? quiet + 1 : 0
    if (tick % (physicsHz / fps) === 0) {
      frames.push(snapshot())
      if (quiet >= physicsHz / 4) { settled = true; break }
    }
  }
  assert(settled, 'The opening must finish at rest')
  assert(bodies.every(b => new Vector3(0, 1, 0).applyQuaternion(b.rotation()).y < .5), 'Every domino must fall')
  const clip = { version: 1, modelSha256: createHash('sha256').update(model).digest('hex'), fps, count, frames }
  writeFileSync(new URL('../src/data/portada.json', import.meta.url), JSON.stringify(clip) + '\n')
  console.log(`Portada: ${frames.length} frames, ${count} dominoes, ${(frames.length - 1) / fps}s at ${physicsHz} physics steps/s`)
} finally { world.free() }
