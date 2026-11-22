import { test, expect } from './entorno'

test('una pestaña oculta aplaza la comprobación sin borrar la preferencia de otra pestaña',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('tuki.v1.preferencias.visuales','"fotorealista"')
    localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')
    Object.defineProperty(document,'hidden',{value:true,configurable:true})
    Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true})
  })
  await page.goto('./?revision')
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tuki.v1.preferencias.visuales')!))).toBe('fotorealista')
  await page.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'))})
  await expect(page.locator('#progreso-visuales')).toBeHidden()
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tuki.v1.preferencias.visuales')!))).toBe('fotorealista')
  await expect(page.locator('.stage')).not.toHaveAttribute('data-preparando-calidad')
})

test('Default no descarga CALIDAD y WebGPU ausente conserva la partida',async({page})=>{
  const resources:string[]=[]
  page.on('request',r=>{if(r.url().includes('/fotorealista/'))resources.push(r.url())})
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}))
  await page.goto('./?revision')
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  const before=await page.evaluate(()=>window.tukiQA.estado())
  await page.getByRole('button',{name:'Preferencias',exact:true}).click()
  await expect(page.getByLabel('Visuales',{exact:true})).toHaveValue('actual')
  await expect(page.getByRole('option',{name:'Default',exact:true})).toHaveCount(1)
  await expect(page.getByRole('option',{name:'Calidad',exact:true})).toHaveCount(1)
  await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await expect(page.locator('#pref-visuales-estado')).toContainText('no tiene WebGPU')
  await expect(page.getByLabel('Visuales',{exact:true})).toHaveValue('actual')
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  const after=await page.evaluate(()=>window.tukiQA.estado())
  for(const key of ['armado','seleccion','vista','fase'] as const)expect(after[key]).toEqual(before[key])
  expect(resources).toEqual([])
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await page.evaluate(()=>(window.tukiQA as unknown as {avanzarHastaResultado():Promise<void>}).avanzarHastaResultado())
  expect((await page.evaluate(()=>window.tukiQA.estado())).resultado).toBe('victoria')
})

test('CALIDAD guardada usa Default sin adaptador y conserva la preferencia para reintentar',async({page})=>{
  const resources:string[]=[]
  page.on('request',r=>{if(r.url().includes('/fotorealista/'))resources.push(r.url())})
  await page.addInitScript(()=>{
    localStorage.setItem('tuki.v1.preferencias.visuales','"fotorealista"')
    Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>null},configurable:true})
  })
  await page.goto('./?revision')
  await expect(page.locator('#aviso')).toContainText('no reúne los requisitos')
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tuki.v1.preferencias.visuales')!))).toBe('fotorealista')
  await expect(page.locator('.stage')).not.toHaveAttribute('data-preparando-calidad')
  expect(resources).toEqual([])
  await expect(page.locator('canvas[data-render=fotorealista]')).toHaveCount(0)
})
