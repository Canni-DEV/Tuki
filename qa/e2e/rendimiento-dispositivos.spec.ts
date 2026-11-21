import { test, expect } from './entorno'
import os from 'node:os'

for(const total of [100,200])test('rendimiento real con '+total+' objetos y cuatro dispositivos activos',async({page,browser},info)=>{
  test.skip(process.env.TUKI_PERF!=='1','Medición ligada al equipo de aceptación; ejecutar con TUKI_PERF=1 y sin otras pruebas simultáneas.')
  await page.addInitScript(()=>{if(location.protocol==='http:')window.tukiPrueba.sembrar({completados:['recta','libro','salto','espera','saltos','contrapeso','puerta'],audio:false,movimiento:'reducido'})})
  await page.goto('./?revision')
  await page.evaluate(n=>window.tukiQA.cargar('dispositivos'+n),total)
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await page.waitForFunction(()=>window.tukiQA.estado().fase==='resultado')
  const estado=await page.evaluate(()=>window.tukiQA.estado()) as unknown as {fps:number[];duracion:number;gpu:string;eventos:{tipo:string;a:string}[];armado:{piezas:unknown[]}}
  const informe={fecha:new Date().toISOString(),objetos:total,navegador:info.project.name,version:browser.version(),conVentana:process.env.TUKI_HEADED==='1',sistema:os.version(),cpu:os.cpus()[0].model,memoriaGiB:Math.round(os.totalmem()/2**30),viewport:page.viewportSize(),...estado}
  await info.attach('rendimiento-real',{body:JSON.stringify(informe,null,2),contentType:'application/json'})
  console.log(JSON.stringify({fecha:informe.fecha,objetos:total,navegador:info.project.name,version:browser.version(),conVentana:informe.conVentana,sistema:informe.sistema,memoriaGiB:informe.memoriaGiB,viewport:informe.viewport,gpu:estado.gpu,cpu:informe.cpu,fps:estado.fps,duracion:estado.duracion}))
  expect(estado.gpu).not.toMatch(/swiftshader|llvmpipe|software|basic render/i)
  expect(estado.armado.piezas).toHaveLength(total)
  for(const id of ['lanzador','retenedor','placa','elevador'])expect(estado.eventos.some(e=>e.a===id&&['liberacion','disparo'].includes(e.tipo))).toBe(true)
  expect(estado.fps.length).toBeGreaterThan(0)
  expect(Math.min(...estado.fps)).toBeGreaterThanOrEqual(30)
})
