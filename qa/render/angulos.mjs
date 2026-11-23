import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  for(const view of ['cerca','orbita','superior']) {
    await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
    const ball=await page.evaluate(()=>{const p=window.tukiQA.estado().armado.piezas.find(p=>p.tipo==='bolita');return window.tukiQA.proyectar(p.posicion)})
    await page.mouse.move(ball.x,ball.y);await page.mouse.wheel(0,-500)
    if(view==='orbita'){await page.mouse.down({button:'right'});await page.mouse.move(ball.x+180,ball.y+30,{steps:18});await page.mouse.up({button:'right'})}
    if(view==='superior')await page.getByRole('button',{name:'Vista superior',exact:true}).click()
    await page.waitForTimeout(200)
    for(const backend of ['actual','webgl2','webgpu']) {
      await page.evaluate(b=>window.tukiQA.render.seleccionar(b,'alta','base'),backend)
      for(const theme of ['claro','oscuro']) {
        await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Apariencia').selectOption(theme);await page.getByRole('button',{name:'Cerrar',exact:true}).click()
        await page.waitForTimeout(200)
        await page.screenshot({path:`.qa-local/fotorealista/angulo-${view}-${backend}-${theme}.png`})
      }
    }
  }
  if(errors.length)throw new Error(errors.join('\n'))
}finally{await browser.close()}
