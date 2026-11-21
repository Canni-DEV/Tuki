import { beforeAll, expect, it } from 'vitest'
import { initPhysics, Simulation, type SimEvent } from '../src/simulation'
import { armadoDeMesa, mesaNueva, nivelTaller, leerMesa } from '../src/taller'
import { predeterminadas, velocidades, type ConfiguracionLanzador } from '../src/dispositivos'
import { Editor } from '../src/editor'
import type { PiezaColocada, Vec3 } from '../src/types'
import { trayectoriaLanzador } from '../src/trayectoria'
import { leer, guardar, prefijo } from '../src/progreso'

beforeAll(initPhysics)
const pieza=(id:string,tipo:PiezaColocada['tipo'],posicion:Vec3,apoyo='tablero'):PiezaColocada=>({id,tipo,posicion,giroY:0,apoyo})
function banco(piezas:PiezaColocada[]) {
  const nivel=nivelTaller('Banco de dispositivos'), doc=mesaNueva(nivel.nombre)
  doc.piezas=[pieza('inicio','inicio',[-.35,0,-.20]),pieza('meta','meta',[.35,0,.20]),...piezas]
  return new Simulation(nivel,armadoDeMesa(nivel,doc))
}
function correr(s:Simulation,limite=1800) {const e:SimEvent[]=[];while(!s.result&&s.tick<limite)e.push(...s.step());return e}

it.each([30,45,60].flatMap(inclinacion=>['baja','media','alta'].map(potencia=>({inclinacion,potencia}))))(
  'captura y dispara una sola bola con ángulo $inclinacion y potencia $potencia',({inclinacion,potencia})=>{
    const config={...predeterminadas.lanzador,inclinacion,potencia} as ConfiguracionLanzador
    const sim=banco([{...pieza('l','lanzador',[0,0,0]),configuracion:config},pieza('bola','bolita',[0,.085,0])])
    sim.activas.add('bola')
    const eventos:SimEvent[]=[]
    try {
      let speed=0
      while(!sim.result&&sim.tick<1800) {
        const e=sim.step();eventos.push(...e)
        if(e.some(e=>e.tipo==='disparo')) {const v=sim.actors.get('bola')!.body.linvel();speed=Math.hypot(v.x,v.y,v.z)}
      }
      expect(eventos.filter(e=>e.tipo==='captura')).toHaveLength(1)
      expect(eventos.filter(e=>e.tipo==='disparo')).toHaveLength(1)
      expect(eventos.find(e=>e.tipo==='disparo')!.paso-eventos.find(e=>e.tipo==='captura')!.paso).toBe(60)
      expect(speed).toBeCloseTo(velocidades[config.potencia],4)
      expect(sim.actors.has('bola')).toBe(true)
      expect(sim.result).not.toBeNull()
    } finally {sim.dispose()}
  })

it('una bola ajena a la cadena puede llegar sin iniciar un disparo',()=>{
  const sim=banco([pieza('l','lanzador',[0,0,0]),pieza('bola','bolita',[0,.085,0])])
  try {expect(correr(sim).some(e=>e.tipo==='disparo')).toBe(false);expect(sim.result).toBe('detenida')}finally{sim.dispose()}
})

it('descarta una señal anticipada y admite otra posterior a la carga',()=>{
  const sim=banco([{...pieza('l','lanzador',[0,0,0]),configuracion:{...predeterminadas.lanzador,modo:'cable'}},pieza('bola','bolita',[0,.085,0])])
  const eventos:SimEvent[]=[]
  try {
    sim.dispositivos.senal('l/base',eventos)
    expect(eventos[0].tipo).toBe('senal-ignorada')
    while(sim.tick<60)eventos.push(...sim.step())
    expect(sim.dispositivos.estados.get('l')!.fase).toBe('cargado')
    sim.dispositivos.senal('l/base',eventos)
    eventos.push(...correr(sim))
    expect(eventos.filter(e=>e.tipo==='disparo')).toHaveLength(1)
    expect(sim.activas.has('bola')).toBe(true)
  }finally{sim.dispose()}
})

it('guarda configuración y carga, las mueve juntas y deshace un ajuste',()=>{
  const nivel=nivelTaller('Configuración'),doc=mesaNueva(nivel.nombre)
  doc.piezas=[{...pieza('l','lanzador',[0,0,0]),configuracion:{...predeterminadas.lanzador,modo:'cable'}},pieza('bola','bolita',[0,.018,0],'l/apoyo')]
  const mesa=leerMesa(doc),editor=new Editor(nivel)
  editor.cargar(armadoDeMesa(nivel,mesa))
  expect(editor.mover({id:'l',apoyo:'tablero',posicion:[.1,0,0],giroY:90})).toBe(true)
  expect(editor.armado.piezas[1].posicion[0]).toBeCloseTo(.1)
  expect(editor.armado.piezas[0].configuracion).toEqual(doc.piezas[0].configuracion)
  const antes=structuredClone(editor.armado)
  expect(editor.configurarDispositivo('l',{...predeterminadas.lanzador,modo:'cable',inclinacion:60})).toBe(true)
  editor.deshacer();expect(editor.armado).toEqual(antes)
  expect(()=>leerMesa({...doc,piezas:[{...doc.piezas[0],configuracion:{...predeterminadas.lanzador,inclinacion:91}}]})).toThrow()
})

it('arrastra un lanzador sin perder su configuración, cables ni orden al volver a cargar la mesa',async()=>{
  const doc=mesaNueva('Circuito con lanzador'),nivel=nivelTaller(doc.nombre,doc),editor=new Editor(nivel)
  const configuracion={...predeterminadas.lanzador,modo:'cable',inclinacion:60,potencia:'alta',demora:2} as const
  doc.piezas=[pieza('a','boton',[-.20,0,-.07]),pieza('b','boton',[-.20,0,.07]),
    {...pieza('l','lanzador',[.1,0,0]),giroY:90,configuracion}]
  doc.conexiones=[{mando:'a',receptor:'l'},{mando:'b',receptor:'l'}]
  doc.secuencias=[{receptor:'l',mandos:['b','a']}]
  editor.cargar(armadoDeMesa(nivel,leerMesa(doc)))
  const antes=structuredClone(editor.armado)
  const destino={id:'l',apoyo:'tablero',posicion:[.2,0,0] as Vec3,giroY:90}
  expect(editor.movimiento(destino)).toEqual({piezas:[{...antes.piezas[2],...destino}],error:null})
  expect(await editor.editarValidado(e=>e.mover(destino),async()=>null,()=>true)).toBe(true)
  const {piezas,conexiones,secuencias}=editor.armado
  expect(conexiones).toEqual(doc.conexiones)
  expect(secuencias).toEqual(doc.secuencias)
  const reabierta=leerMesa(JSON.parse(JSON.stringify({...doc,piezas,conexiones,secuencias})))
  const trasRecarga=new Editor(nivel)
  trasRecarga.cargar(armadoDeMesa(nivel,reabierta))
  expect(trasRecarga.armado).toEqual(editor.armado)
  expect(trasRecarga.armado.piezas[2]).toMatchObject({...destino,configuracion})
  editor.deshacer()
  expect(editor.armado).toEqual(antes)
})

it('al arrastrar, la colisión usa la inclinación configurada y el giro de la pieza',()=>{
  const nivel=nivelTaller('Placa bajo un obstáculo')
  nivel.fijos.push({id:'obstaculo',activo:'spacer',rol:'escenario',apoyo:null,
    posicion:[.185,.021,0],giroY:0,escala:[.1,.2,.1]})
  const editor=new Editor(nivel)
  const configuracion={...predeterminadas.placa,inclinacion:30} as const
  expect(editor.agregar([{...pieza('@','placa',[0,0,0]),configuracion}])).toBe(true)
  const id=editor.armado.piezas[0].id
  const destino={id,apoyo:'tablero',posicion:[.2,0,0] as Vec3,giroY:90}
  expect(editor.movimiento({...destino,giroY:0}).error).toBeNull()
  expect(editor.movimiento(destino).error).toBe('Separá las piezas')
  expect(editor.mover(destino)).toBe(false)
  expect(editor.armado.piezas[0]).toMatchObject({posicion:[0,0,0],configuracion})
})

it('el retenedor libera por gravedad después de la demora',()=>{
  const sim=banco([pieza('r','retenedor',[0,0,0]),pieza('bola','bolita',[0,.045,-.014])])
  sim.activas.add('bola')
  try {
    const eventos=correr(sim)
    expect(eventos.some(e=>e.tipo==='captura')).toBe(true)
    expect(eventos.some(e=>e.tipo==='liberacion')).toBe(true)
    expect(sim.actors.get('bola')!.body.translation().z).toBeGreaterThan(.035)
  }finally{sim.dispose()}
})

it.each(['bolita','domino'] as const)('la placa responde al impacto físico de %s',tipo=>{
  const sim=banco([pieza('p','placa',[0,0,0]),pieza('carga',tipo,[0,.06,0])]);sim.activas.add('carga')
  try {
    const eventos=correr(sim)
    expect(eventos.filter(e=>e.tipo==='disparo')).toHaveLength(1)
    expect(sim.dispositivos.estados.get('p')!.fase).toBe('descargado')
  }finally{sim.dispose()}
})

it.each([6,12,24] as const)('el elevador usa el lastre físico de %i gramos',lastre=>{
  const sim=banco([{...pieza('e','elevador',[0,0,0]),configuracion:{...predeterminadas.elevador,modo:'cable',lastre}},pieza('bola','bolita',[-.022,.027,0])])
  try {
    for(let i=0;i<60;i++)sim.step()
    sim.dispositivos.senal('e/platform',[])
    correr(sim,1800)
    const altura=sim.actors.get('e/platform')!.body.translation().y
    if(lastre===6)expect(altura).toBeLessThan(.020)
    else expect(altura).toBeGreaterThan(.125)
  }finally{sim.dispose()}
})

it.each(['baja','media','alta'] as const)('calibra la altura de la placa %s',potencia=>{
  const sim=banco([{...pieza('p','placa',[0,0,0]),configuracion:{...predeterminadas.placa,potencia}},pieza('bola','bolita',[0,.0245,0])]);sim.activas.add('bola')
  let max=0
  try{while(!sim.result&&sim.tick<1000){sim.step();max=Math.max(max,sim.actors.get('bola')!.body.translation().y)}expect(max-.0245).toBeCloseTo(({baja:.04,media:.08,alta:.12})[potencia],2)}finally{sim.dispose()}
})

it('una articulación alejada no altera el frenado de una bola',()=>{
  const pista=[pieza('bola','bolita',[0,.008,0])]
  const a=banco(pista),b=banco([...pista,pieza('pendulo','pendulo',[.25,0,-.15])])
  try{
    for(const s of [a,b]){s.activas.add('bola');s.actors.get('bola')!.body.setLinvel({x:.04,y:0,z:0},true)}
    for(let i=0;i<120;i++){a.step();b.step();expect(a.actors.get('bola')!.body.translation()).toEqual(b.actors.get('bola')!.body.translation())}
  }finally{a.dispose();b.dispose()}
})
it.each([.5,1,2] as const)('completa la demora %s aunque supere la ventana de reposo e ignora duplicados',demora=>{
  const s=banco([{...pieza('l','lanzador',[0,0,0]),configuracion:{...predeterminadas.lanzador,modo:'cable',demora}},pieza('bola','bolita',[0,.018,0],'l/apoyo')])
  const eventos:SimEvent[]=[]
  try{
    s.dispositivos.senal('l/base',eventos)
    for(let i=0;i<demora*120;i++){s.dispositivos.senal('l/base',eventos);eventos.push(...s.step())}
    expect(eventos.filter(e=>e.tipo==='disparo').map(e=>e.paso)).toEqual([demora*120])
    expect(s.result).toBeNull()
  }finally{s.dispose()}
})
it('una boca obstruida bloquea el disparo y conserva el cuerpo y las colisiones',()=>{
  const s=banco([{...pieza('l','lanzador',[0,0,0]),configuracion:{...predeterminadas.lanzador,modo:'cable'}},pieza('bola','bolita',[0,.018,0],'l/apoyo'),pieza('muro','cajaCubicaGrande',[0,0,.082])])
  try{
    const body=s.actors.get('bola')!.body;s.dispositivos.senal('l/base',[])
    const eventos=correr(s)
    expect(s.actors.get('bola')!.body).toBe(body)
    expect(eventos.some(e=>e.tipo==='bloqueo')).toBe(true)
    expect(s.dispositivos.estados.get('l')!.fase).toBe('bloqueado')
  }finally{s.dispose()}
})
it('la parábola termina antes del obstáculo considerando el radio',()=>{
  const n=nivelTaller('Parábola'),l={...pieza('l','lanzador',[0,0,0]),giroY:90},muro=pieza('muro','cajaCubicaGrande',[.12,0,0])
  const libre=trayectoriaLanzador(n,l,[l]),cortada=trayectoriaLanzador(n,l,[l,muro])
  expect(cortada.length).toBeLessThan(libre.length)
  expect(cortada.at(-1)![0]).toBeLessThan(.12-.04)
  expect(libre.at(-1)![1]).toBeCloseTo(.008,3)
})
it('el retenedor cableado libera en el paso de la señal, sin aplicar su demora automática',()=>{
  const s=banco([{...pieza('r','retenedor',[0,0,0]),configuracion:{...predeterminadas.retenedor,modo:'cable',demora:2}},pieza('bola','bolita',[0,.019,-.009],'r/apoyo')])
  try{
    for(let i=0;i<20;i++)s.step()
    const eventos:SimEvent[]=[];s.dispositivos.senal('r/stop',eventos);s.dispositivos.avanzar(eventos)
    expect(eventos.find(e=>e.tipo==='liberacion')!.paso).toBe(20)
    expect(s.activas.has('bola')).toBe(true)
  }finally{s.dispose()}
})
it('una segunda bola sigue colisionando y no roba el alojamiento ni la causalidad',()=>{
  const s=banco([{...pieza('l','lanzador',[0,0,0]),configuracion:{...predeterminadas.lanzador,modo:'cable'}},pieza('bola','bolita',[0,.018,0],'l/apoyo'),pieza('segunda','bolita',[0,.07,0])])
  s.activas.add('bola')
  try{
    correr(s)
    expect(s.dispositivos.estados.get('l')!.bola).toBe('bola')
    expect(s.actors.get('segunda')!.body.translation().y).toBeGreaterThan(.03)
    expect(s.activas.has('segunda')).toBe(false)
  }finally{s.dispose()}
})
it('el perfil nuevo inicia limpio y conserva luego su progreso sin tocar el anterior',()=>{
  const anterior=JSON.stringify({version:1,completados:['mate'],audio:false,movimiento:'reducido',apariencia:'oscuro'})
  const datos=new Map([['tuki.progreso.v1',anterior]])
  const storage=()=>({getItem:(k:string)=>datos.get(k)??null,setItem:(k:string,v:string)=>{datos.set(k,v)}})
  const p=leer(storage);expect(p.completados).toEqual([]);expect(p.audio).toBe(true);expect(p.apariencia).toBe('claro')
  p.completados.push('recta');p.audio=false;guardar(p,storage)
  expect(leer(storage)).toEqual(p);expect(datos.get('tuki.progreso.v1')).toBe(anterior);expect(datos.has(prefijo + 'campana.recta')).toBe(true)
  for(const version of [2,3,4,5,6])expect(()=>leerMesa({...mesaNueva('Vieja'),version})).toThrow(/incompatible/)
})
