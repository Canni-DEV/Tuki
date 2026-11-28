import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { escribirGaleria } from './galeria.mjs'

const folder=process.env.TUKI_TABLES_OUTPUT??'.qa-local/fotorealista/taller-cuidado/mesas'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={captures:[],admission:[],defaultDifferences:[],errors:[]}, pairs=new Map()
try {
  if(process.env.TUKI_TABLES_REVISION==='despues') {
    const baseline=JSON.parse(await readFile(join(folder,'antes.json'),'utf8'))
    report.captures.push(...baseline.captures)
    report.admission.push(...baseline.admission)
    for(const {revision,name,settleFrames,...state} of baseline.captures)pairs.set(name,state)
  }
  for(const [revision,url] of [['antes',process.env.TUKI_BEFORE_URL],['despues',process.env.TUKI_BASE_URL]]) {
    if(process.env.TUKI_TABLES_REVISION && revision!==process.env.TUKI_TABLES_REVISION)continue
    assert(url)
    const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1})
    const requests=[]
    page.on('request',r=>{if(r.url().includes('/fotorealista/'))requests.push(r.url())})
    page.on('pageerror',e=>report.errors.push(e.message))
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
    await page.addInitScript(()=>{
      localStorage.setItem('tuki.v1.preferencias.audio','false')
      localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')
      // During a falling-domino capture, advance every callback with the same
      // native timestamp together, then hold the pose until the screenshot.
      const raf=requestAnimationFrame.bind(window),now=performance.now.bind(performance)
      let base,frames=0,last
      performance.now=()=>base===undefined?now():base+frames*1000/60
      window.requestAnimationFrame=cb=>raf(t=>{
        if(base!==undefined && t!==last){last=t;frames=Math.min(18,frames+1)}
        cb(base===undefined?t:performance.now())
      })
      window.caer=()=>{base=now();frames=0;last=undefined;window.tukiQA.empujar()}
      window.congelada=()=>frames===18
      window.editarDeNuevo=()=>{window.tukiQA.editar();base=undefined}
    })
    await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA)
    await page.evaluate(()=>window.tukiQA.cargar('recta'))
    const open=()=>page.getByRole('button',{name:'Preferencias',exact:true}).click()
    const close=()=>page.getByRole('button',{name:'Cerrar',exact:true}).click()
    const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))))
    async function capture(name,profile) {
      await frames()
      if(profile!=='default') {
        const visual=await page.evaluate(()=>window.tukiQA.render.fotorealista())
        assert(visual.active && visual.quality===profile && !visual.thumbnailError,visual.thumbnailError||visual.message)
      }
      const state=await page.evaluate(()=>{const s=window.tukiQA.estado();return {vista:s.vista,camara:s.camara,paso:s.paso,fase:s.fase}})
      const screenshot=()=>page.screenshot({style:'#interfaz,#aviso,#carga,#inventario-rapido,.stage>:not(canvas){visibility:hidden!important}'})
      let png=await screenshot(),settleFrames=0,stable=false
      for(let attempt=0;attempt<10;attempt++) {
        await frames()
        const next=await screenshot();settleFrames+=3
        if(next.equals(png)){png=next;stable=true;break}
        png=next
      }
      assert(stable,'El render no estabilizó en '+name)
      const filename=revision+'-'+name+'.png'
      await writeFile(join(folder,filename),png)
      if(revision==='antes')pairs.set(name,state)
      else {
        assert.deepEqual(state,pairs.get(name),'Pose o cámara distinta en '+name)
        if(profile==='default') {
          const before=await readFile(join(folder,'antes-'+name+'.png'))
          if(!png.equals(before)) {
            const difference=await page.evaluate(async(images)=>{
              const [a,b]=await Promise.all(images.map(async data=>{
                const img=new Image();img.src='data:image/png;base64,'+data;await img.decode()
                const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height
                const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
                return ctx.getImageData(0,0,img.width,img.height).data
              }))
              let count=0,xmin=innerWidth,xmax=-1,ymin=innerHeight,ymax=-1
              for(let i=0;i<a.length;i+=4) if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3]) {
                count++;const x=(i/4)%innerWidth,y=Math.floor(i/4/innerWidth)
                xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)
              }
              return {count,xmin,xmax,ymin,ymax}
            },[before.toString('base64'),png.toString('base64')])
            if(difference.count)report.defaultDifferences.push({name,...difference})
          }
        }
      }
      report.captures.push({revision,name,...state,settleFrames})
    }
    for(const profile of ['default','alta','equilibrada']) {
      if(profile!=='default') {
        await open()
        const start=await page.evaluate(()=>{performance.clearResourceTimings();return performance.now()})
        await page.getByLabel('Perfil',{exact:true}).selectOption(profile)
        if(await page.getByLabel('Visuales',{exact:true}).inputValue()==='actual')
          await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
        await page.waitForFunction(p=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy&&s.active&&s.quality===p},profile,{timeout:120000})
        const measurement=await page.evaluate(start=>({
          activationMs:performance.now()-start,state:window.tukiQA.render.fotorealista(),
          transferBytes:performance.getEntriesByType('resource').filter(r=>r.name.includes('/fotorealista/')).reduce((total,r)=>total+r.transferSize,0)
        }),start)
        report.admission.push({revision,profile,...measurement})
        await close()
      }
      for(const level of ['recta','vuelta','mate']) {
        await page.evaluate(id=>window.tukiQA.cargar(id),level)
        for(const theme of ['claro','oscuro'])for(const projection of ['ortografica','perspectiva']) {
          await open()
          await page.locator('#pref-apariencia').selectOption(theme)
          await page.getByLabel('Cámara',{exact:true}).selectOption(projection)
          await close()
          await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
          await page.mouse.move(1,1)
          const name=[profile,level,theme,projection].join('-')
          await capture(name,profile)
          if(level==='recta') {
            await page.evaluate(()=>window.caer())
            await page.waitForFunction(()=>window.congelada())
            await capture(name+'-caida',profile)
            await page.evaluate(()=>window.editarDeNuevo())
          }
        }
      }
      if(profile==='default')assert.deepEqual(requests,[])
    }
    await page.close()
    if(revision==='antes')await writeFile(join(folder,'antes.json'),JSON.stringify(report,null,2))
  }
  assert.deepEqual(report.errors,[])
  await escribirGaleria(folder,false)
  assert.deepEqual(report.defaultDifferences,[],'Se encontraron diferencias de píxeles en Default')
} catch(error) {
  report.errors.push(error.stack??String(error))
  throw error
} finally {await writeFile(join(folder,'informe.json'),JSON.stringify(report,null,2));await browser.close()}
