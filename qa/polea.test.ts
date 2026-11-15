import R from '@dimforge/rapier3d-compat'
import { beforeAll, expect, it } from 'vitest'
import { initPhysics } from '../src/simulation'
import { Polea } from '../src/polea'

beforeAll(initPhysics)
function banco(ma=.01,mb=.01) {
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/120;world.lengthUnit=.05;world.numSolverIterations=8
  const guia=world.createRigidBody(R.RigidBodyDesc.fixed())
  const cuerpo=(x:number,m:number)=>{
    const b=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,.2,0).setCanSleep(false))
    world.createCollider(R.ColliderDesc.cuboid(.015,.005,.015).setMass(m),b)
    const j=world.createImpulseJoint(R.JointData.prismatic({x,y:.2,z:0},{x:0,y:0,z:0},{x:0,y:1,z:0}),guia,b,true) as R.PrismaticImpulseJoint
    j.setLimits(-.12,.12)
    return b
  }
  const a=cuerpo(-.05,ma),b=cuerpo(.05,mb),polea=new Polea(a,b,world)
  const paso=()=>{polea.resolver(1/120);world.step()}
  return {world,a,b,polea,paso}
}
it('masas iguales se equilibran sin motor de posición',()=>{
  const s=banco()
  try{for(let i=0;i<600;i++)s.paso();expect(s.a.translation().y).toBeCloseTo(.2,4);expect(s.b.translation().y).toBeCloseTo(.2,4)}finally{s.world.free()}
})
it.each([[.01,.02],[.02,.01]])('el balance %f/%f determina sentido y aceleración', (ma,mb)=>{
  const s=banco(ma,mb)
  try{
    for(let i=0;i<12;i++)s.paso()
    expect(s.a.linvel().y).toBeCloseTo(9.81*(mb-ma)/(ma+mb)*.1,2)
    expect(Math.abs(s.polea.extension)).toBeLessThan(.0005)
    for(let i=0;i<300;i++)s.paso()
    expect(Math.abs(s.a.translation().y-.2)).toBeLessThanOrEqual(.1205)
    expect(Math.abs(s.polea.extension)).toBeLessThan(.0005)
  }finally{s.world.free()}
})
it('la cuerda floja no empuja los cuerpos',()=>{
  const s=banco()
  try{
    s.a.setTranslation({x:-.05,y:.24,z:0},true);s.paso()
    expect(s.a.linvel().y).toBeLessThan(0);expect(s.b.linvel().y).toBeLessThan(0)
    expect(s.polea.extension).toBeLessThan(-.03)
  }finally{s.world.free()}
})
it('un obstáculo frena el recorrido sin que el acoplamiento lo atraviese',()=>{
  const s=banco(.01,.02)
  try{
    s.world.createCollider(R.ColliderDesc.cuboid(.025,.005,.025).setTranslation(-.05,.24,0))
    for(let i=0;i<600;i++)s.paso()
    expect(s.a.translation().y).toBeLessThan(.231)
    expect(Math.abs(s.polea.extension)).toBeLessThan(.001)
  }finally{s.world.free()}
})
it('una carga apoyada cambia el balance mediante contactos reales',()=>{
  const s=banco(.01,.02)
  try{
    const carga=s.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(-.05,.211,0).setCanSleep(false))
    s.world.createCollider(R.ColliderDesc.cuboid(.008,.005,.008).setMass(.02),carga)
    for(let i=0;i<90;i++)s.paso()
    expect(s.a.translation().y).toBeLessThan(.19)
    expect(s.b.translation().y).toBeGreaterThan(.21)
    expect(Math.abs(carga.translation().y-s.a.translation().y-.010)).toBeLessThan(.001)
  }finally{s.world.free()}
})
