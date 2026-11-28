// Observe the actual game instance at the solver boundary in Vite's module graph.
// The hook is installed in the test page after qualification and restored in finally.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const folder=process.env.TUKI_PARITY_OUTPUT??'.qa-local/fotorealista/taller-cuidado/paridad'
await mkdir(folder,{recursive:true})
const server=await createServer({base:'/',server:{host:'127.0.0.1',port:0,watch:null},logLevel:'error'})
let browser
try {
  await server.listen()
  const url=server.resolvedUrls.local[0]+'?revision'
  browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
  const expected=new Map(),report=[]
  for(const mode of ['actual','fotorealista']) {
    const page=await browser.newPage({viewport:{width:1280,height:800}})
    const downloads=[],errors=[]
    page.on('request',r=>{if(r.url().includes('/fotorealista/'))downloads.push(r.url())})
    page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
    await page.goto(url);await page.waitForFunction(()=>!!window.tukiQA)
    await page.evaluate(()=>window.tukiQA.cargar('recta'))
    if(mode==='fotorealista') {
      await page.getByRole('button',{name:'Preferencias',exact:true}).click()
      await page.getByLabel('Visuales',{exact:true}).selectOption(mode)
      await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.active,null,{timeout:120000})
      await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    }
    for(const result of ['victoria','detenida']) {
      const record=await page.evaluate(async({mode,result})=>{
        const qa=window.tukiQA
        await qa.cargar(result==='detenida'?'contrapeso-fallo':'recta')
        const before=qa.estado()
        const {Simulation}=await import('/src/simulation.ts')
        const steps=[],original=Simulation.prototype.step
        let contacts=0,events=0
        Simulation.prototype.step=function(...args) {
          const emitted=original.apply(this,args),pairs=[]
          this.world.forEachCollider(a=>this.world.contactPairsWith(a,b=>{
            if(a.handle<b.handle)pairs.push([a.handle,b.handle])
          }))
          pairs.sort((a,b)=>a[0]-b[0]||a[1]-b[1])
          const manifolds=[]
          for(const [a,b] of pairs) {
            this.world.contactPair(this.world.getCollider(a),this.world.getCollider(b),m=>{
              const points=[]
              for(let i=0;i<m.numSolverContacts();i++)points.push([m.solverContactPoint(i),m.solverContactDist(i)])
              if(points.length)manifolds.push([a,b,m.normal(),points])
            })
          }
          contacts+=manifolds.length;events+=emitted.length
          steps.push(JSON.stringify([this.tick,[...this.poses()],manifolds,emitted,this.result]))
          return emitted
        }
        try {qa.empujar();await qa.avanzarHastaResultado()}
        finally {Simulation.prototype.step=original}
        const final=qa.estado()
        if(!steps.length || steps.length!==final.paso)throw Error('Traza incompleta: '+steps.length+'/'+final.paso)
        if(mode==='fotorealista'&&!qa.render.fotorealista().active)throw Error('Calidad se desactivó')
        return {steps,contacts,events,result:final.resultado,montaje:JSON.stringify(before.armado)}
      },{mode,result})
      assert.equal(record.result,result)
      assert(record.contacts>0 && record.events>0)
      const hashes=record.steps.map(step=>createHash('sha256').update(step).digest('hex'))
      if(mode==='actual')expected.set(result,{hashes,montaje:record.montaje})
      else {
        const base=expected.get(result)
        assert.equal(record.montaje,base.montaje)
        assert.equal(hashes.length,base.hashes.length)
        hashes.forEach((hash,i)=>assert.equal(hash,base.hashes[i],'Diferencia física en el paso '+(i+1)))
      }
      report.push({mode,result,ticks:hashes.length,contactManifolds:record.contacts,events:record.events,
        sha256:createHash('sha256').update(hashes.join('')).digest('hex')})
    }
    if(mode==='actual')assert.deepEqual(downloads,[])
    assert.deepEqual(errors,[])
    await page.close()
  }
  await writeFile(join(folder,'informe.json'),JSON.stringify({report},null,2))
  console.log(JSON.stringify(report))
} finally {await browser?.close();await server.close()}
