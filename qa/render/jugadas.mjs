import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const results=[],errors=[],seconds=Number(process.env.TUKI_RENDER_SECONDS??60)
const output=process.env.TUKI_RENDER_OUTPUT??'.qa-local/fotorealista/jugadas-reales.json'
try {
  const page=await browser.newPage({viewport:{width:2560,height:1440}})
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"completo"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.active,null,{timeout:120000});await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  for(const fixture of (process.env.TUKI_RENDER_FIXTURE?.split(',')??['vuelta','dispositivos100','dispositivos200']))for(const theme of ['claro','oscuro']) {
    await page.evaluate(f=>window.tukiQA.cargar(f),fixture)
    await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Apariencia').selectOption(theme);await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    const measurement=await page.evaluate(async seconds=>{
      const next=()=>new Promise(resolve=>requestAnimationFrame(resolve)),samples=[]
      window.tukiQA.empujar();let start=await next(),previous=start,now=start,rounds=0
      while(now-start<(seconds+2)*1000) {
        now=await next();if(document.hidden)throw new Error('Pestaña oculta')
        if(now-start>=2000)samples.push(now-previous);previous=now
        if(window.tukiQA.estado().fase==='resultado'){rounds++;window.tukiQA.editar();window.tukiQA.empujar()}
      }
      const sorted=samples.toSorted((a,b)=>a-b),p=n=>sorted[Math.ceil(sorted.length*n)-1]
      return {samples:samples.length,p50:p(.5),p95:p(.95),p99:p(.99),max:Math.max(...samples),over50:samples.filter(x=>x>50).length,rounds,state:window.tukiQA.estado(),renderer:window.tukiQA.render.fotorealista()}
    },seconds)
    results.push({fixture,theme,seconds,...measurement});console.log(JSON.stringify({fixture,theme,seconds,p95:measurement.p95,p99:measurement.p99,max:measurement.max,over50:measurement.over50,rounds:measurement.rounds}))
    if(!measurement.renderer.active)throw new Error(measurement.renderer.message)
    await writeFile(output,JSON.stringify({results,errors},null,2))
  }
  if(errors.length)throw new Error(errors.join('\n'))
}finally{await browser.close();await writeFile(output,JSON.stringify({results,errors},null,2))}
