import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Editor } from '../src/editor'
import { campana, nivelPorId } from '../src/levels'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import { permiteTipo, nivelTaller } from '../src/taller'
import { predeterminadas } from '../src/dispositivos'
import type { Armado } from '../src/types'

beforeAll(initPhysics)
const nuevos = ['salto','recepcion','disparo','espera','saltos','contrapeso'] as const
const leer=(id:string):{armado:Armado;esperado:string}=>JSON.parse(readFileSync(new URL('./fixtures/'+id+'.json',import.meta.url),'utf8'))
function ejecutar(a:Armado,velocidad=1) {
  const nivel=a.nivel==='taller'?nivelTaller('Banco'):nivelPorId(a.nivel)
  new Editor(nivel).cargar(a)
  const sim=new Simulation(nivel,a),eventos:SimEvent[]=[]
  try {
    // The same fixed steps are fed at two presentation rates; no wall-clock timer drives a device.
    for(let frame=0;frame<16000&&!sim.result;frame++) {
      const pasos=velocidad===1?4:1
      for(let j=0;j<pasos&&!sim.result;j++)eventos.push(...sim.step())
    }
    expect(sim.result).not.toBeNull()
    return {resultado:sim.result,eventos,poses:sim.poses(),tick:sim.tick}
  }finally{sim.dispose()}
}
it('ordena 16 desafíos y reserva el péndulo para el taller',()=>{
  expect(campana.map(n=>n.id)).toEqual(['recta','curva','libro','taza','vuelta','bajada','subibaja','salto','recepcion','puerta','disparo','puente','espera','saltos','contrapeso','mate'])
  for(const [i,n] of campana.entries()) {
    expect(n.requiere).toBe(i?campana[i-1].id:null)
    expect(n.inventario.pendulo).toBe(0)
  }
  expect(permiteTipo('pendulo',['vuelta'])).toBe(true)
  for(const [tipo,nivel] of [['lanzador','salto'],['retenedor','espera'],['placa','saltos'],['elevador','contrapeso']] as const) {
    expect(permiteTipo(tipo,[])).toBe(false);expect(permiteTipo(tipo,[nivel])).toBe(true)
  }
})
it.each(nuevos.flatMap(id=>[id,id+'-alternativo',id+'-fallo']))('%s es construible y conserva su desenlace',id=>{
  const {armado,esperado}=leer(id),r=ejecutar(armado)
  expect(r.resultado).toBe(esperado)
  expect(r.eventos.filter(e=>e.tipo==='empujon')).toHaveLength(1)
  if(esperado==='victoria')expect(r.eventos.filter(e=>e.tipo==='victoria')).toHaveLength(1)
})
it.each(nuevos)('%s repite eventos y poses en ocho intentos y dos a velocidad lenta',id=>{
  const {armado}=leer(id),referencia=ejecutar(armado)
  for(let i=0;i<7;i++)expect(ejecutar(armado)).toEqual(referencia)
  for(let i=0;i<2;i++)expect(ejecutar(armado,.25)).toEqual(referencia)
})
it('una carga simultánea precede a la señal; una señal anterior se pierde',()=>{
  const r=ejecutar(leer('disparo').armado),carga=r.eventos.find(e=>e.tipo==='captura')!
  expect(r.eventos.find(e=>e.tipo==='activo'&&e.b==='mando/paddle')!.paso).toBe(carga.paso)
  expect(r.eventos.some(e=>e.tipo==='disparo')).toBe(true)
  const fallo=ejecutar(leer('disparo-fallo').armado)
  expect(fallo.eventos.find(e=>e.tipo==='senal-ignorada')!.paso).toBeLessThan(fallo.eventos.find(e=>e.tipo==='captura')!.paso)
  expect(fallo.eventos.some(e=>e.tipo==='disparo')).toBe(false)
})
it('el montaje instalado permanece fijo y preconectado',()=>{
  const n=nivelPorId('disparo'),antes=structuredClone(n),ed=new Editor(n)
  expect(ed.configurarDispositivo('lanzador',predeterminadas.lanzador)).toBe(false)
  expect(ed.conectar('mando','lanzador')).toBe(false)
  expect(ed.mover({...n.instalacion!.dispositivos[0],giroY:180})).toBe(false)
  expect(n).toEqual(antes)
})
it.each([100,200])('el banco de %i objetos es construible y activa los cuatro dispositivos',total=>{
  const {armado}=leer('dispositivos'+total),r=ejecutar(armado)
  expect(armado.piezas).toHaveLength(total)
  expect(r.resultado).toBe('detenida')
  for(const id of ['lanzador','retenedor','placa','elevador'])
    expect(r.eventos.some(e=>e.a===id&&['disparo','liberacion'].includes(e.tipo))).toBe(true)
  for(const id of ['lanzador','placa'])expect(r.eventos.filter(e=>e.a===id&&e.tipo==='disparo')).toHaveLength(1)
})
it('cada fallo nuevo se repara cambiando una sola decisión del montaje',()=>{
  const diferencias=(a:unknown,b:unknown):number=>{
    if(a===b)return 0
    if(a&&b&&typeof a==='object'&&typeof b==='object')
      return [...new Set([...Object.keys(a),...Object.keys(b)])].reduce((n,k)=>n+diferencias((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]),0)
    return 1
  }
  for(const id of nuevos)expect(diferencias(leer(id).armado.piezas,leer(id+'-fallo').armado.piezas),id).toBe(1)
})
