import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={cycles:[],errors:[]}
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}})
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"completo"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  const original=await page.locator('[data-tool=domino] img').getAttribute('src')
  const before=await page.evaluate(()=>window.tukiQA.estado())
  await page.getByRole('button',{name:'Preferencias',exact:true}).click()
  await page.getByLabel('Perfil',{exact:true}).selectOption('equilibrada')
  // Cancel during setup, then immediately retry. Stale promises must not publish a second canvas.
  await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.getByLabel('Visuales',{exact:true}).selectOption('actual')
  for(let cycle=1;cycle<=20;cycle++) {
    await page.getByLabel('Apariencia').selectOption(cycle%2?'claro':'oscuro')
    await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
    await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy&&s.active&&s.thumbnails>=6},null,{timeout:120000})
    const state=await page.evaluate(()=>window.tukiQA.render.fotorealista())
    if(await page.locator('canvas[data-render=fotorealista]').count()!==1)throw new Error('Canvas duplicado')
    const photo=await page.locator('[data-tool=domino] img').getAttribute('src');if(photo===original)throw new Error('No se renovó la miniatura')
    const after=await page.evaluate(()=>window.tukiQA.estado())
    for(const key of ['armado','seleccion','vista','fase'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw new Error('Cambió '+key)
    report.cycles.push({cycle,...state});console.log(JSON.stringify({cycle,renderer:state.renderer,thumbnails:state.thumbnails}))
    if(cycle===20) {
      await page.evaluate(()=>window.tukiQA.render.perderDispositivo())
      await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().active)
      report.deviceLoss=await page.evaluate(()=>window.tukiQA.render.fotorealista())
      if(!report.deviceLoss.message.includes('Se activó Default'))throw new Error('No se informó la recuperación')
    } else await page.getByLabel('Visuales',{exact:true}).selectOption('actual')
    await page.waitForFunction(()=>!document.querySelector('canvas[data-render=fotorealista]'))
    if(await page.locator('[data-tool=domino] img').getAttribute('src')!==original)throw new Error('No se restauró la miniatura Actual')
  }
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  await page.getByRole('button',{name:'Empujar',exact:true}).click();await page.waitForFunction(()=>window.tukiQA.estado().fase==='resultado',null,{timeout:45000})
  if((await page.evaluate(()=>window.tukiQA.estado())).resultado!=='victoria')throw new Error('La partida no se recuperó')
  if(report.errors.length)throw new Error(report.errors.join('\n'))
}finally{await browser.close();await writeFile('.qa-local/fotorealista/estabilidad.json',JSON.stringify(report,null,2))}
