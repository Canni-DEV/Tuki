import {beforeAll,expect,it} from 'vitest'
import {Editor,validarPieza} from '../src/editor'
import {campana,nivelPorId,vacio,variantes} from '../src/levels'
import {acreditarVictoria,disponible,leer,guardar} from '../src/progreso'
import {initPhysics,Simulation} from '../src/simulation'
import {desafios,proximo} from '../src/ui'
import {limitePiezasTaller,type Armado,type Nivel} from '../src/types'
import {armadoRecorrido,medirRecorrido,recorridoLaberinto,rodeoMixto,trazoLaberinto} from './laberinto'
import {referencia} from './normalizacion'

beforeAll(initPhysics)
const n=nivelPorId('curva-laberinto')
function simular(a:Armado,nivel: Nivel=n) {
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
  expect(selector).toContain('Variante opcional · 100 dominós')
  expect(selector).toContain('data-level="curva" class="ficha" aria-pressed="true"')
  expect(selector).not.toContain('00 ·')
  expect(acreditarVictoria(n,p)).toMatchObject({primera:true,piezas:[],desafios:[],abreTaller:false})
  expect(proximo(p)?.id).toBe('libro')
  expect(desafios(p,n)).toContain('Completada')
  let data=''
  guardar(p,()=>({setItem:(_,value)=>{data=value}}))
  expect(leer(()=>({getItem:()=>data,setItem(){}})).completados).toEqual(['recta','curva','curva-laberinto'])
})

it('traza la solución con 94 fichas, conserva seis y permite deshacer el armado completo',()=>{
  expect(Object.entries(n.inventario).filter(([,cantidad])=>cantidad)).toEqual([['domino',100]])
  expect(n.objetos!.length+n.inventario.domino).toBeLessThanOrEqual(limitePiezasTaller)
  const e=new Editor(n),trazo=e.trazar(trazoLaberinto(),'tablero')
  expect(trazo.error).toBeNull()
  expect(e.agregar(trazo.piezas)).toBe(true)
  expect(e.armado).toEqual(referencia('laberinto'))
  expect(e.armado.piezas).toHaveLength(94)
  expect(e.armado.saldo.domino).toBe(6)
  expect(simular(e.armado).resultado).toBe('victoria')
  e.deshacer()
  expect(e.armado).toEqual(vacio(n))
})

it('permite levantar el puntero y unir cuatro trazos sin exigir una fila única',()=>{
  const e=new Editor(n),puntos=medirRecorrido(recorridoLaberinto('corto'))
  for(const [desde,hasta] of [[.027,.52],[.55,1.24],[1.27,1.86],[1.89,2.544]]){
    const tramo=e.trazar(puntos.filter(p=>p.longitud>=desde&&p.longitud<=hasta).map(p=>p.p),'tablero')
    expect(tramo.error).toBeNull()
    expect(e.agregar(tramo.piezas)).toBe(true)
  }
  expect(e.armado.piezas).toHaveLength(92)
  expect(e.historia).toHaveLength(4)
  expect(simular(e.armado).resultado).toBe('victoria')
})

it('el rodeo agota las 100 fichas antes de llegar y admite una cadena real con un inventario ampliado',()=>{
  expect(medirRecorrido(recorridoLaberinto('corto')).at(-1)!.longitud).toBeCloseTo(2.5705,4)
  expect(medirRecorrido(recorridoLaberinto('rodeo')).at(-1)!.longitud).toBeCloseTo(5.8187,4)
  const e=new Editor(n),r=e.trazar(trazoLaberinto('rodeo'),'tablero')
  expect(r.error).toBe('Límite de fichas')
  expect(r.piezas).toHaveLength(100)
  expect(e.agregar(r.piezas)).toBe(true)
  expect(e.armado.saldo.domino).toBe(0)
  expect(simular(e.armado).resultado).toBe('detenida')
  // A positive control proves that the detour is traversable: the budget, not a broken bend, rejects it.
  const ampliado={...n,inventario:{...n.inventario,domino:150}},a=armadoRecorrido(ampliado,'rodeo',.04)
  expect(a.piezas).toHaveLength(145)
  new Editor(ampliado).cargar(a)
  expect(simular(a,ampliado).resultado).toBe('victoria')
  const ahorro=rodeoMixto(ampliado,.055,.04)
  expect(ahorro.piezas).toHaveLength(113)
  new Editor(ampliado).cargar(ahorro)
  expect(simular(ahorro,ampliado).resultado).toBe('victoria')
})

it.each([.058,.059,.060,.062])('el rodeo tampoco funciona repartiendo las fichas a %s metros',separacion=>{
  const a=armadoRecorrido(n,'rodeo',separacion)
  expect(a.piezas.length).toBeLessThanOrEqual(100)
  new Editor(n).cargar(a)
  const r=simular(a)
  expect(r.resultado).toBe('detenida')
  expect(r.activas).not.toContain('meta')
})

it.each([.027,.035,.040,.045])('reservar más fichas para curvas de %s metros no salva el rodeo con cien',curva=>{
  const a=rodeoMixto(n,.055,curva,100)
  expect(a.piezas).toHaveLength(100)
  new Editor(n).cargar(a)
  expect(simular(a).resultado).toBe('detenida')
})

it('las barreras cortan trazos rápidos y no ofrecen un apoyo que permita cruzarlas por arriba',()=>{
  const e=new Editor(n)
  const trazo=e.trazar([[.1,0,-.38],[.1,0,.38]],'tablero')
  expect(trazo.error).toBe('Separá las piezas')
  expect(trazo.piezas.every(p=>p.posicion[2]<-.3625)).toBe(true)
  expect(n.superficies.some(s=>s.objeto.startsWith('pared-'))).toBe(false)
  expect(validarPieza(n,{id:'atajo',tipo:'domino',posicion:[-.215,.03,-.3325],giroY:0,apoyo:'pared-0-0/apoyo'},[])).toBe('Elegí un apoyo compatible')
  // The lateral bypass closes at the last three lanes: it cannot continue straight to the flag.
  expect(e.trazar([[-.4,0,.17],[-.4,0,.38]],'tablero').error).toBe('Separá las piezas')
})

it('las cuatro curvas toleran ajustes de posición y giro distribuidos por todo el recorrido',()=>{
  const a=referencia('laberinto')
  let victorias=0
  for(const indice of [1,21,48,71])for(const eje of ['x','z','giro'])for(const signo of [-1,1]){
    const e=new Editor(n);e.cargar(a)
    const p=structuredClone(a.piezas[indice])
    if(eje==='giro')p.giroY+=signo*2
    else p.posicion[eje==='x'?0:2]+=signo*.002
    expect(e.mover(p),`${p.id} ${eje} ${signo}`).toBe(true)
    if(simular(e.armado).resultado==='victoria')victorias++
  }
  expect(victorias).toBeGreaterThanOrEqual(22)
})
