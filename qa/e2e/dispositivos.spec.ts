import { piezaInventario, cerrarInventario } from './inventario'
import { expect, test, type Page } from './entorno'
import type { Armado, Vec3 } from '../../src/types'

type Diagnostico={velocidad:number;fase:string;resultado:string|null;eventos:{tipo:string;a:string;b:string;paso:number}[];armado:{piezas:{id:string;tipo:string;posicion:number[];configuracion?:unknown}[]};historia:number;error:string|null}
type QA={avanzarHastaResultado():Promise<void>;cargar(n:string):Promise<void>;editar():void;empujar():void;velocidad(n:number):void;estado():Diagnostico;proyectar(p:number[]):{x:number;y:number}}
const estado=(page:Page)=>page.evaluate(()=>(window.tukiQA as unknown as QA).estado())
async function completar(page:Page,velocidad=1) {
  return page.evaluate(async v => {
    const qa = window.tukiQA as unknown as QA
    qa.editar(); qa.empujar(); qa.velocidad(v)
    await qa.avanzarHastaResultado()
    return qa.estado()
  }, velocidad)
}
for(const nombre of ['salto','recepcion','disparo','espera','saltos','contrapeso']) {
  test(nombre+': ocho repeticiones, dos lentas, alternativa y fallo',async({page},info)=>{
    test.setTimeout(300_000)
    const errores:string[]=[];page.on('pageerror',e=>errores.push(e.message))
    await page.addInitScript(()=>{if(location.protocol==='http:')window.tukiPrueba.sembrar({completados:[],audio:false,movimiento:'reducido',apariencia:'claro'})})
    await page.goto('./?revision');await page.evaluate(n=>(window.tukiQA as unknown as QA).cargar(n),nombre)
    await page.screenshot({path:info.outputPath(nombre+'.png')})
    let referencia:unknown
    for(let i=0;i<10;i++) {
      const r=await completar(page,i<8?1:.25)
      expect(r.resultado).toBe('victoria');expect(r.error).toBeNull();expect(r.velocidad).toBe(i<8?1:.25)
      const eventos=r.eventos.map(({tipo,a,b,paso})=>({tipo,a,b,paso}))
      if(!i)referencia=eventos
      else expect(eventos).toEqual(referencia)
      expect(eventos.filter(e=>e.tipo==='empujon')).toHaveLength(1)
    }
    for(const variante of ['alternativo','fallo']) {
      await page.evaluate(n=>(window.tukiQA as unknown as QA).cargar(n),nombre+'-'+variante)
      expect((await completar(page)).resultado).toBe(variante==='fallo'?'detenida':'victoria')
    }
    expect(errores).toEqual([])
  })
}
for(const apariencia of ['claro','oscuro'])test('configuración accesible y una operación de deshacer, tema '+apariencia,async({page},info)=>{
  await page.addInitScript(apariencia=>window.tukiPrueba.sembrar({completados:[],audio:false,movimiento:'reducido',apariencia}),apariencia)
  await page.goto('./?revision');await page.evaluate(()=>(window.tukiQA as unknown as QA).cargar('salto'))
  await page.getByRole('button',{name:'Vista superior'}).click()
  const p=await page.evaluate(()=>(window.tukiQA as unknown as QA).proyectar([-.075,.003,.026]))
  await page.mouse.click(p.x,p.y)
  await page.getByRole('button',{name:'Configurar dispositivo'}).click()
  await expect(page.getByLabel('Activación',{exact:true})).toHaveCount(0)
  await page.getByLabel('Inclinación').selectOption('60')
  await page.getByLabel('Potencia',{exact:true}).selectOption('alta')
  await page.getByLabel('Demora',{exact:true}).selectOption('2')
  await page.getByRole('button',{name:'Guardar',exact:true}).focus();await page.keyboard.press('Enter')
  await expect.poll(async()=>(await estado(page)).historia).toBe(1)
  await expect(page.locator('#aviso')).toHaveText('Dispositivo configurado.')
  expect((await estado(page)).armado.piezas.find(p=>p.tipo==='lanzador')!.configuracion).toMatchObject({inclinacion:60,potencia:'alta',demora:2})
  await page.screenshot({path:info.outputPath('parabola-'+apariencia+'.png')})
  await page.getByRole('button',{name:'Deshacer',exact:true}).click()
  expect((await estado(page)).armado.piezas.find(p=>p.tipo==='lanzador')!.configuracion).toMatchObject({inclinacion:30,potencia:'alta',demora:.5})
})

test('arrastrar un lanzador configurado conserva sus cables al guardar y reabrir',async({page})=>{
  await page.addInitScript(()=>window.tukiPrueba.sembrar({
    completados:['recta','salto','puerta','mate'],audio:false,movimiento:'reducido',
  }))
  await page.goto('./?revision')
  const taller=()=>page.getByRole('button',{name:'Taller libre',exact:true}).click()
  await taller()
  const configuracion={clase:'lanzador',modo:'cable',inclinacion:60,potencia:'alta',demora:2}
  const doc={esquema:'tuki',tipo:'mesa',version:1,ordenFisico:'geometria',nombre:'Circuito con lanzador',formatoMesa:'clasica',perfilFisico:'dispositivos-1',
    piezas:[{id:'a',tipo:'boton',apoyo:'tablero',posicion:[-.20,0,-.07],giroY:0},
      {id:'b',tipo:'boton',apoyo:'tablero',posicion:[-.20,0,.07],giroY:0},
      {id:'l',tipo:'lanzador',apoyo:'tablero',posicion:[.1,0,0],giroY:90,configuracion}],
    conexiones:[{mando:'a',receptor:'l'},{mando:'b',receptor:'l'}],secuencias:[{receptor:'l',mandos:['b','a']}],
  }
  await page.locator('#archivo-mesa').setInputFiles({name:'lanzador.tuki.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
  const cargada=async()=>{ await expect((await piezaInventario(page, 'lanzador'))).toBeEnabled(); await cerrarInventario(page) }
  const armado=()=>page.evaluate(()=>window.tukiQA.estado().armado as unknown as Armado)
  await cargada()
  await page.getByRole('button',{name:'Vista superior',exact:true}).click()
  const puntos:Vec3[]=[[.1,0,0],[.2,0,0]]
  const [inicio,fin]=await page.evaluate(pos=>pos.map(p=>window.tukiQA.proyectar(p)),puntos)
  await page.mouse.move(inicio.x,inicio.y)
  await page.mouse.down()
  await page.mouse.move(fin.x,fin.y,{steps:5})
  await expect.poll(()=>page.evaluate(()=>window.tukiQA.estado().previas[0])).toMatchObject({id:'l',giroY:90,configuracion})
  await page.mouse.up()
  await expect.poll(async()=>(await armado()).piezas.find(p=>p.id==='l')?.posicion[0]).toBeCloseTo(.2,2)
  const guardado=await armado()
  expect(guardado.piezas.find(p=>p.id==='l')).toMatchObject({giroY:90,configuracion})
  expect(guardado.conexiones).toEqual(doc.conexiones)
  expect(guardado.secuencias).toEqual(doc.secuencias)
  await page.reload()
  await taller()
  await page.getByRole('button',{name:'Abrir mesa',exact:true}).click()
  await cargada()
  expect(await armado()).toEqual(guardado)
})
