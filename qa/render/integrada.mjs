import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
let report={}
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}})
  await page.addInitScript(()=>{
    localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')
    // QA only: request the physical low-power adapter, without changing OS settings.
    if(navigator.gpu){const request=navigator.gpu.requestAdapter.bind(navigator.gpu);navigator.gpu.requestAdapter=options=>request({...options,powerPreference:'low-power'})}
  })
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture}:null})
  if(report.adapter?.vendor==='intel') {
    await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
    await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Perfil',{exact:true}).selectOption('equilibrada');await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
    await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy&&(s.active||s.message)},null,{timeout:120000})
    report.activation=await page.evaluate(()=>window.tukiQA.render.fotorealista())
  }else report.note='El navegador no expuso la GPU Intel integrada; no se midió otra RTX como si fuera un equipo modesto.'
  console.log(JSON.stringify(report))
}finally{await browser.close();await writeFile('.qa-local/fotorealista/integrada.json',JSON.stringify(report,null,2))}
