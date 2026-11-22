// Visual motion coverage is separate from timing benchmarks (video/screenshot overhead).
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
const folder='.qa-local/fotorealista/orbita-jugada';await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={runs:[],errors:[]}
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:folder,size:{width:1600,height:1000}}})
  const page=await context.newPage()
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"completo"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy},null,{timeout:120000})
  const active=await page.evaluate(()=>window.tukiQA.render.fotorealista());assert(active.active,active.message)
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  for(const quality of ['alta','equilibrada'])for(const theme of ['claro','oscuro']) {
    await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
    await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Apariencia').selectOption(theme)
    await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption(quality)
    await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy},null,{timeout:120000})
    assert(await page.evaluate(()=>window.tukiQA.render.fotorealista().active))
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
    const ball=await page.evaluate(()=>window.tukiQA.proyectar(window.tukiQA.estado().armado.piezas.find(p=>p.tipo==='bolita').posicion))
    await page.mouse.move(ball.x,ball.y);await page.mouse.wheel(0,-280);await page.waitForTimeout(100)
    await page.screenshot({path:`${folder}/${quality}-${theme}-vidrio.png`})
    await page.getByRole('button',{name:'Empujar',exact:true}).click()
    const initialView=await page.evaluate(()=>window.tukiQA.estado().vista)
    // One complete orbit during real play, at changing elevations, through the existing input handler.
    for(let i=0;i<12;i++) {
      await page.mouse.move(800,450);await page.mouse.down({button:'right'})
      await page.mouse.move(800-Math.PI/18/.006*3,450+(i%4<2?-15:15),{steps:12});await page.mouse.up({button:'right'})
      await page.waitForTimeout(75)
      if(i%3===0)await page.screenshot({path:`${folder}/${quality}-${theme}-movimiento-${i}.png`})
    }
    await page.waitForFunction(()=>window.tukiQA.estado().fase==='resultado',null,{timeout:45000})
    const state=await page.evaluate(()=>window.tukiQA.estado());assert.equal(state.resultado,'victoria')
    assert(Math.abs(state.vista.azimut-initialView.azimut-Math.PI*2)<.01,'La cámara debe completar el giro real')
    report.runs.push({quality,theme,result:state.resultado,view:state.vista,renderer:await page.evaluate(()=>window.tukiQA.render.fotorealista())})
    await page.screenshot({path:`${folder}/${quality}-${theme}-resultado.png`})
  }
  assert.deepEqual(report.errors,[]);await context.close()
  console.log('Cuatro jugadas ganadoras con giro de 360°, ambos temas y perfiles: OK')
}finally{await writeFile(`${folder}/informe.json`,JSON.stringify(report,null,2));await browser.close()}
