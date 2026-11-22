import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const folder=process.env.TUKI_CAMERA_OUTPUT??'.qa-local/fotorealista/camara'
const url=process.env.TUKI_BASE_URL??'http://127.0.0.1:4188/Tuki/?revision'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={cases:[],errors:[],reloads:[],switches:[]}
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000}})
  let approval
  if(process.env.TUKI_APPROVAL_INPUT) {
    approval=JSON.parse(await readFile(process.env.TUKI_APPROVAL_INPUT,'utf8')).checks[0].check
    report.approvalSource=process.env.TUKI_APPROVAL_INPUT
  }
  await context.addInitScript(check=>{
    if(!sessionStorage.getItem('camera-test-started')) {
      localStorage.setItem('tuki.v1.preferencias.audio','false')
      localStorage.setItem('tuki.v1.preferencias.movimiento','"completo"')
      if(check)localStorage.setItem('tuki.render.comprobacion',JSON.stringify(check))
      sessionStorage.setItem('camera-test-started','true')
    }
  },approval)
  const page=await context.newPage()
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  const state=()=>page.evaluate(()=>window.tukiQA.estado())
  const settings=async()=>{if(!await page.getByLabel('Cámara',{exact:true}).isVisible())await page.getByRole('button',{name:'Preferencias',exact:true}).click()}
  const close=()=>page.getByRole('button',{name:'Cerrar',exact:true}).click()
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  const ready=async()=>{
    await page.waitForFunction(()=>{const s=window.tukiQA?.render.fotorealista();return s&&!s.busy},{},{timeout:120000})
    const s=await page.evaluate(()=>window.tukiQA.render.fotorealista())
    assert(s.active,JSON.stringify(s));return s
  }
  const drag=async(dx,dy)=>{
    await page.mouse.move(800,500);await page.mouse.down({button:'right'})
    await page.mouse.move(800+dx,500+dy,{steps:4});await page.mouse.up({button:'right'});await frame()
  }
  await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA)
  for(const mode of ['actual','fotorealista']) for(const theme of ['claro','oscuro']) {
    await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
    await settings();await page.getByLabel('Apariencia').selectOption(theme)
    await page.getByLabel('Visuales',{exact:true}).selectOption(mode)
    if(mode==='fotorealista')await ready()
    for(const projection of ['ortografica','perspectiva']) {
      await settings()
      const before=await state()
      await page.getByLabel('Cámara',{exact:true}).selectOption(projection);await close();await frame()
      assert.deepEqual((await state()).vista,before.vista)
      await page.getByRole('button',{name:'Ver mesa',exact:true}).click();await frame()
      const start=await state()
      for(const elevation of [35,12,85]) {
        await drag(0,(elevation*Math.PI/180-(await state()).vista.elevacion)/.006)
        for(let angle=0;angle<12;angle++) {
          await drag(2*Math.PI/.006/12,0)
          const s=await state()
          assert.deepEqual(s.vista.centro,start.vista.centro);assert.equal(s.vista.alto,start.vista.alto)
          assert(Math.abs(s.camara.distancia-start.camara.distancia)<1e-9)
          assert.equal(s.camara.fov,projection==='perspectiva'?30:null)
          if(angle===0||angle===6)await page.screenshot({path:`${folder}/${mode}-${theme}-${projection}-${elevation}-${angle}.png`})
        }
      }
      const after=await state();assert.deepEqual(after.armado,start.armado);assert.equal(after.historia,start.historia)
      if(mode==='fotorealista') {
        const s=await ready()
        assert.equal(s.renderer.camera.type,projection==='perspectiva'?'PerspectiveCamera':'OrthographicCamera')
        assert.equal(s.thumbnailError,'')
      }
      report.cases.push({mode,theme,projection,angles:36,stable:true})
      console.log(`${mode} / ${theme} / ${projection}: 36 ángulos, encuadre estable`)
    }
  }
  // Recreate depth/contact passes repeatedly, without requalifying or accumulating targets.
  await settings()
  for(let i=0;i<12;i++) {
    await page.getByLabel('Cámara',{exact:true}).selectOption(i%2?'perspectiva':'ortografica');await frame()
    const s=await ready();assert.equal(s.qualification,'saved')
    report.switches.push(s.renderer.memory)
  }
  const last=report.switches.at(-1),warm=report.switches[3]
  assert(last.textures<=warm.textures+2,JSON.stringify(report.switches))
  // Saved projection is used from startup, with an uninterrupted intro in both themes.
  for(const theme of ['claro','oscuro']) {
    await settings();await page.getByLabel('Apariencia').selectOption(theme);await close()
    await page.reload();await ready()
    assert.equal((await state()).camara.proyeccion,'perspectiva')
    await page.waitForFunction(()=>window.tukiQA.render.entrada().terminada)
    report.reloads.push({theme,camera:(await state()).camara,entry:await page.evaluate(()=>window.tukiQA.render.entrada())})
    await page.screenshot({path:`${folder}/portada-${theme}-perspectiva.png`})
    await page.evaluate(()=>window.tukiQA.cargar('recta'))
    const editable=(await state()).armado.piezas[0]
    const point=await page.evaluate(p=>window.tukiQA.proyectar([p[0],p[1]+.025,p[2]]),editable.posicion)
    await page.mouse.click(point.x,point.y)
    assert.equal((await state()).seleccion,editable.id)
    await page.getByRole('button',{name:'Empujar',exact:true}).click()
    await page.waitForFunction(()=>window.tukiQA.estado().paso>10)
    await page.screenshot({path:`${folder}/jugada-${theme}-perspectiva.png`})
  }
  await settings();await page.getByLabel('Perfil',{exact:true}).selectOption('equilibrada');await ready();await close()
  await page.evaluate(()=>window.tukiQA.cargar('vuelta'))
  for(const theme of ['claro','oscuro']) {
    await settings();await page.getByLabel('Apariencia').selectOption(theme);await close()
    const start=await state();await drag(180,30)
    const s=await ready();assert.equal(s.quality,'equilibrada');assert.equal(s.renderer.camera.type,'PerspectiveCamera')
    assert.deepEqual((await state()).vista.centro,start.vista.centro)
    await page.screenshot({path:`${folder}/equilibrada-${theme}-perspectiva.png`})
  }
  assert.deepEqual(report.errors,[])
} finally {
  await writeFile(`${folder}/informe-gpu.json`,JSON.stringify(report,null,2))
  await browser.close()
}
