import {afterEach,beforeAll,expect,it} from 'vitest'
import {validarConstruccion} from '../src/construccion'
import {Editor} from '../src/editor'
import {nivelPorId,vacio} from '../src/levels'
import {initPhysics,Simulation,type SimEvent} from '../src/simulation'
import {armadoDeMesa,leerMesa,mesaNueva,nivelTaller} from '../src/taller'
import type {Armado,Nivel} from '../src/types'
import {perturbaciones,referencia,referencias} from './normalizacion'

beforeAll(initPhysics)
// Give the runner a turn between CPU-bound physics batches so it can publish results.
afterEach(()=>new Promise<void>(resolve=>setTimeout(resolve,0)))
function probar(n:Nivel,a:Armado,lento=false){
  new Editor(n).cargar(a)
  const s=new Simulation(n,a),eventos:SimEvent[]=[]
  try{
    while(!s.result&&s.tick<36000)for(let i=0;i<(lento?1:4)&&!s.result;i++)eventos.push(...s.step())
    return {resultado:s.result,pasos:s.tick,eventos,poses:[...s.poses()]}
  }finally{s.dispose()}
}
const alternativas:Record<string,string>={'taza-fichas':'taza-mixta',mate:'mate-rodeo'}
const esenciales:Record<string,string>={recta:'d3,d4',s:'d4,d5',rampa:'bola','taza-fichas':'d5',vuelta:'bola',bajada:'codo2',subibaja:'bola2',salto:'lanzador',recepcion:'lanzador',espera:'retenedor',saltos:'placa2',contrapeso:'elevador'}

it.each(referencias)('%s conserva catálogo, reconstrucción, solución y repetibilidad',nombre=>{
  const a=referencia(nombre),n=nivelPorId(a.nivel)
  expect(n.motivo?.trim()).toBeTruthy()
  expect(n.objetos!.every(p=>!Object.hasOwn(p,'escala'))).toBe(true)
  validarConstruccion(n.objetos!,n.formatoMesa!)
  const m=leerMesa({...mesaNueva(n.nombre,n.formatoMesa),ordenFisico:n.ordenFisico,empujon:n.empujon,
    piezas:[...n.objetos!,...a.piezas],conexiones:[...n.instalacion?.conexiones??[],...a.conexiones??[]],secuencias:n.instalacion?.secuencias})
  const esperado=probar(n,a)
  expect(esperado.resultado).toBe('victoria')
  expect(probar(n,vacio(n)).resultado).toBe('detenida')
  const libre=nivelTaller(n.nombre,m),reconstruido=probar(libre,armadoDeMesa(libre,m))
  expect(reconstruido).toEqual(esperado)
  for(let i=1;i<10;i++)expect(probar(n,a)).toEqual(esperado)
  expect(probar(n,a,true)).toEqual(esperado)
  expect(probar(n,referencia(alternativas[nombre]??nombre+'-alternativo')).resultado).toBe('victoria')
  if(n.instalacion?.conexiones.length){
    const sinCircuito=structuredClone(n);sinCircuito.instalacion!.conexiones=[]
    expect(probar(sinCircuito,a).resultado).toBe('detenida')
    if(nombre==='puente'){
      const e=new Editor(n);e.cargar(a);e.seleccion='bola2';expect(e.retirar()).toBe(true)
      expect(probar(n,e.armado).resultado).toBe('detenida')
    }
  }else{
    const e=new Editor(n);e.cargar(a)
    for(const id of esenciales[nombre].split(',')){e.seleccion=id;expect(e.retirar()).toBe(true)}
    expect(probar(n,e.armado).resultado).toBe('detenida')
  }
},30000)

it.each(referencias)('%s supera 22 de 24 ajustes válidos de 2 mm o 2 grados',nombre=>{
  const a=referencia(nombre),n=nivelPorId(a.nivel),{validas}=perturbaciones(a,n)
  expect(validas).toHaveLength(24)
  const fallos=validas.filter(p=>probar(n,p.armado).resultado!=='victoria')
  expect(fallos.length,JSON.stringify(fallos.map(({id,eje,delta})=>({id,eje,delta})))).toBeLessThanOrEqual(2)
},30000)
