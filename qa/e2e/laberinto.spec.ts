import {test,expect,type Page} from '@playwright/test'
import {trazoLaberinto} from '../laberinto'

async function abrir(page:Page) {
  await page.addInitScript(()=>{if(location.protocol==='http:'&&!localStorage.getItem('tuki.progreso.v2'))localStorage.setItem('tuki.progreso.v2',JSON.stringify({
    version:1,completados:['recta','curva'],audio:false,movimiento:'reducido',apariencia:'claro',
  }))})
  await page.goto('./?revision')
  await page.getByRole('button',{name:'Desafíos',exact:true}).click()
  await page.locator('[data-level=curva]').click()
  await page.getByRole('button',{name:'El laberinto',exact:true}).click()
  await expect(page.locator('.ficha[aria-pressed=true]')).toHaveAttribute('data-level','curva')
  await expect(page.locator('.variante-detalle')).toHaveText('Variante opcional · 100 dominós')
  await page.getByRole('button',{name:'Jugar El laberinto',exact:true}).click()
  await expect(page.getByRole('button',{name:'Empujar',exact:true})).toBeEnabled()
  await expect(page.getByRole('heading',{name:'El laberinto',exact:true})).toBeVisible()
}

test('el acceso opcional conserva el siguiente, registra la victoria y copia el escenario sin solución',async({page})=>{
  await abrir(page)
  expect((await page.evaluate(()=>window.tukiQA.estado())).armado.saldo.domino).toBe(100)
  await page.evaluate(()=>window.tukiQA.cargar('laberinto'))
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Completaste El laberinto',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Siguiente',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Copiar al taller',exact:true}).click()
  await expect(page.getByRole('button',{name:'Empujar',exact:true})).toBeEnabled()
  const copia=await page.evaluate(()=>window.tukiQA.estado().armado)
  expect(copia.nivel).toBe('taller')
  expect(copia.piezas).toHaveLength(46)
  expect(copia.piezas.filter(p=>p.tipo==='domino')).toHaveLength(0)
  await page.reload()
  await expect(page.getByRole('button',{name:'Jugar Del libro a la mesa',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Desafíos',exact:true}).click()
  await page.locator('[data-level=curva]').click()
  await page.getByRole('button',{name:'El laberinto',exact:true}).click()
  await expect(page.locator('.variante-detalle')).toContainText('Completada')
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tuki.progreso.v2')!).completados)).toEqual(['recta','curva','curva-laberinto'])
})

test('un trazo real completa las curvas y deshacer devuelve todas las fichas',async({page},info)=>{
  test.setTimeout(180_000)
  await abrir(page)
  await page.getByRole('button',{name:'Vista superior',exact:true}).click()
  await page.getByRole('button',{name:'Trazar fila',exact:true}).click()
  // Keep the curve samples dense enough for the actual mouse gesture and its smoothing filter.
  const puntos=trazoLaberinto().filter((_,i,array)=>i%3===0||i===array.length-1)
  const coords=await page.evaluate(ps=>ps.map(p=>window.tukiQA.proyectar(p)),puntos)
  await page.mouse.move(coords[0].x,coords[0].y)
  await page.mouse.down()
  for(const p of coords.slice(1))await page.mouse.move(p.x,p.y)
  await page.mouse.up()
  await expect.poll(()=>page.evaluate(()=>window.tukiQA.estado().validando)).toBe(false)
  const armado=await page.evaluate(()=>window.tukiQA.estado().armado)
  expect(armado.piezas.length).toBeGreaterThanOrEqual(94)
  expect(armado.piezas.length).toBeLessThanOrEqual(97)
  await page.screenshot({path:info.outputPath('trazado.png')})
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Completaste El laberinto',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Volver a editar',exact:true}).click()
  await page.getByRole('button',{name:'Deshacer',exact:true}).click()
  expect((await page.evaluate(()=>window.tukiQA.estado())).armado.saldo.domino).toBe(100)
})

test('la planta y las curvas se ven en escritorio y móvil, en ambos temas',async({page},info)=>{
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await abrir(page)
  for(const [width,height] of [[1366,768],[390,844]])for(const tema of ['claro','oscuro']){
    await page.setViewportSize({width,height})
    await page.getByRole('button',{name:'Preferencias',exact:true}).click()
    await page.getByLabel('Apariencia').selectOption(tema)
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
    await expect(page.getByRole('button',{name:'Trazar fila',exact:true})).toBeInViewport({ratio:1})
    await expect(page.getByRole('button',{name:'Empujar',exact:true})).toBeInViewport({ratio:1})
    await page.screenshot({path:info.outputPath(`mesa-${width}-${tema}.png`)})
    await page.evaluate(()=>window.tukiQA.cargar('laberinto'))
    await page.getByRole('button',{name:'Vista superior',exact:true}).click()
    await page.screenshot({path:info.outputPath(`solucion-${width}-${tema}.png`)})
  }
  expect(errors).toEqual([])
})

test('rendimiento real de la cadena del laberinto',async({page,browser},info)=>{
  test.skip(process.env.TUKI_PERF!=='1','Medición con GPU, sin reloj simulado y sin otras suites simultáneas.')
  await abrir(page)
  await page.evaluate(()=>window.tukiQA.cargar('laberinto'))
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Completaste El laberinto',exact:true})).toBeVisible()
  const estado=await page.evaluate(()=>window.tukiQA.estado()) as unknown as {fps:number[];duracion:number;gpu:string}
  const medicion={navegador:info.project.name,version:browser.version(),conVentana:process.env.TUKI_HEADED==='1',
    viewport:page.viewportSize(),fps:estado.fps,duracion:estado.duracion,gpu:estado.gpu}
  await info.attach('rendimiento-laberinto',{body:JSON.stringify(medicion,null,2),contentType:'application/json'})
  console.log(JSON.stringify(medicion))
  expect(estado.fps.length).toBeGreaterThan(0)
  expect(Math.min(...estado.fps)).toBeGreaterThanOrEqual(30)
})
