import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const results=[]
try {
  for(const quality of ['equilibrada','alta']) {
    const context=await browser.newContext({viewport:{width:quality==='alta'?2560:1920,height:quality==='alta'?1440:1080}}),page=await context.newPage()
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
    await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
    await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
    const cdp=await context.newCDPSession(page);await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:40,downloadThroughput:25_000_000/8,uploadThroughput:5_000_000/8})
    await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption(quality)
    for(const cache of ['fria','caliente']) {
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:cache==='fria'})
      if(cache==='fria')await cdp.send('Network.clearBrowserCache')
      const start=await page.evaluate(()=>{performance.clearResourceTimings();return performance.now()})
      await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
      await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy&&(s.active||s.message)},null,{timeout:120000})
      const result=await page.evaluate(start=>({readyMs:performance.now()-start,state:window.tukiQA.render.fotorealista(),resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/fotorealista/')).map(r=>r.toJSON())}),start)
      result.firstSceneMs=result.state.renderer?.timing.firstFrameAt-start
      results.push({quality,cache,...result});console.log(JSON.stringify({quality,cache,firstSceneMs:result.firstSceneMs,readyMs:result.readyMs,timing:result.state.renderer?.timing}))
      if(!result.state.active)throw new Error(result.state.message)
      await page.getByLabel('Visuales',{exact:true}).selectOption('actual')
    }
    if(errors.length)throw new Error(errors.join('\n'))
    await context.close()
  }
}finally{await browser.close();await writeFile('.qa-local/fotorealista/carga.json',JSON.stringify(results,null,2))}
