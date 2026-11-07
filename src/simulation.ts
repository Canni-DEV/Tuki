import R from '@dimforge/rapier3d-compat'
import { Vector3, Quaternion } from 'three'
import { colliders, vector, yaw } from './geometry'
import { pieceAsset, perfil, type Armado, type Nivel, type Pose, type Vec3 } from './types'

let ready: Promise<void> | undefined
export const initPhysics = () =>
  (ready ??= R.init().catch((error) => {
    ready = undefined
    throw error
  }))
export interface SimEvent {
  tipo: 'empujon' | 'impacto' | 'activo' | 'llave' | 'victoria' | 'detenida' | 'descarte'
  a: string
  b: string
  paso: number
  intento: number
  fuerza: number
}
export type BodyPose = { p: Vec3; q: [number, number, number, number] }
type Actor = { id: string; asset: string; body: R.RigidBody; dynamic: boolean }
export const gana = (activada: boolean, vertical: number) => activada && vertical < 0.5
const length = (v: R.Vector) => Math.hypot(v.x, v.y, v.z)
const identity = { x: 0, y: 0, z: 0 }

export class Simulation {
  readonly world = new R.World({ x: 0, y: -9.81, z: 0 })
  private queue = new R.EventQueue(true)
  readonly actors = new Map<string, Actor>()
  private owners = new Map<number, Actor>()
  readonly activas = new Set<string>(['inicio'])
  private preceding = new Set<string>()
  private rest = 0
  private gateAge = -1
  private gateStart?: Vector3
  private first: SimEvent[]
  tick = 0
  result: 'victoria' | 'detenida' | null = null
  rodadura = { velocidad: 0, material: '' }

  constructor(
    readonly nivel: Nivel,
    armado: Armado,
    readonly intento = 1,
  ) {
    this.world.timestep = perfil.paso
    this.world.lengthUnit = 0.05
    this.world.numSolverIterations = 8
    const objects = [
      ...nivel.fijos,
      ...armado.piezas.map((p) => ({ ...p, activo: pieceAsset(p.tipo), escala: undefined })),
    ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const p of objects) this.add(p.id, p.activo, p, p.escala)
    const start = this.actors.get(nivel.empujon.pieza)!.body
    const rot = new Quaternion().copy(start.rotation())
    start.applyImpulseAtPoint(
      vector(nivel.empujon.impulsoLocal).applyQuaternion(rot),
      vector(nivel.empujon.puntoLocal).applyQuaternion(rot).add(start.translation()),
      true,
    )
    this.first = [this.event('empujon', nivel.empujon.pieza, '', length(vector(nivel.empujon.impulsoLocal)))]
  }
  private add(id: string, asset: string, pose: Pose, scale?: Vec3) {
    const dynamic = ['domino', 'ball', 'paddle'].includes(asset)
    const desc = dynamic
      ? R.RigidBodyDesc.dynamic()
      : asset === 'gate'
        ? R.RigidBodyDesc.kinematicPositionBased()
        : R.RigidBodyDesc.fixed()
    const body = this.world.createRigidBody(
      desc
        .setTranslation(...pose.posicion)
        .setRotation(yaw(pose.giroY))
        .setCcdEnabled(dynamic),
    )
    const actor = { id, asset, body, dynamic }
    this.actors.set(id, actor)
    for (const c of colliders(asset, scale)) {
      c.setFriction(perfil.friccion).setRestitution(perfil.restitucion)
      if (dynamic) c.setMass(asset === 'domino' ? 0.012 : asset === 'ball' ? 0.006 : 0.002)
      c.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      const collider = this.world.createCollider(c, body)
      this.owners.set(collider.handle, actor)
    }
    if (asset === 'paddle') {
      const anchor = this.world.createRigidBody(
        R.RigidBodyDesc.fixed()
          .setTranslation(...pose.posicion)
          .setRotation(yaw(pose.giroY)),
      )
      const joint = this.world.createImpulseJoint(
        R.JointData.revolute(identity, identity, { x: 0, y: 1, z: 0 }),
        anchor,
        body,
        true,
      ) as R.RevoluteImpulseJoint
      joint.setLimits(-1.1, 1.1)
    }
    if (asset === 'gate') this.gateStart = vector(pose.posicion)
  }
  private event(tipo: SimEvent['tipo'], a: string, b: string, fuerza = 0): SimEvent {
    return { tipo, a, b, fuerza, paso: this.tick, intento: this.intento }
  }
  step(): SimEvent[] {
    if (this.result) return []
    const events = this.first
    this.first = []
    this.tick++
    const gate = this.actors.get('gate')
    if (gate && this.gateStart && this.gateAge >= 0 && this.gateAge < 12) {
      this.gateAge++
      const delta = new Vector3((0.045 * this.gateAge) / 12, 0, 0).applyQuaternion(gate.body.rotation())
      gate.body.setNextKinematicTranslation(delta.add(this.gateStart))
    }
    // Snapshot velocities at the solver boundary to distinguish an arriving piece from resting contact.
    const motion = new Map<string, { v: Vector3; w: Vector3; com: Vector3 }>()
    for (const a of this.actors.values())
      if (a.dynamic && a.body.isEnabled()) {
        motion.set(a.id, {
          v: new Vector3().copy(a.body.linvel()),
          w: new Vector3().copy(a.body.angvel()),
          com: new Vector3().copy(a.body.worldCom()),
        })
      }
    this.world.step(this.queue)
    const supported = new Set<string>(),
      pairs = new Set<string>()
    const hits = new Map<string, { a: Actor; b: Actor; force: number; closing: number; lateral: boolean }>()
    this.rodadura = { velocidad: 0, material: '' }
    this.queue.drainContactForceEvents((e) => {
      const a = this.owners.get(e.collider1()),
        b = this.owners.get(e.collider2())
      if (!a || !b || a === b) return
      const key = [a.id, b.id].sort().join('|')
      const force = e.totalForceMagnitude()
      const ca = this.world.getCollider(e.collider1()),
        cb = this.world.getCollider(e.collider2())
      let closing = 0,
        lateral = false
      this.world.contactPair(ca, cb, (m, flipped) => {
        if (!m.numSolverContacts()) return
        const normal = new Vector3().copy(m.normal()).multiplyScalar(flipped ? -1 : 1)
        if (normal.y < -0.2) supported.add(a.id)
        if (normal.y > 0.2) supported.add(b.id)
        if (Math.abs(normal.y) < 0.8) lateral = true
        const ball = a.asset === 'ball' ? a : b.asset === 'ball' ? b : undefined
        if (ball && supported.has(ball.id))
          this.rodadura = { velocidad: length(ball.body.linvel()), material: ball === a ? b.asset : a.asset }
        for (let i = 0; i < m.numSolverContacts(); i++) {
          const point = m.solverContactPoint(i)
          const at = (id: string) => {
            const s = motion.get(id)
            return s ? s.w.clone().cross(new Vector3().copy(point).sub(s.com)).add(s.v) : new Vector3()
          }
          closing = Math.max(closing, at(a.id).sub(at(b.id)).dot(normal))
        }
      })
      pairs.add(key)
      const old = hits.get(key)
      if (!old || closing > old.closing) hits.set(key, { a, b, force, closing, lateral })
    })
    const decisive = [...hits.entries()]
      .filter(([, h]) => h.closing > 0.002 && h.force > 0.0001)
      .sort(([a], [b]) => a.localeCompare(b))
    for (const [key, h] of decisive)
      if (!this.preceding.has(key) || h.closing > 0.1) {
        events.push(this.event('impacto', h.a.id, h.b.id, h.force))
      }
    this.preceding = pairs
    // Resolve the transitive closure at this step so a simultaneous fork cannot lose a branch.
    let changed = true
    while (changed) {
      changed = false
      for (const [, h] of decisive) {
        for (const [from, to] of [
          [h.a, h.b],
          [h.b, h.a],
        ]) {
          if (
            !to.dynamic ||
            !this.activas.has(from.id) ||
            this.activas.has(to.id) ||
            (to.asset === 'paddle' && !h.lateral)
          )
            continue
          this.activas.add(to.id)
          events.push(this.event('activo', from.id, to.id, h.force))
          if (to.asset === 'paddle' && this.gateAge < 0) {
            this.gateAge = 0
            events.push(this.event('llave', to.id, 'gate'))
          }
          changed = true
        }
      }
    }
    const meta = this.actors.get('meta')!
    const q = meta.body.rotation()
    if (gana(this.activas.has('meta'), 1 - 2 * (q.x * q.x + q.z * q.z))) this.result = 'victoria'
    let quiet = !(this.gateAge >= 0 && this.gateAge < 12)
    for (const a of this.actors.values()) {
      const b = a.body
      if (!a.dynamic || !b.isEnabled()) continue
      if (b.translation().y < perfil.descarte) {
        b.setEnabled(false)
        events.push(this.event('descarte', a.id, ''))
        continue
      }
      if (
        !b.isSleeping() &&
        (!(supported.has(a.id) || a.asset === 'paddle') ||
          length(b.linvel()) >= 0.005 ||
          length(b.angvel()) >= 0.1)
      )
        quiet = false
    }
    this.rest = quiet ? this.rest + 1 : 0
    if (!this.result && this.rest >= perfil.ventanaReposo) this.result = 'detenida'
    if (this.result) events.push(this.event(this.result, 'meta', ''))
    return events
  }
  poses(): Map<string, BodyPose> {
    const poses = new Map<string, BodyPose>()
    for (const a of this.actors.values())
      if (a.dynamic || a.asset === 'gate') {
        const p = a.body.translation(),
          q = a.body.rotation()
        poses.set(a.id, { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] })
      }
    return poses
  }
  dispose() {
    this.queue.free()
    this.world.free()
  }
}
