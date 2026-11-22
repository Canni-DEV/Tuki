import assert from 'node:assert/strict'
import { mkdir,writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const folder=process.env.TUKI_APPROVAL_OUTPUT??'.qa-local/fotorealista/aprobacion';await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={checks:[],errors:[]},url=process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision'
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000}})
  await context.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  let page=await context.newPage()
  const watch=async p=>{
    p.on('pageerror',e=>report.errors.push(e.message))
    p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503'))report.errors.push(m.text())})
    await p.addInitScript(()=>{
      window.probeShown=false;window.probeMessages=[]
      const tick=()=>{
        const s=window.tukiQA?.render.fotorealista(),canvas=document.querySelector('canvas[data-render=fotorealista]')
        if(s?.busy&&canvas&&getComputedStyle(canvas).visibility!=='hidden')window.probeShown=true
        if(s?.busy&&s.message.startsWith('Comprobando luz')||s?.busy&&s.message.startsWith('Comprobando iluminación')) {
          if(window.probeMessages.at(-1)!==s.message)window.probeMessages.push(s.message)
        }
        requestAnimationFrame(tick)
      };requestAnimationFrame(tick)
    })
  }
  const preferences=async()=>{if(!await page.getByLabel('Visuales',{exact:true}).isVisible())await page.getByRole('button',{name:'Preferencias',exact:true}).click()}
  const activate=async(expected)=>{
    await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
    await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy},null,{timeout:120000})
    const state=await page.evaluate(()=>window.tukiQA.render.fotorealista());assert(state.active,state.message);assert.equal(state.qualification,expected)
    assert.equal(await page.evaluate(()=>window.probeShown),false)
    report.checks.push({expected,state});return state
  }
  const stop=async()=>{await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('actual')}
  const stored=()=>page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('tuki.render.aprobacion.'))))
  await watch(page);await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA);await page.evaluate(()=>window.tukiQA.cargar('bajada'))
  const before=await page.evaluate(()=>window.tukiQA.estado())
  await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.message.includes('Comprobando luz'),null,{timeout:120000})
  assert.equal(await page.locator('canvas[data-render=fotorealista]').evaluate(c=>getComputedStyle(c).visibility),'hidden')
  assert.equal(await page.evaluate(()=>window.tukiQA.render.fotorealista().renderer.timing.firstFrameAt),0)
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  await page.screenshot({path:`${folder}/progreso-discreto.png`})
  await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().busy,null,{timeout:120000})
  const first=await page.evaluate(()=>window.tukiQA.render.fotorealista());assert(first.active,first.message);assert.equal(first.qualification,'measured')
  assert.equal(await page.evaluate(()=>window.probeShown),false)
  const after=await page.evaluate(()=>window.tukiQA.estado())
  for(const field of ['armado','vista','seleccion','fase'])assert.deepEqual(after[field],before[field],field)
  report.checks.push({expected:'first measured',state:first})
  const approval=await stored();assert.equal(Object.keys(approval).length,1)
  await stop();await page.setViewportSize({width:1280,height:800});await page.getByLabel('Apariencia').selectOption('oscuro');await activate('saved')
  await page.reload();await page.waitForFunction(()=>window.tukiQA?.render.fotorealista()?.active,null,{timeout:120000})
  assert.equal(await page.evaluate(()=>window.tukiQA.render.fotorealista().qualification),'saved');assert.deepEqual(await page.evaluate(()=>window.probeMessages),[])
  report.checks.push({expected:'reload saved'})
  // A fresh browser context has no controller memory, only the persisted localStorage snapshot.
  const state=await context.storageState();await context.close()
  const fresh=await browser.newContext({viewport:{width:1920,height:1080},storageState:state});page=await fresh.newPage();await watch(page)
  await page.goto(url);await page.waitForFunction(()=>window.tukiQA?.render.fotorealista()?.active,null,{timeout:120000})
  assert.equal(await page.evaluate(()=>window.tukiQA.render.fotorealista().qualification),'saved');assert.deepEqual(await page.evaluate(()=>window.probeMessages),[])
  report.checks.push({expected:'fresh context saved'})
  // An explicit retest remains available; cancelling it must preserve the prior approval.
  await preferences();await page.getByRole('button',{name:'Comprobar fotorealista',exact:true}).click()
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.message.includes('Comprobando luz'),null,{timeout:120000})
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  await page.getByRole('button',{name:'Cancelar preparación visual',exact:true}).click()
  assert.deepEqual(await stored(),approval);await activate('saved')
  // Transient resource failure does not revoke hardware qualification.
  await stop();await page.route('**/fotorealista/recursos/**',r=>r.fulfill({status:503,body:'temporary failure'}))
  await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().busy,null,{timeout:120000})
  assert.equal(await page.evaluate(()=>window.tukiQA.render.fotorealista().active),false);assert.deepEqual(await stored(),approval)
  await page.unroute('**/fotorealista/recursos/**');await activate('saved')
  // A different profile needs its own successful measurement.
  await stop();await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption('equilibrada');await activate('measured')
  assert.equal(Object.keys(await stored()).length,2)
  await page.evaluate(()=>window.tukiQA.render.perderDispositivo());await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().active)
  const revoked=await stored();assert.equal(Object.keys(revoked).length,1);assert.equal(revoked['tuki.render.aprobacion.alta'],approval['tuki.render.aprobacion.alta'])
  report.checks.push({expected:'device loss revokes affected profile only'})
  assert.deepEqual(report.errors,[])
  console.log('Aprobación persistente, escena de prueba oculta, recarga, perfil, cancelación, fallo de carga y pérdida GPU: OK')
} finally {await writeFile(`${folder}/informe.json`,JSON.stringify(report,null,2));await browser.close()}
