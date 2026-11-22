// Real camera gestures, production contact pass, identical poses and no renderer overlap.
import { chromium } from 'playwright'
import { mkdir,writeFile } from 'node:fs/promises'
const folder=process.env.TUKI_SWEEP_OUTPUT??'.qa-local/fotorealista/barrido'
await mkdir(folder,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={samples:[],errors:[]},rad=Math.PI/180
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}})
  page.on('pageerror',e=>report.errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  const angle=async(az,el)=>{
    const v=await page.evaluate(()=>window.tukiQA.estado().vista)
    let dx=-Math.atan2(Math.sin(az*rad-v.azimut),Math.cos(az*rad-v.azimut))/.006,dy=(el*rad-v.elevacion)/.006
    const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/250)
    for(let i=0;i<steps;i++) {
      await page.mouse.move(800,480);await page.mouse.down({button:'right'})
      await page.mouse.move(800+dx/steps,480+dy/steps,{steps:3});await page.mouse.up({button:'right'})
    }
    await page.waitForTimeout(70)
    const actual=await page.evaluate(()=>window.tukiQA.estado().vista)
    if(Math.abs(Math.atan2(Math.sin(actual.azimut-az*rad),Math.cos(actual.azimut-az*rad)))>.005||Math.abs(actual.elevacion-el*rad)>.005)throw new Error('La cámara no llegó al ángulo pedido')
    return actual
  }
  const levels=(process.env.TUKI_SWEEP_LEVELS??'bajada,vuelta').split(',')
  const qualities=(process.env.TUKI_SWEEP_QUALITIES??'alta,equilibrada').split(',')
  const elevations=(process.env.TUKI_SWEEP_ELEVATIONS??'12,20,35,55,75,85').split(',').map(Number)
  const azimuths=(process.env.TUKI_SWEEP_AZIMUTHS??Array.from({length:12},(_,i)=>i*30).join(',')).split(',').map(Number)
  for(const level of levels) {
    await page.evaluate(id=>window.tukiQA.cargar(id),level)
    const dimensions=level==='bajada'?[.90,.90]:[.80,.50]
    for(const backend of (process.env.TUKI_SWEEP_BACKENDS??'actual,webgpu').split(','))for(const quality of backend==='actual'?['alta']:qualities) {
      if(backend==='fotorealista') {
        await page.evaluate(()=>window.tukiQA.render.seleccionar('actual'))
        await page.getByRole('button',{name:'Preferencias',exact:true}).click()
        await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption(quality)
        await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
        await page.waitForFunction(()=>{const s=window.tukiQA.render.fotorealista();return s&&!s.busy},null,{timeout:120000})
        const state=await page.evaluate(()=>window.tukiQA.render.fotorealista());if(!state.active)throw new Error(state.message)
        await page.getByRole('button',{name:'Cerrar',exact:true}).click()
      } else await page.evaluate(([b,q])=>window.tukiQA.render.seleccionar(b,q,'contacto'),[backend,quality])
      for(const theme of ['claro','oscuro']) {
        await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Apariencia').selectOption(theme);await page.getByRole('button',{name:'Cerrar',exact:true}).click()
        let worst=-1,worstImage,worstName
        for(const elevation of elevations)for(const azimuth of azimuths) {
          const view=await angle(azimuth,elevation)
          const points=await page.evaluate(([w,h])=>{
            const points=[]
            for(let i=-4;i<=4;i++)for(const sign of [-1,1])for(const side of [0,1]) {
              const x=side?i*w/10:sign*w*.43,z=side?sign*h*.43:i*h/10
              points.push(window.tukiQA.proyectar([x,.0001,z]))
            }
            return points
          },dimensions)
          const screenshot=await page.screenshot()
          const metrics=await page.evaluate(async({data,points})=>{
            const image=new Image();image.src='data:image/png;base64,'+data;await image.decode()
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0)
            const lumas=[],chromas=[];let pale=0,clipped=0
            for(const p of points) {
              if(!p||p.x<10||p.x>canvas.width-10||p.y<100||p.y>canvas.height-170)continue
              const rgb=ctx.getImageData(Math.round(p.x)-1,Math.round(p.y)-1,3,3).data
              for(let i=0;i<rgb.length;i+=4) {
                const [r,g,b]=rgb.slice(i,i+3),l=(.2126*r+.7152*g+.0722*b)/255,c=(Math.max(r,g,b)-Math.min(r,g,b))/Math.max(1,r,g,b)
                lumas.push(l);chromas.push(c);if(l>.75&&c<.18)pale++;if(Math.min(r,g,b)>=250)clipped++
              }
            }
            lumas.sort((a,b)=>a-b);chromas.sort((a,b)=>a-b)
            return {points:lumas.length,p95Luma:lumas[Math.floor(lumas.length*.95)],p05Chroma:chromas[Math.floor(chromas.length*.05)],pale:pale/lumas.length,clipped:clipped/lumas.length}
          },{data:screenshot.toString('base64'),points})
          const sample={level,backend,quality,theme,azimuth,elevation,view,...metrics};report.samples.push(sample)
          const score=metrics.pale*10+metrics.p95Luma
          if(score>worst){worst=score;worstImage=screenshot;worstName=`${level}-${backend}-${quality}-${theme}-worst-${azimuth}-${elevation}.png`}
          if(elevation===20||elevation===55)await writeFile(`${folder}/${level}-${backend}-${quality}-${theme}-${azimuth}-${elevation}.png`,screenshot)
        }
        await writeFile(`${folder}/${worstName}`,worstImage)
        await page.getByRole('button',{name:'Vista superior',exact:true}).click();await page.waitForTimeout(100)
        await page.screenshot({path:`${folder}/${level}-${backend}-${quality}-${theme}-superior.png`})
        console.log(JSON.stringify({level,backend,quality,theme,worstName,worst}))
      }
    }
  }
  if(report.errors.length)throw new Error(report.errors.join('\n'))
} finally {await writeFile(`${folder}/informe.json`,JSON.stringify(report,null,2));await browser.close()}
