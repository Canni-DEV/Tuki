import { chromium,firefox } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=process.env.TUKI_RENDER_BROWSER==='firefox'
  ? await firefox.launch({channel:'moz-firefox',headless:true})
  : await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={browser:browser.version(),scenes:[],errors:[]}
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}})
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption('equilibrada');await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy&&(s.active||s.message)},null,{timeout:120000})
  report.activation=await page.evaluate(()=>window.tukiQA.render.fotorealista())
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  if(report.activation.active) {
    await page.screenshot({path:'.qa-local/fotorealista/portada.png'})
    for(let run=0;run<2;run++)for(const fixture of ['vuelta','dispositivos100','dispositivos200','taza-mixta','llave-abierta','puente']) {
      await page.evaluate(f=>window.tukiQA.cargar(f),fixture)
      await page.getByRole('button',{name:'Vista superior',exact:true}).click()
      await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
      await page.waitForTimeout(1000)
      const state=await page.evaluate(()=>window.tukiQA.render.fotorealista());if(!state.active)throw new Error('Se perdió Fotorealista: '+state.message)
      report.scenes.push({fixture,run,...state});console.log(JSON.stringify({fixture,run,objects:state.renderer.objects,thumbnails:state.thumbnails,thumbnailError:state.thumbnailError}))
      if(run===0)await page.screenshot({path:`.qa-local/fotorealista/recorrido-${fixture}.png`})
    }
  }
  if(report.errors.length)throw new Error(report.errors.join('\n'))
}finally{await browser.close();await writeFile(`.qa-local/fotorealista/recorridos-${process.env.TUKI_RENDER_BROWSER??'chromium'}.json`,JSON.stringify(report,null,2))}
