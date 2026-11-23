import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const folder=process.env.TUKI_APPROVAL_OUTPUT??'.qa-local/fotorealista/calidad-inicio'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const url=process.env.TUKI_BASE_URL??'http://127.0.0.1:4188/Tuki/?revision',key='tuki.render.comprobacion'
const report={checks:[],reloads:[],errors:[]}
const clip=JSON.parse(await readFile('src/data/portada.json','utf8'))
const watch=async page=>{
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('503'))report.errors.push(m.text())})
  await page.addInitScript(()=>{
    window.visualAudit={defaultDraws:0,probeShown:false,messages:[],first:null,finished:null}
    for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      const original=WebGL2RenderingContext.prototype[method]
      WebGL2RenderingContext.prototype[method]=function(...args){
        if(this.canvas.id==='mesa'&&getComputedStyle(this.canvas).visibility==='visible'&&this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)===null)window.visualAudit.defaultDraws++
        return original.apply(this,args)
      }
    }
    const tick=()=>{
      const audit=window.visualAudit,s=window.tukiQA?.render.fotorealista(),entry=window.tukiQA?.render.entrada(),canvas=document.querySelector('canvas[data-render=fotorealista]')
      const visible=canvas&&getComputedStyle(canvas).visibility==='visible'
      if(s?.busy&&visible)audit.probeShown=true
      if(s?.busy&&/Comprobando (luz|iluminación)/.test(s.message)&&audit.messages.at(-1)!==s.message)audit.messages.push(s.message)
      if(visible&&s?.active&&!entry?.preparando&&!audit.first)audit.first={at:performance.now(),entry,qualification:s.qualification}
      if(audit.first&&entry?.terminada&&!audit.finished)audit.finished=performance.now()
      requestAnimationFrame(tick)
    };requestAnimationFrame(tick)
  })
}
try {
  const context=await browser.newContext({viewport:{width:1600,height:1000}})
  await context.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"completo"')})
  let page=await context.newPage();await watch(page);await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA)
  const preferences=async()=>{if(!await page.getByLabel('Visuales',{exact:true}).isVisible())await page.getByRole('button',{name:'Preferencias',exact:true}).click()}
  const close=async()=>{if(await page.getByRole('button',{name:'Cerrar',exact:true}).isVisible())await page.getByRole('button',{name:'Cerrar',exact:true}).click()}
  const ready=async expected=>{
    await page.waitForFunction(()=>{const s=window.tukiQA?.render.fotorealista();return s&&!s.busy&&(s.active||s.message.includes('Default'))},null,{timeout:120000})
    const s=await page.evaluate(()=>window.tukiQA.render.fotorealista());assert(s.active,JSON.stringify(s));assert.equal(s.qualification,expected);return s
  }
  const activate=async expected=>{await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista');return ready(expected)}
  const stop=async()=>{await preferences();await page.getByLabel('Visuales',{exact:true}).selectOption('actual')}
  const stored=()=>page.evaluate(key=>localStorage.getItem(key),key)
  const badge=async()=>{
    await preferences();assert.match(await page.locator('#pref-visuales-aprobacion').innerText(),/✓ Calidad comprobada · Alta y Equilibrada/)
    assert.equal(await page.getByRole('button',{name:'Comprobar Calidad',exact:true}).isVisible(),false)
  }
  await page.evaluate(()=>window.tukiQA.cargar('bajada'))
  const before=await page.evaluate(()=>window.tukiQA.estado())
  await preferences()
  assert.deepEqual(await page.getByLabel('Visuales',{exact:true}).locator('option').allTextContents(),['Default','Calidad'])
  assert.equal(await page.locator('#pref-visuales-aprobacion').isVisible(),false)
  await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.message.includes('Alta · Comprobando luz'),null,{timeout:120000})
  await close();await page.screenshot({path:`${folder}/comprobacion-discreta.png`})
  const first=await ready('measured')
  assert(first.check.profiles.alta.accepted&&first.check.profiles.equilibrada.accepted,JSON.stringify(first.check))
  const audit=await page.evaluate(()=>window.visualAudit)
  assert.equal(audit.probeShown,false);assert.equal(audit.messages.length,4)
  for(const field of ['armado','vista','seleccion','fase'])assert.deepEqual((await page.evaluate(()=>window.tukiQA.estado()))[field],before[field],field)
  const approval=await stored();report.checks.push({name:'Una comprobación mide ambos perfiles y ambos temas',check:first.check})
  // Changing profile reuses the same record, without a new benchmark.
  await preferences();await page.getByLabel('Perfil',{exact:true}).selectOption('equilibrada');await ready('saved')
  assert.equal(await stored(),approval);assert.equal((await page.evaluate(()=>window.visualAudit.messages)).length,4)
  await badge();report.checks.push({name:'Equilibrada reutiliza la comprobación de la primera activación'})
  await stop();await badge();await close()
  // Reload in both themes, with cache cold/slow and warm. First visible scene must be WebGPU.
  for(const theme of ['claro','oscuro']) {
    await preferences();await page.getByLabel('Apariencia').selectOption(theme);await page.getByLabel('Perfil',{exact:true}).selectOption('alta');await activate('saved');await close()
    for(const cache of ['fria','caliente']) {
      if(cache==='fria') {
        const cdp=await context.newCDPSession(page);await cdp.send('Network.clearBrowserCache');await cdp.detach()
        await page.route('**/fotorealista/runtime/index.js',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue().catch(()=>{})})
      }
      await page.reload();await page.waitForFunction(()=>!!window.tukiQA)
      if(cache==='fria') {
        await page.waitForFunction(()=>window.tukiQA.render.entrada().preparando)
        assert.equal(await page.locator('#mesa').evaluate(c=>getComputedStyle(c).visibility),'hidden')
        assert.equal(await page.evaluate(()=>window.tukiQA.render.entrada().iniciada),false)
        await page.screenshot({path:`${folder}/${theme}-cargando.png`})
      }
      await ready('saved')
      await page.waitForFunction(()=>!!window.visualAudit.finished,null,{timeout:15000})
      if(cache==='fria')await page.unrouteAll({behavior:'wait'})
      const measured=await page.evaluate(()=>window.visualAudit)
      assert.equal(measured.defaultDraws,0,'No debe dibujarse Default en pantalla al recargar CALIDAD')
      assert.equal(measured.probeShown,false);assert.deepEqual(measured.messages,[])
      assert.equal(measured.first.entry.terminada,false);assert(measured.first.entry.tiempo<100)
      const poses=measured.first.entry.poses.flat()
      assert.equal(poses.length,clip.frames[0].length)
      assert(poses.every((n,i)=>Math.abs(n-clip.frames[0][i])<.00001),'La entrada debe aparecer en su pose inicial')
      assert(measured.finished-measured.first.at>=measured.first.entry.duracion-80,'Se recortó la animación de entrada')
      report.reloads.push({theme,cache,...measured})
      await badge();await page.screenshot({path:`${folder}/${theme}-${cache}-tilde.png`});await close()
      assert.equal(await stored(),approval)
    }
  }
  const persisted=await context.storageState()
  // A fresh context keeps only actual persisted data and a different browser identity.
  await context.close()
  const fresh=await browser.newContext({viewport:{width:1280,height:800},storageState:persisted,userAgent:'Tuki QA browser update'})
  page=await fresh.newPage();await watch(page);await page.goto(url);await ready('saved');await badge();assert.deepEqual(await page.evaluate(()=>window.visualAudit.messages),[])
  report.checks.push({name:'Contexto nuevo y cambio de navegador conservan la tilde'})
  // Retesting is voluntary; cancelling does not replace the approved record.
  await page.locator('#pref-visuales-opciones summary').click();await page.getByRole('button',{name:'Repetir comprobación',exact:true}).click()
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.message.includes('Comprobando luz'),null,{timeout:120000})
  await close();await page.getByRole('button',{name:'Cancelar preparación visual',exact:true}).click()
  assert.equal(await stored(),approval);await activate('saved');await badge()
  report.checks.push({name:'Repetición voluntaria cancelada conserva ambos resultados'})
  await stop();await page.route('**/fotorealista/recursos/**',r=>r.fulfill({status:503,body:'temporary failure'}))
  await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().busy)
  assert.equal(await page.evaluate(()=>window.tukiQA.render.fotorealista().active),false);assert.equal(await stored(),approval)
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tuki.v1.preferencias.visuales'))),'fotorealista')
  await badge();await page.unrouteAll();await activate('saved')
  await page.evaluate(()=>window.tukiQA.render.perderDispositivo());await page.waitForFunction(()=>!window.tukiQA.render.fotorealista().active)
  assert.equal(await stored(),approval);await badge();await activate('saved')
  report.checks.push({name:'Fallo de recursos y pérdida GPU conservan preferencia y comprobación'})
  // Legacy approvals migrate without rerunning either previously approved profile.
  const legacy=structuredClone(persisted),origin=legacy.origins.find(o=>o.origin===new URL(url).origin)
  origin.localStorage=origin.localStorage.filter(e=>e.name!==key)
  for(const q of ['alta','equilibrada'])origin.localStorage.push({name:`tuki.render.aprobacion.${q}`,value:JSON.stringify({signature:'older-pipeline-browser-gpu',approvedAt:10000,report:JSON.parse(approval).profiles[q]})})
  await fresh.close()
  const migrated=await browser.newContext({viewport:{width:1600,height:1000},storageState:legacy})
  page=await migrated.newPage();await watch(page);await page.goto(url);await ready('saved');await badge()
  assert.deepEqual(await page.evaluate(()=>window.visualAudit.messages),[])
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tuki.render.aprobacion.')).length),0)
  report.checks.push({name:'Migración de las dos aprobaciones anteriores sin repetir pruebas'})
  // Erasing user data removes the tick and allows a fresh single check.
  await stop();await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForFunction(()=>!!window.tukiQA);await preferences()
  assert.equal(await page.locator('#pref-visuales-aprobacion').isVisible(),false)
  assert.equal(await page.getByRole('button',{name:'Comprobar Calidad',exact:true}).isVisible(),true)
  await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.message.includes('Comprobando luz'),null,{timeout:120000})
  await close();await page.getByRole('button',{name:'Cancelar preparación visual',exact:true}).click();assert.equal(await stored(),null)
  report.checks.push({name:'Borrar datos quita la tilde; cancelar no guarda un chequeo parcial'})
  assert.deepEqual(report.errors,[])
  console.log('CALIDAD: comprobación única, recarga sin Default, entrada completa, tilde en ambos temas y recuperación: OK')
} finally {await writeFile(`${folder}/informe.json`,JSON.stringify(report,null,2));await browser.close()}
