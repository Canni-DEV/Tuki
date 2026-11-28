// Matched close-ups of the actual GLB in two production builds, using a fixed
// presentation frame. Exercise individual meshes and the renderer's instancing.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { escribirGaleria } from './galeria.mjs'

const before=process.env.TUKI_BEFORE_URL, after=process.env.TUKI_BASE_URL
assert(before && after,'Definí TUKI_BEFORE_URL y TUKI_BASE_URL con las dos compilaciones.')
const folder=process.env.TUKI_DETAIL_OUTPUT ?? '.qa-local/fotorealista/taller-cuidado/detalle'
await mkdir(folder,{recursive:true})
const helper=await build({stdin:{resolveDir:process.cwd(),contents:`
  import * as THREE from 'three'
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
  import { instance } from './src/modelos.ts'
  import { fondos } from './src/fondo.ts'
  import { PresentacionRender } from './src/render/presentacion.ts'
  window.preparar=async(base,quality,onError)=>{
    const {create}=await import(base+'fotorealista/runtime/index.js')
    const canvas=document.querySelector('canvas'),scene=new THREE.Scene(),presentation=new PresentacionRender()
    const loader=new GLTFLoader()
    const [model,cup,kettle,book]=await Promise.all(['domino','cup','kettle','book'].map(async id=>{
      const model=(await loader.loadAsync(base+'models/'+id+'.glb')).scene
      model.userData.tukiAsset=id
      return model
    }))
    const pieces=[],dominoes=new THREE.Group(),tableware=new THREE.Group(),binding=new THREE.Group()
    scene.add(dominoes,tableware,binding)
    for(let index=0;index<6;index++) {
      const piece=instance(model,String(index))
      piece.position.set((index%3-1)*.049,index<3?.057:0,0)
      dominoes.add(piece);pieces.push(piece)
    }
    const ceramic=instance(cup,'taza'),steel=instance(kettle,'pava')
    ceramic.position.x=-.049;steel.position.x=.052
    tableware.add(ceramic,steel)
    binding.add(instance(book,'libro'))
    const key=new THREE.DirectionalLight(),lamp=new THREE.SpotLight()
    key.position.set(-.29,.49,-.20);lamp.position.copy(key.position)
    Object.assign(key.shadow.camera,{left:-.12,right:.12,top:.12,bottom:-.12,near:.1,far:1.5})
    lamp.shadow.camera.near=.1;lamp.shadow.camera.far=1.5
    scene.add(key,lamp)
    const session=await create({canvas,backend:'webgpu',quality,effect:'contacto',resourceURL:base+'fotorealista/recursos/',onFailure:onError})
    return {
      async draw(dark,perspective,view) {
        tableware.visible=view==='gres-metal';binding.visible=view==='tela-papel'
        dominoes.visible=!tableware.visible&&!binding.visible
        const target=new THREE.Vector3(0,.053,0),eye=new THREE.Vector3(0,.071,.131/(2*Math.tan(Math.PI/12)))
        let height=.131
        if (!dominoes.visible) {
          const box=new THREE.Box3().setFromObject(tableware.visible?tableware:binding)
          const size=box.getSize(new THREE.Vector3())
          box.getCenter(target)
          height=Math.max(size.x*.83,size.z*.9,size.y*1.3)
          eye.set(-.22,.51,1).normalize().multiplyScalar(height/(2*Math.tan(Math.PI/12))).add(target)
        }
        const aspect=canvas.clientWidth/canvas.clientHeight
        const camera=perspective?new THREE.PerspectiveCamera(30,aspect,.03,1):new THREE.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,.03,1)
        camera.position.copy(eye);camera.lookAt(target)
        pieces.forEach((p,i)=>{p.rotation.y=(i>=3?Math.PI:0)+(view==='rasante'?1.14:.1)})
        scene.userData.tukiFondo=dark?fondos.oscuro:fondos.claro
        session.update(presentation.capture(scene,camera,canvas.clientWidth,canvas.clientHeight,dark))
        await session.compile()
        for(let i=0;i<3;i++){session.render();await session.waitForGPU();await new Promise(requestAnimationFrame)}
      },
      dispose(){session.dispose()}
    }
  }
`},bundle:true,write:false,format:'iife',define:{'import.meta.env.BASE_URL':'"/"'}})
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const errors=[]
const background=[]
async function pixelosLibres(page, bytes) {
  return page.evaluate(async data=>{
    const image=new Image();image.src='data:image/png;base64,'+data;await image.decode()
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
    const context=canvas.getContext('2d');context.drawImage(image,0,0)
    const puntos=[[1,1],[image.width-2,1],[1,image.height-2],[image.width-2,image.height-2],[Math.floor(image.width/2),1]]
    return {width:image.width,height:image.height,pixels:puntos.map(([x,y])=>[...context.getImageData(x,y,1,1).data].slice(0,3))}
  },bytes.toString('base64'))
}
try {
  for(const [revision,url] of [['antes',before],['despues',after]]) {
    if (process.env.TUKI_DETAIL_REVISION && process.env.TUKI_DETAIL_REVISION!==revision) continue
    const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1})
    page.on('pageerror',e=>errors.push(String(e)))
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
    const base=new URL('./',url).href
    await page.route(base+'__detalle__',r=>r.fulfill({contentType:'text/html',body:'<link rel="icon" href="data:,"><style>*{margin:0}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas>'}))
    await page.goto(base+'__detalle__')
    await page.addScriptTag({content:helper.outputFiles[0].text})
    for(const perfil of ['alta','equilibrada']) {
      await page.evaluate(async({base,perfil})=>{window.diagnostico=[];window.mesa=await window.preparar(base,perfil,m=>window.diagnostico.push(m))},{base,perfil})
      for(const tema of ['claro','oscuro'])for(const camara of ['ortografica','perspectiva'])for(const angulo of ['frente','rasante','gres-metal','tela-papel']) {
        await page.evaluate(async({tema,camara,angulo})=>window.mesa.draw(tema==='oscuro',camara==='perspectiva',angulo),{tema,camara,angulo})
        assert.deepEqual(await page.evaluate(()=>window.diagnostico),[])
        await page.screenshot({path:join(folder,[revision,perfil,tema,camara,angulo].join('-')+'.png')})
      }
      await page.evaluate(()=>window.mesa.dispose())
    }
    await page.close()
  }
  assert.deepEqual(errors,[])
  const page=await browser.newPage()
  for(const tema of ['claro','oscuro'])for(const camara of ['ortografica','perspectiva'])for(const angulo of ['frente','rasante']) {
    const antes=await pixelosLibres(page,await readFile(join(folder,['antes','alta',tema,camara,angulo].join('-')+'.png')))
    const despues=await pixelosLibres(page,await readFile(join(folder,['despues','alta',tema,camara,angulo].join('-')+'.png')))
    assert.deepEqual(despues,antes,`Fondo libre distinto en ${tema}/${camara}/${angulo}`)
    background.push({theme:tema,camera:camara,angle:angulo,...despues,equalToBefore:true})
  }
  for(const camara of ['ortografica','perspectiva'])for(const angulo of ['frente','rasante']) {
    const claro=background.find(c=>c.theme==='claro'&&c.camera===camara&&c.angle===angulo)
    const oscuro=background.find(c=>c.theme==='oscuro'&&c.camera===camara&&c.angle===angulo)
    assert.notDeepEqual(claro.pixels,oscuro.pixels,`El fondo no refleja el tema claro/oscuro en ${camara}/${angulo}`)
  }
  await writeFile(join(folder,'fondo-libre.json'),JSON.stringify(background,null,2))
  await escribirGaleria(folder,true)
} finally {await browser.close()}
