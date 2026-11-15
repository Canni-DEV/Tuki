import { expect, type Page } from '@playwright/test'
import { test } from './reloj-partida'

type Diagnostico={fase:string;resultado:string|null;eventos:{tipo:string;a:string;b:string;paso:number}[];armado:{piezas:{id:string;tipo:string;posicion:number[];configuracion?:unknown}[]};historia:number;error:string|null}
type QA={cargar(n:string):Promise<void>;editar():void;empujar():void;velocidad(n:number):void;estado():Diagnostico;proyectar(p:number[]):{x:number;y:number}}
const estado=(page:Page)=>page.evaluate(()=>(window.tukiQA as unknown as QA).estado())
async function completar(page:Page,velocidad=1) {
  await page.evaluate(v=>{const qa=window.tukiQA as unknown as QA;qa.editar();qa.velocidad(v);qa.empujar()},velocidad)
  for(let i=0;i<120;i++) {
    // Advance presentation time in chunks; the game drains every 1/120 s step.
    // This matrix checks deterministic browser integration, not rendering FPS.
    await page.clock.fastForward(500)
    if((await estado(page)).fase==='resultado')return estado(page)
  }
  throw new Error('El intento no terminó en 60 segundos de reloj de presentación')
}
for(const nombre of ['salto','recepcion','disparo','espera','saltos','contrapeso']) {
  test(nombre+': ocho repeticiones, dos lentas, alternativa y fallo',async({page,pausarPartida},info)=>{
    test.setTimeout(300_000)
    const errores:string[]=[];page.on('pageerror',e=>errores.push(e.message))
    await page.addInitScript(()=>{if(location.protocol==='http:')localStorage.setItem('tuki.progreso.v2',JSON.stringify({version:1,completados:[],audio:false,movimiento:'reducido',apariencia:'claro'}))})
    await page.goto('./?revision');await page.evaluate(n=>(window.tukiQA as unknown as QA).cargar(n),nombre)
    await pausarPartida()
    await page.screenshot({path:info.outputPath(nombre+'.png')})
    let referencia:unknown
    for(let i=0;i<10;i++) {
      const r=await completar(page,i<8?1:.25)
      expect(r.resultado).toBe('victoria');expect(r.error).toBeNull()
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
  await page.addInitScript(apariencia=>localStorage.setItem('tuki.progreso.v2',JSON.stringify({version:1,completados:[],audio:false,movimiento:'reducido',apariencia})),apariencia)
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
