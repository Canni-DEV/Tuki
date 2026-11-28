import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const urls=[['baseline',process.env.TUKI_BASE_URL??'http://127.0.0.1:4182/Tuki/?revision'],
  ...(process.env.TUKI_COMPARE_URL?[['candidate',process.env.TUKI_COMPARE_URL]]:[])]
const folder=process.env.TUKI_AA_OUTPUT??'.qa-local/fotorealista/taller-cuidado/mesas/default-aa'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={aa:[],ab:[],errors:[]},images=new Map()
try {
  for(const [revision,url] of urls) for(const [name,level,theme,projection] of [
    ['vuelta-oscuro-ortografica','vuelta','oscuro','ortografica'],
    ['mate-oscuro-perspectiva','mate','oscuro','perspectiva'],
  ]) for(let contextIndex=0;contextIndex<2;contextIndex++) {
    const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1})
    const page=await context.newPage()
    page.on('pageerror',e=>report.errors.push(e.message))
    await page.addInitScript(()=>{
      localStorage.setItem('tuki.v1.preferencias.audio','false')
      localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')
    })
    await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA)
    await page.evaluate(level=>window.tukiQA.cargar(level),level)
    await page.getByRole('button',{name:'Preferencias',exact:true}).click()
    await page.locator('#pref-apariencia').selectOption(theme)
    await page.getByLabel('Cámara',{exact:true}).selectOption(projection)
    await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    await page.getByRole('button',{name:'Ver mesa',exact:true}).click()
    await page.mouse.move(1,1)
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))
    const state=await page.evaluate(()=>{const s=window.tukiQA.estado();return {vista:s.vista,camara:s.camara,paso:s.paso,fase:s.fase}})
    const png=await page.screenshot({style:'#interfaz,#aviso,#carga,#inventario-rapido,.stage>:not(canvas){visibility:hidden!important}'})
    await writeFile(join(folder,`${revision}-${name}-${contextIndex+1}.png`),png)
    const key=`${revision}:${name}`,list=images.get(key)??[];list.push({png,state});images.set(key,list)
    await context.close()
  }
  assert.deepEqual(report.errors,[])
  const page=await browser.newPage()
  async function compare(name,contexts) {
    assert.deepEqual(contexts[1].state,contexts[0].state,`Cámara/estado difirió en ${name}`)
    const diff=await page.evaluate(async(data)=>{
      const decoded=await Promise.all(data.map(async b64=>{
        const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode()
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
        return {pixels:ctx.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height}
      }))
      let count=0,xmin=decoded[0].width,xmax=-1,ymin=decoded[0].height,ymax=-1
      for(let i=0;i<decoded[0].pixels.length;i+=4)if(decoded[0].pixels[i]!==decoded[1].pixels[i]||decoded[0].pixels[i+1]!==decoded[1].pixels[i+1]||decoded[0].pixels[i+2]!==decoded[1].pixels[i+2]||decoded[0].pixels[i+3]!==decoded[1].pixels[i+3]){
        count++;const x=(i/4)%decoded[0].width,y=Math.floor(i/4/decoded[0].width);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)
      }
      return {count,xmin,xmax,ymin,ymax}
    },contexts.map(c=>c.png.toString('base64')))
    return {name,state:contexts[0].state,...diff}
  }
  for(const [name] of [['vuelta-oscuro-ortografica'],['mate-oscuro-perspectiva']]) {
    for(const [revision] of urls) report.aa.push({revision,...await compare(revision+'/'+name,images.get(`${revision}:${name}`))})
    if(urls.length>1) report.ab.push(await compare(name+'/baseline-candidate',[
      images.get(`baseline:${name}`)[0],images.get(`candidate:${name}`)[0],
    ]))
  }
  await writeFile(join(folder,'informe.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally {await browser.close();await writeFile(join(folder,'informe.json'),JSON.stringify(report,null,2))}
