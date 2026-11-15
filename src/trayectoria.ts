import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { asientoLanzador, configuracion, direccionLanzador, velocidades } from './dispositivos'
import { placedShapes, yaw } from './geometry'
import { objetosDeNivel } from './levels'
import { pieceAsset, perfil, type Nivel, type PiezaColocada, type Vec3 } from './types'

/** Snapshot preview: swept ball radius, gravity and current obstacle poses only. */
export function trayectoriaLanzador(nivel: Nivel, pieza: PiezaColocada, piezas: PiezaColocada[]): Vec3[] {
  const c=configuracion(pieza)
  if(c?.clase!=='lanzador')return []
  const bola=piezas.find(p=>p.tipo==='bolita'&&p.apoyo===pieza.id+'/apoyo')
  let p=bola ? new Vector3(...bola.posicion) : new Vector3(...asientoLanzador).applyQuaternion(yaw(pieza.giroY)).add(new Vector3(...pieza.posicion))
  const v=new Vector3(...direccionLanzador(pieza.giroY,c.inclinacion)).multiplyScalar(velocidades[c.potencia])
  const objetos=[...objetosDeNivel(nivel),...piezas.map(o=>({...o,activo:pieceAsset(o.tipo,o.configuracion),escala:undefined}))]
    .filter(o=>o.id!==pieza.id && o.id!==bola?.id)
  const solidos=objetos.flatMap(o=>placedShapes(o.activo,o,o.escala))
  const esfera=new R.Ball(.008),q=new Quaternion(),cero=new Vector3(),puntos:Vec3[]=[p.toArray() as Vec3]
  for(let i=0;i<360;i++) {
    const next=p.clone().addScaledVector(v,perfil.paso).add(new Vector3(0,-9.81*perfil.paso**2/2,0))
    const desplazamiento=next.clone().sub(p)
    let impacto=1
    for(const s of solidos) {
      const hit=esfera.castShape(p,q,desplazamiento,s.shape,s.p,s.q,cero,0,1,true)
      if(hit)impacto=Math.min(impacto,hit.time_of_impact)
    }
    p.addScaledVector(desplazamiento,impacto);puntos.push(p.toArray() as Vec3)
    if(impacto<1 || p.y<perfil.descarte)break
    v.y-=9.81*perfil.paso
  }
  return puntos
}
