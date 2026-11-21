import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

const folder='.qa-local/fotorealista',seconds=Number(process.env.TUKI_RENDER_SECONDS??60),runs=Number(process.env.TUKI_RENDER_RUNS??5)
const quality=process.env.TUKI_RENDER_QUALITY??'alta',effect=process.env.TUKI_RENDER_EFFECT??'contacto'
const fixture=process.env.TUKI_RENDER_FIXTURE??'vuelta'
const backends=process.env.TUKI_RENDER_BACKEND?.split(',')??['webgpu'],video=process.env.TUKI_RENDER_VIDEO==='1'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={date:new Date().toISOString(),browser:browser.version(),cpu:os.cpus()[0].model,os:os.version(),quality,effect,video,results:[],errors:[]}
try {
  const context=await browser.newContext({viewport:{width:quality==='alta'?2560:1920,height:quality==='alta'?1440:1080},...(video?{recordVideo:{dir:folder+'/videos',size:{width:1280,height:720}}}:{})})
  const page=await context.newPage()
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});return a?{vendor:a.info.vendor,architecture:a.info.architecture}:null})
  await page.evaluate(f=>window.tukiQA.cargar(f),fixture)
  await page.evaluate(async()=>{await window.tukiQA.render.seleccionar('actual');window.tukiQA.render.grabar(true);window.tukiQA.empujar()})
  // Record the moving part of the same physical run once, then reuse its poses for every renderer.
  await page.waitForTimeout(6000)
  report.recording=await page.evaluate(()=>window.tukiQA.render.grabar(false))
  for(const backend of backends)for(const theme of ['claro','oscuro']) {
    await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Apariencia').selectOption(theme);await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    for(let run=1;run<=runs;run++) {
      const result=await page.evaluate(({backend,quality,effect,seconds})=>window.tukiQA.render.reproducir(backend,quality,effect,seconds),{backend,quality,effect,seconds})
      report.results.push({theme,run,...result});console.log(JSON.stringify(report.results.at(-1)))
      await writeFile(`${folder}/reproduccion-${fixture}-${quality}-${effect}${video?'-video':''}.json`,JSON.stringify(report,null,2))
    }
    await page.screenshot({path:`${folder}/jugada-${fixture}-${backend}-${quality}-${effect}-${theme}.png`})
  }
  await context.close()
  if(report.errors.length)throw new Error(report.errors.join('\n'))
} finally {
  await browser.close()
  await writeFile(`${folder}/reproduccion-${fixture}-${quality}-${effect}${video?'-video':''}.json`,JSON.stringify(report,null,2))
}
