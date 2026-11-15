import {readFileSync} from 'node:fs'
import {Editor} from '../src/editor'
import {nivelPorId} from '../src/levels'
import type {Armado,Nivel} from '../src/types'

export const referencias=['recta','s','rampa','taza-fichas','vuelta','bajada','subibaja','salto','recepcion','puerta','disparo','puente','espera','saltos','contrapeso','mate','llave-abierta']
export const referencia=(nombre:string):Armado=>JSON.parse(readFileSync(new URL('./fixtures/'+nombre+'.json',import.meta.url),'utf8')).armado

/** Fixed, reproducible acceptance matrix: cycle through pieces, X/Z/yaw, then both signs.
 * Rejected placements are reported as invalid proposals, not simulated failures. */
export function perturbaciones(a:Armado,n:Nivel=nivelPorId(a.nivel)){
  const validas:{id:string;eje:string;delta:number;armado:Armado}[]=[]
  let rechazadas=0
  for(let k=0;k<a.piezas.length*12&&validas.length<24;k++){
    const e=new Editor(n);e.cargar(a)
    const p=structuredClone(a.piezas[k%a.piezas.length]),ciclo=Math.floor(k/a.piezas.length),eje=ciclo%3,signo=ciclo<3?1:-1
    if(eje===2)p.giroY+=signo*2
    else p.posicion[eje===0?0:2]+=signo*.002
    if(!e.mover(p)){rechazadas++;continue}
    validas.push({id:p.id,eje:['x','z','giroY'][eje],delta:signo*(eje===2?2:.002),armado:e.armado})
  }
  return {validas,rechazadas}
}
