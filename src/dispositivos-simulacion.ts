import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { configuracion, direccionLanzador, velocidades, rigidezPlaca, type ConfiguracionDispositivo } from './dispositivos'
import { Polea } from './polea'
import { perfil, type PiezaColocada } from './types'
import type { Actor, SimEvent } from './simulation'

export type FaseDispositivo = 'vacio' | 'cargando' | 'cargado' | 'demora' | 'expulsion' | 'descargado' | 'moviendo' | 'bloqueado'
export interface EstadoDispositivo { fase: FaseDispositivo; bola?: string; vence?: number; desde?: number; origen?: Vector3 }
interface Dispositivo { pieza: PiezaColocada; config: ConfiguracionDispositivo; estado: EstadoDispositivo; polea?: Polea; muelle?: R.SpringImpulseJoint; descarga?: R.RevoluteImpulseJoint; quieto?: number; altura?: number }
interface Contexto {
  world: R.World; actors: Map<string, Actor>; activas: Set<string>; tick: number
  articulaciones: Map<string,R.UnitImpulseJoint>
}
export class DispositivosSimulacion {
  readonly estados = new Map<string,EstadoDispositivo>()
  private dispositivos: Dispositivo[] = []
  constructor(private ctx: Contexto, piezas: PiezaColocada[], precargas: PiezaColocada[]) {
    for(const pieza of piezas) {
      const config=configuracion(pieza)
      if(!config) continue
      const estado: EstadoDispositivo={fase:'vacio'}, d: Dispositivo={pieza,config,estado}
      this.dispositivos.push(d); this.estados.set(pieza.id,estado)
      if(config.clase==='lanzador' || config.clase==='retenedor') {
        const bola=precargas.find(p=>p.tipo==='bolita' && p.apoyo===pieza.id+'/apoyo')
        if(bola && config.modo==='cable') this.cargar(d,bola.id)
      }
      if(config.clase==='placa') {
        const head=ctx.actors.get(pieza.id+'/head')!.body
        head.setBodyType(R.RigidBodyType.Fixed,false)
      }
      if(config.clase==='elevador') {
        const a=ctx.actors.get(pieza.id+'/platform')!.body,b=ctx.actors.get(pieza.id+'/weight')!.body
        const stop=ctx.actors.get(pieza.id+'/stop')!.body
        d.descarga=ctx.world.createImpulseJoint(R.JointData.revolute({x:0,y:.001,z:.021},{x:0,y:0,z:0},{x:1,y:0,z:0}),a,stop,true) as R.RevoluteImpulseJoint
        d.descarga.setLimits(0,0);d.descarga.configureMotorModel(R.MotorModel.ForceBased)
        stop.setBodyType(R.RigidBodyType.Fixed,false)
        d.polea=new Polea(a,b,ctx.world,[stop])
        a.setBodyType(R.RigidBodyType.Fixed,false);b.setBodyType(R.RigidBodyType.Fixed,false)
      }
      if(config.clase==='retenedor' || config.clase==='lanzador') ctx.actors.get(pieza.id+'/stop')!.body.setBodyType(R.RigidBodyType.Fixed,false)
    }
  }
  private evento(tipo: SimEvent['tipo'],d:Dispositivo,b='',fuerza=0):SimEvent {
    return {tipo,a:d.pieza.id,b,fuerza,paso:this.ctx.tick,intento:1,materialA:d.config.clase,materialB:b?this.ctx.actors.get(b)?.asset??'':'',posicion:[...d.pieza.posicion]}
  }
  private local(d:Dispositivo,b:R.RigidBody) {
    return new Vector3().copy(b.translation()).sub(new Vector3(...d.pieza.posicion))
      .applyAxisAngle(new Vector3(0,1,0),-d.pieza.giroY*Math.PI/180)
  }
  private cargar(d:Dispositivo,id:string) {
    d.estado.bola=id;d.estado.fase='cargado'
    // A retaining catch holds the existing body in the position it actually reached.
    if(d.config.clase==='lanzador') {
      const body=this.ctx.actors.get(id)!.body
      body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false)
      body.setBodyType(R.RigidBodyType.Fixed,false)
    }
  }
  antesDelPaso() {
    for(const d of this.dispositivos) if(d.config.clase==='elevador' && ['moviendo','bloqueado','descargado'].includes(d.estado.fase))
      d.polea!.resolver(perfil.paso)
  }
  /** Called after causal contacts, before signal delivery, including same-tick loading. */
  recibir(eventos:SimEvent[]) {
    for(const d of this.dispositivos) {
      const {config:c,estado:s,pieza:p}=d
      if((c.clase==='lanzador'||c.clase==='retenedor') && ['vacio','cargando'].includes(s.fase)) {
        let dentroAlguna=false
        for(const actor of this.ctx.actors.values()) {
          if(actor.asset!=='ball'||!actor.body.isEnabled())continue
          const q=this.local(d,actor.body),vel=actor.body.linvel()
          if(Math.abs(q.x)<.03 && Math.abs(q.z)<.033 && q.y>.008 && q.y<.060) dentroAlguna=true
          const dentro=c.clase==='lanzador' ? Math.abs(q.x)<.009 && Math.abs(q.z)<.010 && q.y>.0175 && q.y<.0195 :
            Math.abs(q.x)<.010 && q.z>-.021 && q.z<-.004 && q.y>.013 && q.y<.030
          if(!dentro)continue
          if(s.fase!=='cargando') {s.fase='cargando';s.desde=this.ctx.tick}
          if(Math.abs(vel.y)<.035 && Math.hypot(vel.x,vel.z)<.1 && this.ctx.tick-s.desde!>=5) {
            this.cargar(d,actor.id);eventos.push(this.evento('captura',d,actor.id));break
          }
        }
        if(!dentroAlguna) {s.fase='vacio';s.desde=undefined}
      }
      if((c.clase==='lanzador'||c.clase==='retenedor') && s.fase==='cargado' && c.modo==='automatico' && this.ctx.activas.has(s.bola!))
        this.iniciar(d,eventos)
      if(c.clase==='placa' && s.fase==='vacio' && eventos.some(e=>e.tipo==='impacto' && ((e.a===p.id+'/head' && this.ctx.activas.has(e.b)) || (e.b===p.id+'/head' && this.ctx.activas.has(e.a))))) { this.ctx.activas.add(p.id+'/head'); this.iniciar(d,eventos) }
      if(c.clase==='elevador' && c.modo==='automatico' && s.fase==='vacio' && eventos.some(e=>e.tipo==='impacto' &&
        ((e.a===p.id+'/platform' && this.ctx.activas.has(e.b)) || (e.b===p.id+'/platform' && this.ctx.activas.has(e.a))))) this.iniciar(d,eventos)
    }
  }
  senal(target:string,eventos:SimEvent[]):boolean {
    const d=this.dispositivos.find(d=>target.startsWith(d.pieza.id+'/'))
    if(!d)return false
    if(!('modo' in d.config) || d.config.modo!=='cable')return true
    if(d.config.clase==='elevador') {
      if(d.estado.fase==='vacio')this.iniciar(d,eventos)
    } else if(d.estado.fase==='cargado')this.iniciar(d,eventos)
    else if(['vacio','cargando'].includes(d.estado.fase))eventos.push(this.evento('senal-ignorada',d))
    return true
  }
  private iniciar(d:Dispositivo,eventos:SimEvent[]) {
    const {config:c,estado:s,pieza:p}=d
    s.desde=this.ctx.tick
    if(c.clase==='lanzador'||c.clase==='retenedor') {
      this.ctx.activas.add(s.bola!);s.fase='demora'
      s.vence=this.ctx.tick+(c.clase==='retenedor'&&c.modo==='cable'?0:Math.round(c.demora/perfil.paso))
    } else if(c.clase==='placa') {
      const b=this.ctx.actors.get(p.id+'/head')!.body
      b.setBodyType(R.RigidBodyType.Dynamic,true)
      const axis=new Vector3(0,1,0).applyQuaternion(new Quaternion().copy(b.rotation()))
      const rest=new Vector3().copy(b.translation()).addScaledVector(axis,.012)
      const anchor=this.ctx.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(rest.x,rest.y,rest.z))
      // Finite stored spring energy, transferred through contacts to any incoming body.
      const k=rigidezPlaca[c.potencia]
      d.muelle=this.ctx.world.createImpulseJoint(R.JointData.spring(0,k,.015,{x:0,y:0,z:0},{x:0,y:0,z:0}),anchor,b,true) as R.SpringImpulseJoint
      s.fase='moviendo';eventos.push(this.evento('disparo',d,p.id+'/head'))
    } else {
      for(const part of ['platform','weight','stop']) {
        const id=p.id+'/'+part, body=this.ctx.actors.get(id)!.body
        body.setBodyType(R.RigidBodyType.Dynamic,true);body.recomputeMassPropertiesFromColliders();this.ctx.activas.add(id)
      }
      s.fase='moviendo';eventos.push(this.evento('liberacion',d,p.id+'/platform'))
    }
  }
  avanzar(eventos:SimEvent[]) {
    for(const d of this.dispositivos) {
      const {config:c,estado:s,pieza:p}=d
      if(c.clase==='lanzador' && s.fase==='demora' && this.ctx.tick===s.vence!-10) {
        this.ctx.actors.get(p.id+'/stop')!.body.setBodyType(R.RigidBodyType.Dynamic,true)
        const catchJoint=this.ctx.articulaciones.get(p.id+'/stop')!
        catchJoint.configureMotorModel(R.MotorModel.ForceBased);catchJoint.configureMotorPosition(.035,12,.18)
      }
      if(s.fase==='demora' && this.ctx.tick>=s.vence!) {
        const bola=this.ctx.actors.get(s.bola!)!.body
        s.origen=new Vector3().copy(bola.translation());s.desde=this.ctx.tick;s.fase='expulsion'
        if(c.clase==='lanzador') {
          bola.setBodyType(R.RigidBodyType.Dynamic,true)
          const v=new Vector3(...direccionLanzador(p.giroY,c.inclinacion)).multiplyScalar(velocidades[c.potencia])
          bola.setLinvel(v,true)
          eventos.push(this.evento('disparo',d,s.bola))
        } else {
          this.ctx.actors.get(p.id+'/stop')!.body.setBodyType(R.RigidBodyType.Dynamic,true)
          this.ctx.articulaciones.get(p.id+'/stop')!.configureMotorModel(R.MotorModel.ForceBased)
          this.ctx.articulaciones.get(p.id+'/stop')!.configureMotorPosition(.030,12,.18)
          bola.wakeUp()
          eventos.push(this.evento('liberacion',d,s.bola))
        }
      }
      if(s.fase==='expulsion') {
        const pos=this.ctx.actors.get(s.bola!)!.body.translation()
        const eje=new Vector3(...direccionLanzador(p.giroY,c.clase==='lanzador'?c.inclinacion:0))
        if(new Vector3().copy(pos).sub(s.origen!).dot(eje)>.045)s.fase='descargado'
        else if(this.ctx.tick-s.desde!>=120) {s.fase='bloqueado';eventos.push(this.evento('bloqueo',d,s.bola))}
      }
      if(c.clase==='placa'&&s.fase==='moviendo'&&this.ctx.tick-s.desde!>=30) {
        if(d.muelle)this.ctx.world.removeImpulseJoint(d.muelle,true)
        s.fase='descargado'
      }
      if(c.clase==='elevador'&&['moviendo','bloqueado'].includes(s.fase)) {
        const platform=this.ctx.actors.get(p.id+'/platform')!.body
        const delta=platform.translation().y-p.posicion[1]-.012
        if(delta>=.119) {
          d.descarga!.setLimits(0,Math.PI/2);d.descarga!.configureMotorPosition(Math.PI/2,.1,.005);s.fase='descargado';eventos.push(this.evento('liberacion',d))
        } else if(d.altura===undefined || Math.abs(delta-d.altura)>.0008) {
          d.altura=delta;d.quieto=this.ctx.tick;s.fase='moviendo'
        } else if(s.fase==='moviendo' && this.ctx.tick-d.quieto!>=60) {
          s.fase='bloqueado';eventos.push(this.evento('bloqueo',d))
        }
      }
    }
  }
  get pendiente() {return this.dispositivos.some(d=>d.estado.fase==='demora'||d.estado.fase==='expulsion'||
    (d.config.clase==='placa'&&d.estado.fase==='moviendo'))}
}
