import type {Armado,Nivel,PiezaColocada,Vec3} from '../src/types'

export type RutaLaberinto = 'corto' | 'izquierda' | 'derecha'
type Punto = [number,number]

// Keep this helper usable from Node/Playwright without importing the campaign's JSON modules.
function vacio(n:Nivel):Armado {
  return {nivel:n.id,revision:n.revision,perfilFisico:n.perfilFisico,piezas:[],saldo:{...n.inventario},conexiones:[]}
}

// Independent authoring controls, never a hint or a route restriction in the game.
const rutas:Record<RutaLaberinto,Punto[]>={
  corto:[[-.24,.27],[-.24,.23],[-.16,.17],[-.16,.06],[-.18,-.07],[-.14,-.095],[.075,-.115],
    [.105,-.09],[.105,-.04],[.15,.005],[.21,.005],[.245,-.04],[.245,-.20],[.26,-.25]],
  izquierda:[[-.24,.27],[-.24,.23],[-.19,.21],[-.15,.27],[-.23,.335],[-.435,.335],
    [-.435,-.33],[-.425,-.425],[.18,-.425],[.225,-.34],[.225,-.29],[.26,-.25]],
  derecha:[[-.24,.27],[-.24,.23],[-.19,.21],[-.15,.27],[-.03,.335],[.11,.335],[.17,.405],
    [.29,.405],[.425,.32],[.43,-.425],[.225,-.425],[.225,-.34],[.225,-.29],[.26,-.25]],
}

/** Rounded corners leave turning space instead of requiring exact right-angle joints. */
export function recorridoLaberinto(ruta:RutaLaberinto) {
  const puntos=rutas[ruta],out:Vec3[]=[]
  const recta=(a:Punto,b:Punto)=>{
    const pasos=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.002)
    for(let i=0;i<pasos;i++)out.push([a[0]+(b[0]-a[0])*i/pasos,0,a[1]+(b[1]-a[1])*i/pasos])
  }
  let anterior=puntos[0]
  for(let i=1;i<puntos.length-1;i++){
    const p=puntos[i],prev=puntos[i-1],next=puntos[i+1]
    const d1=Math.hypot(prev[0]-p[0],prev[1]-p[1]),d2=Math.hypot(next[0]-p[0],next[1]-p[1])
    const radio=Math.min(.04,d1*.45,d2*.45)
    const a:Punto=[p[0]+(prev[0]-p[0])*radio/d1,p[1]+(prev[1]-p[1])*radio/d1]
    const b:Punto=[p[0]+(next[0]-p[0])*radio/d2,p[1]+(next[1]-p[1])*radio/d2]
    recta(anterior,a)
    for(let k=0;k<30;k++){
      const t=k/30
      out.push([(1-t)**2*a[0]+2*t*(1-t)*p[0]+t*t*b[0],0,(1-t)**2*a[1]+2*t*(1-t)*p[1]+t*t*b[1]])
    }
    anterior=b
  }
  const fin=puntos.at(-1)!
  recta(anterior,fin);out.push([fin[0],0,fin[1]])
  return out
}

export function medirRecorrido(puntos:Vec3[]) {
  let longitud=0
  return puntos.map((p,i)=>{
    if(i)longitud+=Math.hypot(p[0]-puntos[i-1][0],p[2]-puntos[i-1][2])
    return {p,longitud}
  })
}

/** Start beyond the installed domino and stop before the flag, as a player would. */
export function trazoLaberinto(ruta:RutaLaberinto='corto') {
  const medidos=medirRecorrido(recorridoLaberinto(ruta)),fin=medidos.at(-1)!.p
  const puntos=medidos.filter(({longitud})=>longitud>=.027).map(({p})=>p)
  while(puntos.length&&Math.hypot(puntos.at(-1)![0]-fin[0],puntos.at(-1)![2]-fin[2])<.027)puntos.pop()
  return puntos
}

function ficha(desde:Vec3,hasta:Vec3,t:number,id:string):PiezaColocada {
  return {id,tipo:'domino',apoyo:'tablero',posicion:[desde[0]+(hasta[0]-desde[0])*t,0,desde[2]+(hasta[2]-desde[2])*t],
    giroY:Math.atan2(hasta[0]-desde[0],hasta[2]-desde[2])*180/Math.PI}
}

export function armadoRecorrido(n:Nivel,ruta:RutaLaberinto,separacion:number) {
  const medidos=medirRecorrido(recorridoLaberinto(ruta)),a=vacio(n)
  let siguiente=separacion
  for(let i=1;i<medidos.length;i++){
    const prev=medidos[i-1],fin=medidos[i]
    while(siguiente<fin.longitud){
      a.piezas.push(ficha(prev.p,fin.p,(siguiente-prev.longitud)/(fin.longitud-prev.longitud),'d'+a.piezas.length))
      siguiente+=separacion
    }
  }
  const meta=medidos.at(-1)!.p,ultima=a.piezas.at(-1)!
  if(Math.hypot(ultima.posicion[0]-meta[0],ultima.posicion[2]-meta[2])<.018)a.piezas.pop()
  a.saldo.domino-=a.piezas.length
  return a
}

/** Spend more of a fixed budget in bends, with the same safe first/last contacts. */
export function rodeoMixto(n:Nivel,ruta:Exclude<RutaLaberinto,'corto'>,presupuesto:number,pesoCurva:number) {
  const puntos=trazoLaberinto(ruta),a=vacio(n)
  let costo=0
  const medidas=puntos.map((p,i)=>{
    if(i){
      const prev=puntos[i-1],next=puntos[Math.min(i+1,puntos.length-1)]
      const dx=p[0]-prev[0],dz=p[2]-prev[2],d=Math.hypot(dx,dz)
      const delta=Math.atan2(next[0]-p[0],next[2]-p[2])-Math.atan2(dx,dz)
      const giro=Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))
      costo+=d*(giro>.001?pesoCurva:1)
    }
    return {p,costo}
  })
  let indice=1
  for(let i=0;i<presupuesto;i++){
    const objetivo=costo*i/(presupuesto-1)
    while(indice<medidas.length-1&&medidas[indice].costo<objetivo)indice++
    const prev=medidas[indice-1],fin=medidas[indice]
    a.piezas.push(ficha(prev.p,fin.p,(objetivo-prev.costo)/(fin.costo-prev.costo||1),'d'+i))
  }
  a.saldo.domino-=a.piezas.length
  return a
}
