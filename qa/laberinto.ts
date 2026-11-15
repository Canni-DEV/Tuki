import type {Armado,Nivel,PiezaColocada,Vec3} from '../src/types'

export type RutaLaberinto = 'corto' | 'rodeo'
type Punto = [number,number]

/** Centerlines for independent QA, not a path restriction or a hint in the game. */
export function recorridoLaberinto(ruta:RutaLaberinto) {
  const puntos:Vec3[]=[]
  const agregar=(x:number,z:number)=>puntos.push([x,0,z])
  const recta=(a:Punto,b:Punto)=>{
    const pasos=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.002)
    for(let i=0;i<=pasos;i++)agregar(a[0]+(b[0]-a[0])*i/pasos,a[1]+(b[1]-a[1])*i/pasos)
  }
  const arco=(x:number,z:number,r:number,a:number,b:number)=>{
    const pasos=Math.ceil(Math.abs(b-a)*r/.002)
    for(let i=0;i<=pasos;i++){
      const t=a+(b-a)*i/pasos
      agregar(x+r*Math.cos(t),z+r*Math.sin(t))
    }
  }
  if(ruta==='rodeo')recta([-.44,-.38],[.285,-.38])
  else {
    arco(-.44,-.33,.05,-Math.PI/2,0)
    recta([-.39,-.33],[-.39,.14])
    arco(-.34,.14,.05,Math.PI,Math.PI/2)
    recta([-.34,.19],[.285,.19])
  }
  for(let fila=ruta==='rodeo'?0:6;fila<8;fila++){
    const z=-.38+fila*.095,derecha=fila%2===0,x=derecha?.285:-.195
    arco(x,z+.0475,.0475,-Math.PI/2,derecha?Math.PI/2:-Math.PI*1.5)
    recta([x,z+.095],[fila===7?.345:derecha?-.195:.285,z+.095])
  }
  return puntos
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
  const medidos=medirRecorrido(recorridoLaberinto(ruta)),largo=medidos.at(-1)!.longitud
  return medidos.filter(({longitud})=>longitud>=.027&&longitud<=largo-.027).map(({p})=>p)
}

export function armadoRecorrido(n:Nivel,ruta:RutaLaberinto,separacion:number) {
  const medidos=medirRecorrido(recorridoLaberinto(ruta)),a=armadoVacio(n)
  let siguiente=separacion
  for(let i=1;i<medidos.length;i++){
    const {p:inicio,longitud:desde}=medidos[i-1],{p:fin,longitud:hasta}=medidos[i]
    while(siguiente<hasta-1e-10){
      const t=(siguiente-desde)/(hasta-desde)
      const p:PiezaColocada={id:'d'+(a.piezas.length+1),tipo:'domino',apoyo:'tablero',
        posicion:[inicio[0]+(fin[0]-inicio[0])*t,0,inicio[2]+(fin[2]-inicio[2])*t],
        giroY:Math.atan2(fin[0]-inicio[0],fin[2]-inicio[2])*180/Math.PI}
      a.piezas.push(p);siguiente+=separacion
    }
  }
  if(a.piezas.length&&Math.hypot(a.piezas.at(-1)!.posicion[0]-.345,a.piezas.at(-1)!.posicion[2]-.38)<.018)a.piezas.pop()
  a.saldo.domino-=a.piezas.length
  return a
}

function armadoVacio(n:Nivel):Armado {
  return {nivel:n.id,revision:n.revision,perfilFisico:n.perfilFisico,version:5,piezas:[],saldo:{...n.inventario},conexiones:[]}
}

/** Spend more pieces in bends. With a fixed budget the remaining gaps must grow. */
export function rodeoMixto(n:Nivel,recta:number,curva:number,presupuesto?:number) {
  const puntos=recorridoLaberinto('rodeo'),a=armadoVacio(n)
  let costo=0
  const medidas=puntos.map((p,i)=>{
    if(i){
      const prev=puntos[i-1],d=Math.hypot(p[0]-prev[0],p[2]-prev[2])
      costo+=d/(Math.abs(p[2]-prev[2])>1e-9?curva:recta)
    }
    return {p,costo}
  })
  const paso=presupuesto===undefined?1:costo/(presupuesto+1)
  let siguiente=paso
  for(let i=1;i<medidas.length;i++){
    const prev=medidas[i-1],fin=medidas[i]
    while(siguiente<fin.costo-1e-9){
      const t=(siguiente-prev.costo)/(fin.costo-prev.costo)
      a.piezas.push({id:'d'+(a.piezas.length+1),tipo:'domino',apoyo:'tablero',
        posicion:[prev.p[0]+(fin.p[0]-prev.p[0])*t,0,prev.p[2]+(fin.p[2]-prev.p[2])*t],
        giroY:Math.atan2(fin.p[0]-prev.p[0],fin.p[2]-prev.p[2])*180/Math.PI})
      siguiente+=paso
    }
  }
  if(presupuesto===undefined&&Math.hypot(a.piezas.at(-1)!.posicion[0]-.345,a.piezas.at(-1)!.posicion[2]-.38)<.018)a.piezas.pop()
  a.saldo.domino-=a.piezas.length
  return a
}
