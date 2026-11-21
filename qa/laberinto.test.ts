import {beforeAll,expect,it} from 'vitest'
import {Editor,validarPieza} from '../src/editor'
import {campana,nivelPorId,surfaceRect,vacio,variantes} from '../src/levels'
import {acreditarVictoria,disponible,leer,guardar} from '../src/progreso'
import {initPhysics,Simulation} from '../src/simulation'
import {desafios,proximo} from '../src/ui'
import {limitePiezasTaller,type Armado,type Nivel} from '../src/types'
import {armadoRecorrido,medirRecorrido,recorridoLaberinto,rodeoMixto,trazoLaberinto,type RutaLaberinto} from './laberinto'
import {referencia} from './normalizacion'

beforeAll(initPhysics)
const n=nivelPorId('curva-laberinto')
function simular(a:Armado,nivel:Nivel=n) {
  const sim=new Simulation(nivel,a)
  try {
    while(!sim.result&&sim.tick<36000)sim.step()
    return {resultado:sim.result,activas:[...sim.activas],pasos:sim.tick}
  } finally {sim.dispose()}
}

it('desbloquea una variante independiente después de La curva sin alterar el siguiente ni premiar piezas',()=>{
  const p=leer(()=>({getItem:()=>null,setItem(){}}))
  expect(disponible(n,p)).toBe(false)
  expect(desafios(p,nivelPorId('curva'))).not.toContain('variante-curva-laberinto')
  acreditarVictoria(nivelPorId('recta'),p)
  expect(acreditarVictoria(nivelPorId('curva'),p).desafios).toEqual(['Del libro a la mesa','El laberinto'])
  expect(disponible(n,p)).toBe(true)
  expect(proximo(p)?.id).toBe('libro')
  expect(campana).toHaveLength(16)
  expect(campana).not.toContain(n)
  expect(variantes.map(v=>v.varianteDe)).toEqual(['taza','curva'])
  const selector=desafios(p,n)
  expect(selector).toContain('Variante opcional · 42 dominós')
  expect(selector).toContain('data-level="curva" class="ficha" aria-pressed="true"')
  expect(acreditarVictoria(n,p)).toMatchObject({primera:true,piezas:[],desafios:[],abreTaller:false})
  expect(proximo(p)?.id).toBe('libro')
  expect(desafios(p,n)).toContain('Completada')
  const datos = new Map<string,string>()
  guardar(p,()=>({setItem:(key,value)=>{datos.set(key,value)}}))
  expect(leer(()=>({getItem:key=>datos.get(key)??null,setItem(){}})).completados).toEqual(['recta','curva','curva-laberinto'])
})

it('traza la solución con 39 fichas, conserva tres y permite deshacer el armado completo',()=>{
  expect(Object.entries(n.inventario).filter(([,cantidad])=>cantidad)).toEqual([['domino',42]])
  expect(n.objetos!.length+n.inventario.domino).toBeLessThanOrEqual(limitePiezasTaller)
  const e=new Editor(n),trazo=e.trazar(trazoLaberinto(),'tablero')
  expect(trazo.error).toBeNull()
  expect(e.agregar(trazo.piezas)).toBe(true)
  expect(e.armado).toEqual(referencia('laberinto'))
  expect(e.armado.piezas).toHaveLength(39)
  expect(e.armado.saldo.domino).toBe(3)
  expect(simular(e.armado).resultado).toBe('victoria')
  e.deshacer()
  expect(e.armado).toEqual(vacio(n))
})

it('permite levantar el puntero y unir tres trazos sin exigir una fila única',()=>{
  const e=new Editor(n),puntos=medirRecorrido(recorridoLaberinto('corto'))
  for(const [desde,hasta] of [[.027,.25],[.277,.62],[.647,1.071]]){
    const tramo=e.trazar(puntos.filter(p=>p.longitud>=desde&&p.longitud<=hasta).map(p=>p.p),'tablero')
    expect(tramo.error).toBeNull()
    expect(e.agregar(tramo.piezas)).toBe(true)
  }
  expect(e.historia).toHaveLength(3)
  expect(e.armado.saldo.domino).toBeGreaterThanOrEqual(1)
  expect(e.armado.saldo.domino).toBeLessThanOrEqual(5)
  expect(simular(e.armado).resultado).toBe('victoria')
})

const rodeos=['izquierda','derecha'] as const
it.each(rodeos)('el rodeo %s agota el inventario y funciona con más fichas',ruta=>{
  const e=new Editor(n),r=e.trazar(trazoLaberinto(ruta),'tablero')
  expect(r.error).toBe('Límite de fichas')
  expect(r.piezas).toHaveLength(42)
  expect(e.agregar(r.piezas)).toBe(true)
  expect(simular(e.armado).resultado).toBe('detenida')
  // Positive controls: the budget rejects a traversable route, not an impossible bend.
  const ampliado={...n,inventario:{...n.inventario,domino:80}},control=new Editor(ampliado)
  const completo=control.trazar(trazoLaberinto(ruta),'tablero')
  expect(completo.error).toBeNull()
  expect(control.agregar(completo.piezas)).toBe(true)
  expect(control.armado.piezas).toHaveLength(ruta==='izquierda'?71:68)
  expect(simular(control.armado,ampliado).resultado).toBe('victoria')
  const ahorro=armadoRecorrido(ampliado,ruta,.04)
  expect(ahorro.piezas).toHaveLength(ruta==='izquierda'?48:46)
  new Editor(ampliado).cargar(ahorro)
  expect(simular(ahorro,ampliado).resultado).toBe('victoria')
})

it.each(rodeos.flatMap(ruta=>[1,1.3,1.6,2,2.5,3].map(peso=>({ruta,peso}))))(
  'reservar fichas en las curvas con peso $peso no salva el rodeo $ruta con 42',({ruta,peso})=>{
    const a=rodeoMixto(n,ruta,42,peso)
    expect(a.piezas).toHaveLength(42)
    new Editor(n).cargar(a)
    expect(simular(a).resultado).toBe('detenida')
  })

it.each(rodeos.flatMap(ruta=>(ruta==='izquierda'?[.047,.05,.055]:[.045,.05,.055]).map(gap=>({ruta,gap}))))(
  'el rodeo $ruta tampoco funciona con separación uniforme de $gap metros',({ruta,gap})=>{
    const a=armadoRecorrido(n,ruta,gap)
    expect(a.piezas.length).toBeLessThanOrEqual(n.inventario.domino)
    new Editor(n).cargar(a)
    expect(simular(a).resultado).toBe('detenida')
  })

it('los obstáculos visibles cortan el atajo directo y la pila central supera la altura de una ficha',()=>{
  const e=new Editor(n)
  expect(e.trazar([[-.24,0,.27],[.26,0,-.25]],'tablero').error).toBe('Separá las piezas')
  expect(validarPieza(n,{id:'atajo',tipo:'domino',posicion:[-.04,0,0],giroY:180,apoyo:'tablero'},[])).toBe('Separá las piezas')
  expect(surfaceRect(n,'libro-central-superior/apoyo').y).toBeCloseTo(.06)
  expect(validarPieza(n,{id:'atajo',tipo:'domino',posicion:[-.04,.03,0],giroY:180,apoyo:'libro-rojo-centro/apoyo'},[])).toBe('Separá las piezas')
})

it('las curvas toleran ajustes de posición y giro distribuidos por el recorrido',()=>{
  const a=referencia('laberinto')
  let victorias=0
  for(const indice of [1,11,25,31])for(const eje of ['x','z','giro'])for(const signo of [-1,1]){
    const e=new Editor(n);e.cargar(a)
    const p=structuredClone(a.piezas[indice])
    if(eje==='giro')p.giroY+=signo*2
    else p.posicion[eje==='x'?0:2]+=signo*.002
    expect(e.mover(p),`${p.id} ${eje} ${signo}`).toBe(true)
    if(simular(e.armado).resultado==='victoria')victorias++
  }
  expect(victorias).toBeGreaterThanOrEqual(22)
})

it('registra distancias de control para las tres familias de recorridos',()=>{
  for(const [ruta,largo] of [['corto',1.0984],['izquierda',1.9751],['derecha',1.8886]] as const)
    expect(medirRecorrido(recorridoLaberinto(ruta as RutaLaberinto)).at(-1)!.longitud).toBeCloseTo(largo,4)
})
