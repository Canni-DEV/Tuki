import { dispositivos } from './dispositivos'
import { DispositivosSimulacion } from './dispositivos-simulacion'
import { objetosDeNivel } from './levels'
import R from '@dimforge/rapier3d-compat'
import { Vector3, Quaternion } from 'three'
import { assemblies, partRotation, type Part } from './shapes'
import { colliders, vector, yaw } from './geometry'
import { objetosInstalados, pieceAsset, perfil, type Armado, type Nivel, type Pose, type Vec3 } from './types'

let ready: Promise<void> | undefined
export const initPhysics = () =>
  (ready ??= R.init().catch((error) => {
    ready = undefined
    throw error
  }))
export interface SimEvent {
  tipo: 'empujon' | 'impacto' | 'activo' | 'llave' | 'victoria' | 'detenida' | 'descarte' | 'tope' | 'secuencia' | 'captura' | 'liberacion' | 'disparo' | 'senal-ignorada' | 'bloqueo'
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
export type Actor = { id: string; asset: string; body: R.RigidBody; dynamic: boolean }
export const gana = (activada: boolean, vertical: number) => activada && vertical < 0.5
const length = (v: R.Vector) => Math.hypot(v.x, v.y, v.z)
const identity = { x: 0, y: 0, z: 0 }

class EstadoSecuencia {
  readonly aciertos: string[] = []
  error: string[] = []
  constructor(readonly orden: readonly string[]) {}
  get completa() { return this.aciertos.length === this.orden.length }
  registrar(mandos: string[]) {
    if (this.completa || this.error.length) return false
    if (mandos.length === 1 && mandos[0] === this.orden[this.aciertos.length]) this.aciertos.push(mandos[0])
    else this.error = [...mandos].sort()
    return true
  }
}

export class Simulation {
  readonly world = new R.World({ x: 0, y: -9.81, z: 0 })
  private queue = new R.EventQueue(true)
  readonly actors = new Map<string, Actor>()
  private contactosInternos: R.PhysicsHooks = {
    filterContactPair: (a, b) => {
      const id = this.owners.get(a)?.id, otro = this.owners.get(b)?.id
      if (id?.includes('/') && id.split('/')[0] === otro?.split('/')[0]) return null
      return R.SolverFlags.COMPUTE_IMPULSE
    },
    filterIntersectionPair: () => true,
  }
  private owners = new Map<number, Actor>()
  readonly activas = new Set<string>(['inicio'])
  private preceding = new Set<string>()
  private apoyosBalancin = new Set<string>()
  private rest = 0
  private pasoVictoria: number | null = null
  private metaDerribada = false
  get motivoDetencion(): 'meta-sin-cadena' | null {
    return this.result === 'detenida' && this.metaDerribada && !this.activas.has('meta') ? 'meta-sin-cadena' : null
  }
  readonly secuencias = new Map<string, EstadoSecuencia>()
  readonly articulaciones = new Map<string, R.UnitImpulseJoint>()
  readonly dispositivos: DispositivosSimulacion
  private triggers = new Map<string, string[]>()
  private accionados = new Set<string>()
  private motores = new Map<string, {
    joint: R.UnitImpulseJoint; destino: number; inicio: Vector3; giro: Quaternion; enTope: boolean; angular: boolean; rigidez: number; amortiguacion: number
  }>()
  private mandos = new Map<string, 'lateral' | 'superior'>()
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
      ...objetosDeNivel(nivel),
      ...armado.piezas.map((p) => ({ ...p, activo: pieceAsset(p.tipo, p.configuracion), escala: undefined })),
    ].sort((a, b) => {
      // Equivalent constructions must behave alike regardless of the order the player took pieces from the tray.
      if ((nivel.ordenFisico ?? (nivel.id === 'taller' ? 'id' : 'geometria')) === 'geometria') {
        for (const axis of [0, 1, 2]) if (a.posicion[axis] !== b.posicion[axis]) return a.posicion[axis] - b.posicion[axis]
        const tipo = a.activo.localeCompare(b.activo)
        if (tipo) return tipo
      }
      return a.id.localeCompare(b.id)
    })
    for (const p of objects) {
      const parts = assemblies[p.activo]
      if (!parts) this.add(p.id, p.activo, p, p.escala)
      else {
        for (const part of parts) this.addPart(p.id, p, part)
      }
    }
    for(const p of [...objetosInstalados(nivel),...armado.piezas]) {
      const def=dispositivos[p.tipo]
      if(def?.entrada) {
        const input=p.id+'/'+def.entrada
        this.mandos.set(input,def.contacto!)
        if(def.retorno) {
          this.articulaciones.get(input)!.configureMotorPosition(0,def.retorno.rigidez,def.retorno.amortiguacion)
          this.actors.get(input)!.body.setGravityScale(0,false)
        }
      }
      if(def?.salida && (def.motor||def.comportamiento==='gravedad')) {
        const id=p.id+'/'+def.salida,body=this.actors.get(id)!.body
        body.setBodyType(R.RigidBodyType.Fixed,false)
        if(def.motor)this.motores.set(id,{...def.motor,joint:this.articulaciones.get(id)!,inicio:new Vector3().copy(body.translation()),giro:new Quaternion().copy(body.rotation()),enTope:false})
        else this.bridges.add(id)
      }
    }
    for (const { receptor, mandos } of [...nivel.instalacion?.secuencias ?? [], ...armado.secuencias ?? []])
      this.secuencias.set(receptor, new EstadoSecuencia(mandos))
    const porId = new Map([...objetosInstalados(nivel), ...armado.piezas].map(p => [p.id, p.tipo]))
    for (const { mando, receptor } of [...nivel.instalacion?.conexiones ?? [], ...armado.conexiones ?? []]) {
      const input = mando + '/' + dispositivos[porId.get(mando)!]?.entrada
      const pieza = porId.get(receptor)
      const output = receptor + '/' + dispositivos[pieza!]?.salida
      const receptores = this.triggers.get(input) ?? []
      if (this.actors.has(input) && this.actors.has(output)) this.triggers.set(input, [...receptores, output])
    }
    const todas = [...objetosInstalados(nivel), ...armado.piezas]
    this.dispositivos = new DispositivosSimulacion(this, todas, todas)
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
    if(part.asset==='liftStop') this.suspended.add(member)
    if (!part.hinge && !part.slide) return
    const jointRotation = part.slide ? base.clone().multiply(partRotation(part)) : base
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(point.x, point.y, point.z).setRotation(jointRotation))
    // Rapier chooses the joint reference at creation. Create it at zero pitch, then set the rest angle.
    body.setRotation(jointRotation, false)
    const axis = (part.hinge ?? part.slide) === 'x' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const data = part.slide ? R.JointData.prismatic(identity, identity, axis) : R.JointData.revolute(identity, identity, axis)
    const joint = this.world.createImpulseJoint(data, anchor, body, true) as R.UnitImpulseJoint
    this.articulaciones.set(member,joint)
    joint.setLimits(...part.limits!)
    body.setRotation(base.clone().multiply(partRotation(part)), false)
    body.setLinearDamping(part.asset === 'bob' ? 2.2 : .15)
    body.setAngularDamping(part.asset === 'bob' ? 1.4 : .7)
    this.suspended.add(member)
    if (part.asset === 'lever' || part.asset === 'leaf')
      this.topes.set(member, { limites: part.limits!, ultimo: part.pitch })
  }
  private add(id: string, asset: string, pose: Pose, scale?: Vec3, rotation = yaw(pose.giroY), mass?: number) {
    const dynamic = !!mass || ['domino', 'ball', 'paddle'].includes(asset)
    const desc = dynamic
      ? R.RigidBodyDesc.dynamic()
      : R.RigidBodyDesc.fixed()
    const body = this.world.createRigidBody(
      desc
        .setTranslation(...pose.posicion)
        .setRotation(rotation)
        .setCcdEnabled(dynamic && asset !== 'slider' && asset !== 'doorleaf' && asset !== 'press'),
    )
    const actor = { id, asset, body, dynamic }
    this.actors.set(id, actor)
    for (const c of colliders(asset, scale)) {
      c.setFriction(perfil.friccion).setRestitution(perfil.restitucion)
      if (asset === 'bend') c.setFriction(.06).setFrictionCombineRule(R.CoefficientCombineRule.Min)
      if (asset === 'lever') c.setRestitution(.57).setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      if (mass) c.setDensity(1)
      else if (dynamic) c.setMass(asset === 'domino' ? 0.012 : asset === 'ball' ? 0.006 : 0.002)
      if (id.includes('/')) c.setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS)
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
    return body
  }
  private event(tipo: SimEvent['tipo'], a: string, b: string, fuerza = 0, punto?: R.Vector): SimEvent {
    const actor = this.actors.get(a)
    const pos = punto ?? actor?.body.translation()
    return { tipo, a, b, fuerza, paso: this.tick, intento: this.intento, materialA: actor?.asset ?? '',
      materialB: this.actors.get(b)?.asset ?? '', posicion: pos && [pos.x, pos.y, pos.z] }
  }
  private accionar(target: string, input: string, force: number, events: SimEvent[]) {
    if (this.dispositivos.senal(target,events)) return
    if (this.accionados.has(target)) return
    this.accionados.add(target)
    const motor = this.motores.get(target)
    if (motor) {
      this.actors.get(target)!.body.setBodyType(R.RigidBodyType.Dynamic, true)
      motor.joint.configureMotorModel(R.MotorModel.ForceBased)
      motor.joint.configureMotorPosition(motor.destino,motor.rigidez,motor.amortiguacion)
      this.activas.add(target)
      events.push(this.event('activo', input, target, force))
    }
    if (this.bridges.has(target)) {
      this.actors.get(target)!.body.setBodyType(R.RigidBodyType.Dynamic, true)
      this.activas.add(target)
      events.push(this.event('activo', input, target, force))
    }
    events.push(this.event('llave', input, target))
  }
  step(): SimEvent[] {
    if (this.result) return []
    const events = this.first
    this.first = []
    this.tick++

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
    this.dispositivos.antesDelPaso()
    this.world.step(this.queue, this.contactosInternos)
    const supported = new Set<string>(), touching = new Set<string>(),
      pairs = new Set<string>()
    const rollingOnTable = new Set<string>()
    const apoyosBalancin = new Set<string>()
    const cargas = new Map<string, { from: Actor; to: Actor; force: number }>()
    const hits = new Map<string, { a: Actor; b: Actor; force: number; closing: number; lateral: boolean; entrantes: Set<string>; arriba?: string; punto?: R.Vector }>()
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
      let punto: R.Vector | undefined, arriba: string | undefined
      const entrantes=new Set<string>()
      this.world.contactPair(ca, cb, (m, flipped) => {
        if (!m.numSolverContacts()) return
        touching.add(a.id); touching.add(b.id)
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
        // A resting load can receive the lever's impulse within this solver step,
        // before either body had any approach velocity. Keep that evidence separate
        // from ordinary impacts: contact alone (including joint jitter) is not causal.
        const lever = ball && (ball === a ? b : a)
        const normalCarga = lever?.asset === 'lever' ? normal.clone().multiplyScalar(ball === b ? 1 : -1) : undefined
        let impulsoCarga = 0
        if (normalCarga && normalCarga.y > .2) {
          apoyosBalancin.add(key)
          if (this.apoyosBalancin.has(key) && !this.activas.has(ball!.id))
            for (let i = 0; i < m.numContacts(); i++) impulsoCarga += m.contactImpulse(i)
        }
        for (let i = 0; i < m.numSolverContacts(); i++) {
          const point = m.solverContactPoint(i)
          const at = (id: string) => {
            const s = motion.get(id)
            return s ? s.w.clone().cross(new Vector3().copy(point).sub(s.com)).add(s.v) : new Vector3()
          }
          const va=at(a.id),vb=at(b.id)
          if (impulsoCarga > .0001 * perfil.paso) {
            const after = (actor: Actor) => new Vector3().copy(actor.body.angvel())
              .cross(new Vector3().copy(point).sub(actor.body.worldCom())).add(actor.body.linvel())
            const vl = after(lever!), vbCarga = after(ball!), n = normalCarga!
            if (vl.dot(n) > .002 && vl.sub(at(lever!.id)).dot(n) > .002 && vbCarga.sub(at(ball!.id)).dot(n) > .002) {
              const fuerza = impulsoCarga / perfil.paso
              if (fuerza > (cargas.get(key)?.force ?? 0)) cargas.set(key, { from: lever!, to: ball!, force: fuerza })
            }
          }
          if(va.dot(normal)>.0001)entrantes.add(a.id)
          if(vb.dot(normal)<-.0001)entrantes.add(b.id)
          const speed = va.sub(vb).dot(normal)
          if (speed > closing) {
            closing = speed
            punto = point
            arriba = Math.abs(normal.y) >= .8 ? (normal.y < 0 ? a.id : b.id) : undefined
          }
        }
      })
      pairs.add(key)
      const old = hits.get(key)
      if (!old || closing > old.closing) hits.set(key, { a, b, force, closing, lateral, arriba, punto, entrantes })
    })
    const decisive = [...hits.entries()]
      .filter(([, h]) => h.closing > 0.002 && h.force > 0.0001)
      .sort(([a], [b]) => a.localeCompare(b))
    for (const [key, h] of decisive)
      if (!this.preceding.has(key) || h.closing > 0.1) {
        events.push(this.event('impacto', h.a.id, h.b.id, h.force, h.punto))
      }
    this.preceding = pairs
    // Sleeping bodies keep their contact geometry but emit no force events.
    // Retain an established support only while both bodies remain asleep and enabled.
    for (const key of this.apoyosBalancin) {
      if (!apoyosBalancin.has(key) && key.split('|').every(id => {
        const body = this.actors.get(id)!.body
        return body.isEnabled() && body.isSleeping()
      })) apoyosBalancin.add(key)
    }
    this.apoyosBalancin = apoyosBalancin
    // Resolve the transitive closure at this step so a simultaneous fork cannot lose a branch.
    const directos: {target:string;input:string;force:number}[] = []
    const pulsos = new Map<string, { input: string; force: number }[]>()
    const impulsados = new Map<string, Set<string>>()
    const transferencias = [...cargas.entries()].sort(([a], [b]) => a.localeCompare(b))
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
            !h.entrantes.has(from.id) ||
            (this.mandos.get(to.id) === 'lateral' && !h.lateral) ||
            (this.mandos.get(to.id) === 'superior' && h.arriba !== from.id)
          )
            continue
          if (to.asset === 'lever') {
            const entradas = impulsados.get(to.id) ?? new Set<string>()
            entradas.add(from.id)
            impulsados.set(to.id, entradas)
          }
          if (this.activas.has(to.id)) continue
          this.activas.add(to.id)
          events.push(this.event('activo', from.id, to.id, h.force))
          for (const target of this.triggers.get(to.id) ?? []) {
            const regla = this.secuencias.get(target.split('/')[0])
            if (regla) {
              const lista = pulsos.get(target) ?? []
              lista.push({ input: to.id, force: h.force })
              pulsos.set(target, lista)
            } else directos.push({target,input:to.id,force:h.force})
          }
          changed = true
        }
      }
      for (const [, { from, to, force }] of transferencias) {
        // Require a fresh causal hit from another piece, even if the lever was
        // already active. A returning, unrelated ball must not activate its load.
        if (!this.activas.has(from.id) || this.activas.has(to.id) ||
          ![...impulsados.get(from.id) ?? []].some(id => id !== to.id)) continue
        this.activas.add(to.id)
        events.push(this.event('activo', from.id, to.id, force))
        changed = true
      }
    }
    this.dispositivos.recibir(events)
    for (const pulso of directos) this.accionar(pulso.target,pulso.input,pulso.force,events)
    // All causal contacts for this physics tick are known before evaluating simultaneous inputs.
    for (const [target, lista] of pulsos) {
      const receptor = target.split('/')[0], secuencia = this.secuencias.get(receptor)!
      const mandos = lista.map(p => p.input.split('/')[0])
      if (!secuencia.registrar(mandos)) continue
      events.push(this.event('secuencia', lista[0].input, target))
      if (secuencia.completa) this.accionar(target, lista[0].input, lista[0].force, events)
    }
    this.dispositivos.avanzar(events)
    for (const e of events) e.intento = this.intento

    for (const [id, motor] of this.motores) {
      if (!this.accionados.has(id) || motor.enTope) continue
      const { body } = this.actors.get(id)!
      const puerta = motor.angular
      const recorrido = puerta ? motor.giro.angleTo(new Quaternion().copy(body.rotation()).normalize()) :
        new Vector3().copy(body.translation()).distanceTo(motor.inicio)
      if (recorrido >= Math.abs(motor.destino) - (puerta ? .025 : .0005)) {
        motor.enTope = true
        events.push(this.event('tope', id, ''))
      }
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
    const verticalMeta = 1 - 2 * (q.x * q.x + q.z * q.z)
    if (verticalMeta < .5) this.metaDerribada = true
    if (this.pasoVictoria === null && gana(this.activas.has('meta'), verticalMeta)) {
      this.pasoVictoria = this.tick
      events.push(this.event('victoria', 'meta', ''))
    }
    let quiet = !this.dispositivos.pendiente
    for (const a of this.actors.values()) {
      const b = a.body
      if (!a.dynamic || !b.isEnabled() || b.isFixed()) continue
      if (b.translation().y < perfil.descarte) {
        b.setEnabled(false)
        events.push(this.event('descarte', a.id, ''))
        continue
      }
      // A loaded joint can carry a small constraint velocity even after its pose has settled.
      // Measure displacement over a full rest window, including the tip of each hinged arm.
      if (a.asset === 'ball' && this.activas.has(a.id)) {
        const damping = rollingOnTable.has(a.id) && length(b.linvel()) < .045 ? 2.8 : 0
        if (b.linearDamping() !== damping) { b.setLinearDamping(damping); b.setAngularDamping(damping) }
      }
      let settled = false
      // Side contacts can hold a sphere in a corner while it spins in place.
      // Its settled centre must end the attempt just like a ball resting on top.
      if (touching.has(a.id) || this.suspended.has(a.id) || a.asset === 'paddle') {
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
      if (a.dynamic) {
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
