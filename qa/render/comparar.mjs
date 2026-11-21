import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

const effect = process.env.TUKI_RENDER_EFFECT ?? 'base'
const folder = '.qa-local/fotorealista', duration = Number(process.env.TUKI_RENDER_SECONDS ?? 10)
await mkdir(folder, { recursive:true })
const browser = await chromium.launch({ executablePath: process.env.TUKI_CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true, ignoreDefaultArgs:['--enable-unsafe-swiftshader'] })
const reports = []
try {
  const context = await browser.newContext({ viewport:{width:2560,height:1440} })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type()==='error') { const line=m.text(); errors.push(line); console.log(line.slice(0,500)) } })
  await page.addInitScript(() => { localStorage.setItem('tuki.v1.preferencias.audio','false'); localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"') })
  await page.goto(process.env.TUKI_BASE_URL ?? 'http://127.0.0.1:4176/?revision')
  await page.waitForFunction(()=>!!window.tukiQA)
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  for (const backend of (process.env.TUKI_RENDER_BACKEND ? [process.env.TUKI_RENDER_BACKEND] : ['actual','webgl2','webgpu'])) {
    const start = performance.now()
    try {
      const state = await page.evaluate(({b,e})=>window.tukiQA.render.seleccionar(b,'alta',e), {b:backend,e:effect})
      const activationMs = performance.now()-start
      for (const theme of ['claro','oscuro']) {
        await page.getByRole('button',{name:'Preferencias',exact:true}).click()
        await page.getByLabel('Apariencia').selectOption(theme)
        await page.getByRole('button',{name:'Cerrar',exact:true}).click()
        await page.evaluate(()=>window.tukiQA.render.continuo(true))
        await page.waitForTimeout(2000)
        await page.screenshot({path:`${folder}/${backend}-${effect}-${theme}.png`})
        await page.evaluate(()=>window.tukiQA.render.medir(true))
        await page.waitForTimeout(duration*1000)
        const metrics = await page.evaluate(()=>window.tukiQA.render.medir(false))
        reports.push({backend,theme,state,activationMs,metrics,errors:[...errors]}); console.log(JSON.stringify(reports.at(-1)))
      }
    } catch(error) { reports.push({backend,error:String(error),errors:[...errors]}); console.log(String(error));process.exitCode=1 }
  }
  if(errors.length)process.exitCode=1
} finally {
  await browser.close()
  await writeFile(`${folder}/comparacion-${effect}.json`, JSON.stringify({date:new Date().toISOString(),cpu:os.cpus()[0].model,os:os.version(),memoryGiB:os.totalmem()/2**30,duration,reports},null,2))
}
