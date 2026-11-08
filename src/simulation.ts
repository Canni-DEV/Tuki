import R from '@dimforge/rapier3d-compat'
import { Vector3, Quaternion } from 'three'
import { assemblies, partRotation, type Part } from './shapes'
import { colliders, vector, yaw } from './geometry'
import { pieceAsset, perfil, type Armado, type Nivel, type Pose, type Vec3 } from './types'

let ready: Promise<void> | undefined
export const initPhysics = () =>
  (ready ??= R.init().catch((error) => {
    ready = undefined
    throw error
  }))
export interface SimEvent {
  tipo: 'empujon' | 'impacto' | 'activo' | 'llave' | 'victoria' | 'detenida' | 'descarte' | 'tope' | 'salida-cuna'
  a: string
  b: string
  paso: number
  intento: number
  fuerza: number
  materialA: string
  materialB: string
  posicion?: Vec3
}
export type Rodadura = { velocidad: number; material: string; apoyo: string; vertical: number; posicion: Vec3 }
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
  private pasoVictoria: number | null = null
  private gates = new Map<string, { age: number, start: Vector3 }>()
  private triggers = new Map<string, string>()
  private bridges = new Set<string>()
  private suspended = new Set<string>()
  private topes = new Map<string, { limites: [number, number]; ultimo: number | undefined }>()
  private smallMotion = new Map<string, { p: Vector3, q: Quaternion, tick: number }>()
  private first: SimEvent[]
  tick = 0
  result: 'victoria' | 'detenida' | null = null
  rodaduras = new Map<string, Rodadura>()

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
    for (const p of objects) {
      if (p.activo === 'stamp') continue
      const parts = assemblies[p.activo]
      if (!parts) this.add(p.id, p.activo, p, p.escala)
      else {
        for (const part of parts) this.addPart(p.id, p, part)
        if (p.activo === 'valve') this.triggers.set(p.id + '/paddle', p.id + '/gate')
        if (p.activo === 'bridge') this.triggers.set(p.id + '/latch', p.id + '/leaf')
      }
    }
    if (this.actors.has('paddle') && this.actors.has('gate')) this.triggers.set('paddle', 'gate')
    const start = this.actors.get(nivel.empujon.pieza)!.body
    const rot = new Quaternion().copy(start.rotation())
    start.applyImpulseAtPoint(
      vector(nivel.empujon.impulsoLocal).applyQuaternion(rot),
      vector(nivel.empujon.puntoLocal).applyQuaternion(rot).add(start.translation()),
      true,
    )
    this.first = [this.event('empujon', nivel.empujon.pieza, '', length(vector(nivel.empujon.impulsoLocal)))]
  }
  private addPart(id: string, pose: Pose, part: Part) {
    const base = yaw(pose.giroY)
    const point = vector(part.at).applyQuaternion(base).add(vector(pose.posicion))
    const member = id + '/' + part.key
    const body = this.add(member, part.asset, { posicion: point.toArray() as Vec3, giroY: pose.giroY }, undefined,
      base.clone().multiply(partRotation(part)), part.mass)
    if (!part.hinge) return
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(point.x, point.y, point.z).setRotation(base))
    // Rapier chooses the joint reference at creation. Create it at zero pitch, then set the rest angle.
    body.setRotation(base, false)
    const axis = part.hinge === 'x' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const joint = this.world.createImpulseJoint(R.JointData.revolute(identity, identity, axis), anchor, body, true) as R.RevoluteImpulseJoint
    joint.setLimits(...part.limits!)
    body.setRotation(base.clone().multiply(partRotation(part)), false)
    body.setLinearDamping(part.asset === 'bob' ? 2.2 : .15)
    body.setAngularDamping(part.asset === 'bob' ? 1.4 : .7)
    this.suspended.add(member)
    if (part.asset === 'lever' || part.asset === 'leaf')
      this.topes.set(member, { limites: part.limits!, ultimo: part.pitch })
    if (part.asset === 'leaf') {
      body.setBodyType(R.RigidBodyType.Fixed, false)
      this.bridges.add(member)
    }
  }
  private add(id: string, asset: string, pose: Pose, scale?: Vec3, rotation = yaw(pose.giroY), mass?: number) {
    const dynamic = !!mass || ['domino', 'ball', 'paddle'].includes(asset)
    const desc = dynamic
      ? R.RigidBodyDesc.dynamic()
      : asset === 'gate'
        ? R.RigidBodyDesc.kinematicPositionBased()
        : R.RigidBodyDesc.fixed()
    const body = this.world.createRigidBody(
      desc
        .setTranslation(...pose.posicion)
        .setRotation(rotation)
        .setCcdEnabled(dynamic),
    )
    const actor = { id, asset, body, dynamic }
    this.actors.set(id, actor)
    for (const c of colliders(asset, scale)) {
      c.setFriction(perfil.friccion).setRestitution(perfil.restitucion)
      if (asset === 'bend') c.setFriction(.06).setFrictionCombineRule(R.CoefficientCombineRule.Min)
      if (asset === 'lever') c.setRestitution(.57).setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      if (mass) c.setDensity(1)
      else if (dynamic) c.setMass(asset === 'domino' ? 0.012 : asset === 'ball' ? 0.006 : 0.002)
      c.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      const collider = this.world.createCollider(c, body)
      this.owners.set(collider.handle, actor)
    }
    if (mass) {
      // Preserve the compound shape's centre of mass and inertia when scaling its total mass.
      body.recomputeMassPropertiesFromColliders()
      const density = mass / body.mass()
      for (let i = 0; i < body.numColliders(); i++) body.collider(i).setDensity(density)
      body.recomputeMassPropertiesFromColliders()
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
    if (asset === 'gate') this.gates.set(id, { age: -1, start: vector(pose.posicion) })
    return body
  }
  private event(tipo: SimEvent['tipo'], a: string, b: string, fuerza = 0, punto?: R.Vector): SimEvent {
    const actor = this.actors.get(a)
    const pos = punto ?? actor?.body.translation()
    return { tipo, a, b, fuerza, paso: this.tick, intento: this.intento, materialA: actor?.asset ?? '',
      materialB: this.actors.get(b)?.asset ?? '', posicion: pos && [pos.x, pos.y, pos.z] }
  }
  step(): SimEvent[] {
    if (this.result) return []
    const events = this.first
    this.first = []
    this.tick++
    for (const [id, state] of this.gates) {
      if (state.age < 0 || state.age >= 12) continue
      state.age++
      const gate = this.actors.get(id)!.body
      const delta = new Vector3(.045 * state.age / 12, 0, 0).applyQuaternion(gate.rotation())
      gate.setNextKinematicTranslation(delta.add(state.start))
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
    const rollingOnTable = new Set<string>()
    const hits = new Map<string, { a: Actor; b: Actor; force: number; closing: number; lateral: boolean; punto?: R.Vector }>()
    const anteriores = this.rodaduras
    this.rodaduras = new Map()
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
      let punto: R.Vector | undefined
      this.world.contactPair(ca, cb, (m, flipped) => {
        if (!m.numSolverContacts()) return
        const normal = new Vector3().copy(m.normal()).multiplyScalar(flipped ? -1 : 1)
        if (normal.y < -0.2) supported.add(a.id)
        if (normal.y > 0.2) supported.add(b.id)
        if (Math.abs(normal.y) < 0.8) lateral = true
        const ball = a.asset === 'ball' ? a : b.asset === 'ball' ? b : undefined
        if (ball && (a.asset === 'table' || b.asset === 'table') && supported.has(ball.id)) rollingOnTable.add(ball.id)
        if (ball) {
          const vertical = ball === a ? -normal.y : normal.y
          const otro = ball === a ? b : a
          const previo = this.rodaduras.get(ball.id)
          if (vertical > .2 && (!previo || vertical > previo.vertical || (vertical === previo.vertical && otro.id < previo.apoyo))) {
            const pos = ball.body.translation()
            this.rodaduras.set(ball.id, { velocidad: length(ball.body.linvel()), material: otro.asset,
              apoyo: otro.id, vertical, posicion: [pos.x, pos.y, pos.z] })
          }
        }
        for (let i = 0; i < m.numSolverContacts(); i++) {
          const point = m.solverContactPoint(i)
          const at = (id: string) => {
            const s = motion.get(id)
            return s ? s.w.clone().cross(new Vector3().copy(point).sub(s.com)).add(s.v) : new Vector3()
          }
          const speed = at(a.id).sub(at(b.id)).dot(normal)
          if (speed > closing) { closing = speed; punto = point }
        }
      })
      pairs.add(key)
      const old = hits.get(key)
      if (!old || closing > old.closing) hits.set(key, { a, b, force, closing, lateral, punto })
    })
    const decisive = [...hits.entries()]
      .filter(([, h]) => h.closing > 0.002 && h.force > 0.0001)
      .sort(([a], [b]) => a.localeCompare(b))
    for (const [key, h] of decisive)
      if (!this.preceding.has(key) || h.closing > 0.1) {
        events.push(this.event('impacto', h.a.id, h.b.id, h.force, h.punto))
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
            !to.dynamic || to.body.isFixed() ||
            !this.activas.has(from.id) ||
            this.activas.has(to.id) ||
            (to.asset === 'paddle' && !h.lateral)
          )
            continue
          this.activas.add(to.id)
          events.push(this.event('activo', from.id, to.id, h.force))
          const target = this.triggers.get(to.id)
          if (target) {
            const gate = this.gates.get(target)
            if (gate) gate.age = 0
            if (this.bridges.has(target)) {
              this.actors.get(target)!.body.setBodyType(R.RigidBodyType.Dynamic, true)
              this.activas.add(target)
              events.push(this.event('activo', to.id, target, h.force))
            }
            events.push(this.event('llave', to.id, target))
          }
          changed = true
        }
      }
    }
    for (const [id, apoyo] of anteriores) {
      if (apoyo.material === 'cradle' && this.rodaduras.get(id)?.apoyo !== apoyo.apoyo && this.activas.has(id))
        events.push(this.event('salida-cuna', id, apoyo.apoyo))
    }
    for (const [id, tope] of this.topes) {
      if (!this.activas.has(id)) continue
      const q = this.actors.get(id)!.body.rotation()
      // The local +Z arm pitches about X even when the assembly is rotated on the table.
      const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q.w * q.x - q.y * q.z))))
      if (tope.ultimo !== undefined && Math.abs(pitch - tope.ultimo) > .05) tope.ultimo = undefined
      const extremo = tope.limites.find(limite => Math.abs(pitch - limite) < .012)
      if (extremo !== undefined && extremo !== tope.ultimo) {
        events.push(this.event('tope', id, ''))
        tope.ultimo = extremo
      }
    }
    const meta = this.actors.get('meta')!
    const q = meta.body.rotation()
    if (this.pasoVictoria === null && gana(this.activas.has('meta'), 1 - 2 * (q.x * q.x + q.z * q.z))) {
      this.pasoVictoria = this.tick
      events.push(this.event('victoria', 'meta', ''))
    }
    let quiet = ![...this.gates.values()].some(g => g.age >= 0 && g.age < 12)
    for (const a of this.actors.values()) {
      const b = a.body
      if (!a.dynamic || !b.isEnabled()) continue
      if (b.translation().y < perfil.descarte) {
        b.setEnabled(false)
        events.push(this.event('descarte', a.id, ''))
        continue
      }
      // A loaded joint can carry a small constraint velocity even after its pose has settled.
      // Measure displacement over a full rest window, including the tip of each hinged arm.
      if (this.suspended.size && a.asset === 'ball' && this.activas.has(a.id)) {
        const damping = rollingOnTable.has(a.id) && length(b.linvel()) < .045 ? 2.8 : 0
        if (b.linearDamping() !== damping) { b.setLinearDamping(damping); b.setAngularDamping(damping) }
      }
      let settled = false
      if (this.suspended.size > 0) {
        const pos = new Vector3().copy(b.translation()), rot = new Quaternion().copy(b.rotation()).normalize()
        const last = this.smallMotion.get(a.id)
        if (!last || last.p.distanceTo(pos) > .0008 || (a.asset !== 'ball' && last.q.angleTo(rot) > .025))
          this.smallMotion.set(a.id, { p: pos, q: rot, tick: this.tick })
        else settled = this.tick - last.tick >= perfil.ventanaReposo
      } else this.smallMotion.delete(a.id)
      if (
        !settled && !b.isSleeping() &&
        (!(supported.has(a.id) || this.suspended.has(a.id) || a.asset === 'paddle') ||
          length(b.linvel()) >= 0.005 ||
          length(b.angvel()) >= 0.1)
      )
        quiet = false
    }
    this.rest = quiet ? this.rest + 1 : 0
    const puedeFinalizar = this.pasoVictoria === null || (this.tick - this.pasoVictoria) * perfil.paso >= 1
    if (this.rest >= perfil.ventanaReposo && puedeFinalizar) {
      this.result = this.pasoVictoria === null ? 'detenida' : 'victoria'
      if (this.result === 'detenida') events.push(this.event('detenida', 'meta', ''))
      for (const { dynamic, body } of this.actors.values()) {
        if (dynamic && body.isEnabled()) body.sleep()
      }
    }
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
