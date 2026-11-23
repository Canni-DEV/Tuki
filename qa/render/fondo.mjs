import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'
const folder=process.env.TUKI_FONDO_OUTPUT??'.qa-local/fotorealista/fondo/validacion'
const fast=process.env.TUKI_FONDO_FAST==='1',horizon=process.env.TUKI_FONDO_HORIZONTE==='1'
const report={cases:[],errors:[],colors:[],switches:[]}
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}})
  page.setDefaultTimeout(20000)
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  const approval=JSON.parse(await readFile(process.env.TUKI_APPROVAL_INPUT??'.qa-local/fotorealista/calidad-inicio/informe.json','utf8')).checks[0].check
  await page.addInitScript(check=>{
    if(!sessionStorage.getItem('fondo-qa')) {
      localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')
      localStorage.setItem('tuki.render.comprobacion',JSON.stringify(check));sessionStorage.setItem('fondo-qa','1')
    }
  },approval)
  const state=()=>page.evaluate(()=>window.tukiQA.estado())
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  const open=async()=>{if(!await page.getByLabel('Cámara',{exact:true}).isVisible())await page.getByRole('button',{name:'Preferencias',exact:true}).click()}
  const close=()=>page.getByRole('button',{name:'Cerrar',exact:true}).click()
  const ready=async()=>{
    await page.waitForFunction(()=>{const s=window.tukiQA?.render.fotorealista();return s&&!s.busy},null,{timeout:120000})
    const s=await page.evaluate(()=>window.tukiQA.render.fotorealista());assert(s.active,JSON.stringify(s));assert.equal(s.qualification,'saved');return s
  }
  const angle=async(az,el)=>{
    if(el===90){await page.getByRole('button',{name:'Vista superior',exact:true}).click();await frame();return}
    const v=(await state()).vista
    const dx=-Math.atan2(Math.sin(az*Math.PI/180-v.azimut),Math.cos(az*Math.PI/180-v.azimut))/.006,dy=(el*Math.PI/180-v.elevacion)/.006
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/250))
    for(let i=0;i<steps;i++) {
      await page.mouse.move(800,480);await page.mouse.down({button:'right'});await page.mouse.move(800+dx/steps,480+dy/steps,{steps:2});await page.mouse.up({button:'right'})
    }
    await frame()
  }
  const checkColors=async(theme,name)=>{
    const png=await page.screenshot({path:`${folder}/${name}.png`})
    const metrics=await page.evaluate(async({data,theme})=>{
      const im=new Image();im.src='data:image/png;base64,'+data;await im.decode()
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0)
      const linear=hex=>[16,8,0].map(s=>{const n=((hex>>s)&255)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4})
      const a=linear(theme==='oscuro'?0x070f0e:0xf4eee2),b=linear(theme==='oscuro'?0x1b271d:0xe9dfcb)
      let maxError=0,maxJump=0;const samples=[]
      for(const x of [30,800,1570]) {
        let previous
        for(let y=110;y<=260;y++) {
          const t=(y+.5)/c.height,s=t*t*(3-2*t),expected=a.map((n,i)=>{const v=n+(b[i]-n)*s;return Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055))})
          const rgb=[...ctx.getImageData(x,y,1,1).data].slice(0,3)
          maxError=Math.max(maxError,...rgb.map((v,i)=>Math.abs(v-expected[i])))
          if(previous)maxJump=Math.max(maxJump,...rgb.map((v,i)=>Math.abs(v-previous[i])))
          previous=rgb;if(y===110||y===180||y===260)samples.push({x,y,rgb})
        }
      }
      return {maxError,maxJump,samples}
    },{data:png.toString('base64'),theme})
    report.colors.push({name,...metrics});assert(metrics.maxError<=2,`${name}: ${JSON.stringify(metrics)}`);assert(metrics.maxJump<=2,`${name}: franja`)
  }
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4188/Tuki/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  for(const level of ['recta','vuelta'])for(const mode of ['actual','alta','equilibrada']) {
    await page.evaluate(n=>window.tukiQA.cargar(n),level)
    await open()
    if(mode==='actual')await page.getByLabel('Visuales',{exact:true}).selectOption('actual')
    else {
      await page.getByLabel('Perfil',{exact:true}).selectOption(mode)
      await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista');await ready()
    }
    for(const theme of ['claro','oscuro'])for(const projection of ['ortografica','perspectiva']) {
      await open();await page.getByLabel('Apariencia').selectOption(theme);await page.getByLabel('Cámara',{exact:true}).selectOption(projection);await close()
      await page.getByRole('button',{name:'Ver mesa',exact:true}).click();await frame()
      const before=await state()
      for(const el of horizon?[12]:fast?[12,35,90]:[12,15,18,35,85,90])for(const az of el===90?[0]:fast?[0,180]:[0,45,90,135,180,225,270,315]) {
        await angle(az,el)
        const s=await state();assert.deepEqual(s.vista.centro,before.vista.centro);assert.equal(s.vista.alto,before.vista.alto)
        assert(Math.abs(s.vista.elevacion-el*Math.PI/180)<.001)
        if(el!==90)assert(Math.abs(Math.atan2(Math.sin(s.vista.azimut-az*Math.PI/180),Math.cos(s.vista.azimut-az*Math.PI/180)))<.001)
        assert.deepEqual(s.armado,before.armado)
        const name=`${level}-${mode}-${theme}-${projection}-${az}-${el}`
        if(el===12)await checkColors(theme,name)
        else if(az===0&&(el===35||el===90))await page.screenshot({path:`${folder}/${name}.png`})
        report.cases.push({level,mode,theme,projection,az,el})
      }
      if(mode!=='actual')assert.equal((await ready()).thumbnailError,'')
      console.log(`${level} / ${mode} / ${theme} / ${projection}: continuo`)
    }
  }
  if(!fast&&!horizon) {
    await open()
    for(let i=0;i<20;i++) {
      await page.getByLabel('Apariencia').selectOption(i%2?'oscuro':'claro')
      await page.getByLabel('Cámara',{exact:true}).selectOption(i%2?'perspectiva':'ortografica')
      await page.getByLabel('Visuales',{exact:true}).selectOption('actual')
      await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista');await ready();await frame()
      await page.waitForFunction(()=>window.tukiQA.render.fotorealista().thumbnails>0)
      const s=await ready();report.switches.push(s.renderer.memory)
    }
    const warm=report.switches[3],last=report.switches.at(-1)
    assert(last.textures<=warm.textures+2,JSON.stringify(report.switches));assert(last.geometries<=warm.geometries+1)
    for(const theme of ['claro','oscuro']) {
      await open();await page.getByLabel('Apariencia').selectOption(theme);await page.getByLabel('Movimiento de la interfaz').selectOption('completo');await close()
      await page.reload();await ready();await page.waitForFunction(()=>window.tukiQA.render.entrada().terminada)
      await page.screenshot({path:`${folder}/portada-${theme}.png`})
      await page.evaluate(()=>window.tukiQA.cargar('vuelta'));await page.getByRole('button',{name:'Empujar',exact:true}).click()
      await page.waitForFunction(()=>window.tukiQA.estado().paso>30);await page.screenshot({path:`${folder}/jugada-${theme}.png`})
    }
  }
  assert.deepEqual(report.errors,[])
}catch(error){report.failure=error.stack;throw error}
finally {await writeFile(`${folder}/informe.json`,JSON.stringify(report,null,2));await browser.close()}
