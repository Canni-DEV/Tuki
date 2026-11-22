import * as THREE from 'three'
import * as GPU from 'three/webgpu'
import { positionLocal, uniform, vec3, vec4, smoothstep, abs, float, mix, pass, mrt, output, normalView, metalness, roughness } from 'three/tsl'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { ssr } from 'three/addons/tsl/display/SSRNode.js'
import { Motas } from './motas'
import { sombraEstable } from './sombras'
import { segmentosBucle } from './lineas'
import { MapeadoMesa } from './nogal'
import type { CuadroVisual, Geometria, MaterialVisual, ObjetoVisual, OpcionesVisuales, SesionVisual, Textura } from '../../../src/render/contrato'

type Physical = THREE.MeshPhysicalMaterial | GPU.MeshPhysicalNodeMaterial
type ViewObject = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite

export async function create(options: OpcionesVisuales): Promise<SesionVisual> {
  options.signal?.throwIfAborted()
  const gpu = options.backend === 'webgpu'
  let disposed = false
  const timing={resourcesMs:0,environmentMs:0,compileMs:0,firstFrameAt:0}
  const renderer = gpu ? new GPU.WebGPURenderer({ canvas: options.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    : new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
  if (renderer instanceof GPU.WebGPURenderer) {
    renderer.onDeviceLost = () => options.onFailure('Se perdió el dispositivo gráfico.')
    renderer.onError = () => options.onFailure('El dispositivo rechazó una operación de renderizado.')
    try {
      await renderer.init()
      if (!(renderer.backend instanceof GPU.WebGPUBackend)) throw new Error('No hay un backend WebGPU operativo.')
      // Three ignores intentional device destruction. Observe it too, except during our own cleanup.
      const device=(renderer.backend as GPU.WebGPUBackend & {device:GPUDevice}).device
      void device.lost.then(info=>{if(info.reason==='destroyed'&&!disposed)options.onFailure('Se perdió el dispositivo gráfico.')})
      options.signal?.throwIfAborted()
    } catch (error) { disposed=true;renderer.dispose(); throw error }
  }
  const high = options.quality === 'alta', maxPixels = high ? 2560*1440 : 1920*1080
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const scene = new THREE.Scene()
  const orthographicCamera = new THREE.OrthographicCamera(), perspectiveCamera = new THREE.PerspectiveCamera()
  let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = orthographicCamera
  const thumbnailScene = new THREE.Scene(), thumbnailCamera = new THREE.OrthographicCamera()
  const thumbnailTarget = new THREE.WebGLRenderTarget(120,120,{type:THREE.UnsignedByteType,samples:4})
  thumbnailTarget.texture.colorSpace=THREE.SRGBColorSpace
  // Qualification must execute full-resolution GPU work without presenting the test scene.
  let probeTarget: THREE.WebGLRenderTarget | undefined
  const thumbnailLight=new THREE.DirectionalLight(0xfff1dc,2.6);thumbnailLight.position.set(-.4,.5,.7)
  thumbnailScene.add(thumbnailLight,new THREE.HemisphereLight(0xfff5df,0xc1ad8b,.55))
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.6), lamp = new THREE.SpotLight(0xffcb8f, 3, 0, .76, .75, 2)
  // A point-like directional fill creates a white specular sheet on the table at
  // grazing angles (especially with an orthographic camera). Broad room bounce
  // supplies diffuse fill; the environment supplies its broad reflected light.
  const fill = new THREE.HemisphereLight(0xcbdfe9, 0xb1a493, .45)
  for (const l of [sun, lamp]) {
    l.castShadow = true; l.shadow.mapSize.setScalar(high ? 4096 : 2048)
    l.shadow.bias = -.00008; l.shadow.normalBias = .00015; l.shadow.radius = high ? 12 : 6
    if(gpu)Object.assign(l.shadow,{filterNode:sombraEstable(l.shadow.radius,l.shadow.mapSize.x)})
    scene.add(l, l.target)
  }
  scene.add(fill)
  const materials = new Map<string, THREE.Material>(), geometries = new Map<string, THREE.BufferGeometry>()
  const tableMapping = new MapeadoMesa()
  const visualObject = (d: ObjetoVisual): ObjetoVisual => d.asset === 'table' && d.geometry
    ? { ...d, geometry: tableMapping.map(d.geometry, d.matrix) } : d
  const objects = new Map<string, ViewObject>(), particles = new Map<string, Motas>(), textures = new Map<string, THREE.Texture>()
  const batches=new Map<string,{mesh:THREE.InstancedMesh;capacity:number}>(),instanceMatrix=new THREE.Matrix4()
  let instanceCount=0
  const goalUniforms = new Map<string, { recorrido: ReturnType<typeof uniform>; fuerza: ReturnType<typeof uniform> }>()
  const usedTextures = new Set<string>()
  const preparedMaterials=new Map<string,THREE.Material>()
  const manager=new THREE.LoadingManager()
  const loader=new THREE.ImageBitmapLoader(manager).setOptions({imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'}),hdr=new HDRLoader(manager)
  const loadTexture=async(file:string)=>{
    const bitmap=await loader.loadAsync(file),texture=new THREE.Texture(bitmap)
    texture.flipY=false;texture.needsUpdate=true;return texture
  }
  const cancelLoad=()=>{loader.abort();manager.abort()}
  options.signal?.addEventListener('abort',cancelLoad,{once:true})
  const url = (file: string) => options.resourceURL + options.quality + '-' + file
  let owned: THREE.Texture[] = [], width = 0, height = 0
  let envDay: THREE.Texture, envNight: THREE.Texture
  let wood: THREE.Texture, rough: THREE.Texture, normal: THREE.Texture, cloth: THREE.Texture
  let walnut: THREE.Texture, walnutRough: THREE.Texture, walnutNormal: THREE.Texture
  const environmentTargets: { dispose(): void }[] = []
  const effects: { dispose(): void }[] = []
  const pipelines = new Map<THREE.Camera, GPU.RenderPipeline>()
  let pipeline: GPU.RenderPipeline | undefined
  try {
    const loading=performance.now()
    options.signal?.throwIfAborted()
    const settled = await Promise.allSettled([
      loadTexture(url('madera-color.png')), loadTexture(url('madera-rough.png')), loadTexture(url('madera-normal.png')),
      hdr.loadAsync(url('dia.hdr')), hdr.loadAsync(url('noche.hdr')),
      loadTexture(url('tejido-normal.png')),
      loadTexture(options.resourceURL + 'nogal-color.jpg'), loadTexture(options.resourceURL + 'nogal-rough.jpg'),
      loadTexture(options.resourceURL + 'nogal-normal.jpg'),
    ])
    owned = settled.flatMap(r=>r.status==='fulfilled'?[r.value]:[])
    const failure=settled.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw failure.reason
    options.signal?.throwIfAborted()
    timing.resourcesMs=performance.now()-loading
    const environmentStart=performance.now()
    const assets=owned
    ;[wood, rough, normal] = assets
    cloth=assets[5]
    ;[walnut, walnutRough, walnutNormal] = assets.slice(6)
    for (const t of [wood, rough, normal, cloth, walnut, walnutRough, walnutNormal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = high ? 16 : 8 }
    wood.colorSpace = THREE.SRGBColorSpace
    walnut.colorSpace = THREE.SRGBColorSpace
    for (const t of assets.slice(3,5)) t.mapping = THREE.EquirectangularReflectionMapping
    if (renderer instanceof GPU.WebGPURenderer) {
      const generator = new GPU.PMREMGenerator(renderer)
      for (const t of assets.slice(3,5)) environmentTargets.push(generator.fromEquirectangular(t))
      generator.dispose()
    } else {
      const generator = new THREE.PMREMGenerator(renderer)
      for (const t of assets.slice(3,5)) environmentTargets.push(generator.fromEquirectangular(t))
      generator.dispose()
    }
    envDay = (environmentTargets[0] as THREE.RenderTarget).texture
    envNight = (environmentTargets[1] as THREE.RenderTarget).texture
    timing.environmentMs=performance.now()-environmentStart
  } catch (error) { disposed=true;for (const t of owned) {t.dispose();if(t.image instanceof ImageBitmap)t.image.close()} for (const t of environmentTargets) t.dispose(); thumbnailTarget.dispose(); renderer.dispose(); throw error }
  finally { options.signal?.removeEventListener('abort',cancelLoad) }

  function prepararEfectos() {
    pipeline = pipelines.get(camera)
    if (pipeline) return
    if (!(renderer instanceof GPU.WebGPURenderer) || !options.effect || options.effect === 'base') return
    const beauty = pass(scene, camera)
    // Contact and SSGI only need color + normals; don't allocate SSR's extra buffers for them.
    beauty.setMRT(options.effect==='ssr'?mrt({output,normal:normalView,metalness,roughness}):mrt({output,normal:normalView}))
    effects.push(beauty)
    const color = beauty.getTextureNode('output'), depth = beauty.getTextureNode('depth'), normals = beauty.getTextureNode('normal')
    pipeline = new GPU.RenderPipeline(renderer)
    pipelines.set(camera,pipeline)
    if (options.effect === 'contacto') {
      const contact = ao(depth, normals, camera)
      contact.radius.value = .009; contact.thickness.value = .012; contact.samples.value = high ? 24 : 12
      contact.resolutionScale = high ? 1 : .5; contact.useTemporalFiltering = false
      const filtered = denoise(contact.getTextureNode(), depth, normals, camera)
      // r187's DenoiseNode declaration omits its documented vec4 output type.
      pipeline.outputNode = vec4(color.rgb.mul(mix(float(1), vec4(filtered as unknown as GPU.Node<'vec4'>).r, .7)), color.a)
      effects.push(contact,filtered)
    } else if (options.effect === 'ssgi') {
      // Laboratory effect; the playable profile uses stable contact occlusion.
      const gi = ssgi(color, depth, normals, camera as unknown as THREE.PerspectiveCamera)
      gi.radius.value = .025; gi.thickness.value = .01; gi.giIntensity.value = 1
      gi.useTemporalFiltering = false; gi.sliceCount.value = 2; gi.stepCount.value = 8
      const filtered = denoise(gi.getGINode(), depth, normals, camera)
      pipeline.outputNode = vec4(color.rgb.add(vec4(filtered as unknown as GPU.Node<'vec4'>).rgb), color.a); effects.push(gi,filtered)
    } else {
      const reflections = ssr(color, depth, normals as unknown as GPU.Node<'vec3'>, { camera, metalnessNode: beauty.getTextureNode('metalness') as unknown as GPU.Node<'float'>, roughnessNode: beauty.getTextureNode('roughness') as unknown as GPU.Node<'float'>, reflectNonMetals:true })
      reflections.maxDistance.value = .15; reflections.thickness.value = .003
      pipeline.outputNode = vec4(color.rgb.add(reflections.rgb.mul(.2)), color.a); effects.push(reflections)
    }
  }
  prepararEfectos()

  function texture(d: Textura) {
    usedTextures.add(d.id)
    let t = textures.get(d.id)
    if (!t) {
      t = new THREE.Texture(d.image); t.flipY = d.flipY; t.colorSpace = d.colorSpace
      t.wrapS = d.wrapS as THREE.Wrapping; t.wrapT = d.wrapT as THREE.Wrapping
      t.repeat.fromArray(d.repeat); t.offset.fromArray(d.offset); t.center.fromArray(d.center); t.rotation = d.rotation
      t.anisotropy = high ? 16 : 8; t.needsUpdate = true; textures.set(d.id, t)
    }
    if (t.userData.sourceVersion !== d.version) { t.image = d.image; t.needsUpdate = true; t.userData.sourceVersion = d.version }
    return t
  }
  function woodMap(t: THREE.Texture, scale: number) {
    const key = `${t.uuid}/${scale}`
    usedTextures.add(key)
    let result = textures.get(key)
    if (!result) { result = t.clone(); result.repeat.setScalar(scale); result.needsUpdate = true; textures.set(key, result) }
    return result
  }
  function material(d: MaterialVisual, asset: string) {
    const key = d.id + '/' + asset
    const prepared=preparedMaterials.get(key);if(prepared)return prepared
    let m = materials.get(key)
    if (!m) {
      if (d.type === 'SpriteMaterial') m = gpu ? new GPU.SpriteNodeMaterial() : new THREE.SpriteMaterial()
      else if (d.type === 'LineDashedMaterial') m = gpu ? new GPU.LineDashedNodeMaterial() : new THREE.LineDashedMaterial()
      else if (d.type === 'LineBasicMaterial') m = gpu ? new GPU.LineBasicNodeMaterial() : new THREE.LineBasicMaterial()
      else if (d.type === 'MeshBasicMaterial') m = gpu ? new GPU.MeshBasicNodeMaterial() : new THREE.MeshBasicMaterial()
      else if (d.type === 'ShaderMaterial') m = gpu ? new GPU.PointsNodeMaterial({ size: 3, color: 0xffe5b6 }) : new THREE.PointsMaterial({ size: .002, color: 0xffe5b6 })
      else m = gpu ? new GPU.MeshPhysicalNodeMaterial() : new THREE.MeshPhysicalMaterial()
      m.name = d.name; materials.set(key, m)
      if (d.canto && m instanceof GPU.MeshPhysicalNodeMaterial) {
        const recorrido = uniform(d.canto.recorrido), fuerza = uniform(d.canto.fuerza)
        const band = float(1).sub(smoothstep(0, .22, abs(positionLocal.y.div(.05).sub(recorrido))))
        m.emissiveNode = vec3(.85,.48,.18).mul(mix(band, float(.48), float(recorrido.greaterThan(1.5)))).mul(fuerza)
        goalUniforms.set(key, { recorrido, fuerza })
      } else if (d.canto && m instanceof THREE.MeshPhysicalMaterial) {
        const uniforms = { recorrido: { value: d.canto.recorrido }, fuerza: { value: d.canto.fuerza } }
        m.userData.canto = uniforms
        m.onBeforeCompile = shader => {
          shader.uniforms.recorridoLuz = uniforms.recorrido; shader.uniforms.fuerzaLuz = uniforms.fuerza
          shader.vertexShader = 'varying float alturaCanto;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nalturaCanto=position.y/.05;')
          shader.fragmentShader = 'varying float alturaCanto;uniform float recorridoLuz;uniform float fuerzaLuz;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat franja=1.-smoothstep(0.,.22,abs(alturaCanto-recorridoLuz));totalEmissiveRadiance+=vec3(.85,.48,.18)*(recorridoLuz>1.5?.48:franja)*fuerzaLuz;')
        }
      }
    }
    const base = m as THREE.MeshBasicMaterial & THREE.SpriteMaterial & THREE.LineDashedMaterial
    base.color?.fromArray(d.color); base.opacity = d.opacity; base.transparent = d.transparent
    base.depthWrite = d.depthWrite; base.depthTest = d.depthTest; base.side = d.side as THREE.Side
    base.blending = d.blending as THREE.Blending; base.toneMapped = d.toneMapped; base.vertexColors = d.vertexColors
    if (d.rotation !== undefined) base.rotation = d.rotation
    if (d.dashSize !== undefined) { base.dashSize = d.dashSize; base.gapSize = d.gapSize! }
    if (d.map) base.map = texture(d.map)
    if (m instanceof THREE.MeshPhysicalMaterial || m instanceof GPU.MeshPhysicalNodeMaterial) {
      const p = m as Physical; p.roughness = d.roughness; p.metalness = d.metalness; p.emissive.fromArray(d.emissive)
      if (asset === 'table' && /Arce|Ensamble de madera/.test(d.name)) {
        p.map = walnut; p.roughnessMap = walnutRough; p.normalMap = walnutNormal
        // Warm oil finish over the raw veneer; illumination and piece materials stay unchanged.
        p.color.set(0xc8a582); p.normalScale.setScalar(.4)
        p.metalness = 0; p.roughness = 1; p.clearcoat = .06; p.clearcoatRoughness = .55
      } else if (/Arce|Miel tostada|Ensamble de madera/.test(d.name)) {
        p.map = woodMap(wood, 1); p.roughnessMap = woodMap(rough, 1); p.normalMap = woodMap(normal, 1)
        p.normalScale.setScalar(.4); p.color.set(d.name === 'Miel tostada' ? 0xc99658 : 0xffffff)
        // The map averages .635: multiplying it by .85 made the finish .54.
        p.metalness = 0; p.roughness = 1; p.clearcoat = .06; p.clearcoatRoughness = .55
      } else if (/Vidrio/.test(d.name)) {
        p.metalness = 0; p.roughness = .075; p.transmission = /opalino/.test(d.name) ? .22 : /ámbar/.test(d.name) ? .65 : .96
        p.ior = 1.5; p.thickness = .012; p.attenuationDistance = .012; p.envMapIntensity = 2
        p.attenuationColor.set(/ámbar/.test(d.name) ? 0xc58547 : /opalino/.test(d.name) ? 0xffe7b4 : 0x658b7d)
        p.color.set(/opalino/.test(d.name) ? 0xf9e9c7 : /ámbar/.test(d.name) ? 0xdca35f : 0xc9dbd3); p.side = THREE.FrontSide
      } else if (/Esmalte/.test(d.name) && /bend|channel/.test(asset)) {
        p.metalness = 0; p.roughness = .28; p.clearcoat = .08; p.clearcoatRoughness = .25
      } else if (/Tela/.test(d.name)) {
        p.roughness = .92; p.sheen = .24; p.sheenColor.copy(p.color); p.sheenRoughness = .9
        p.normalMap=woodMap(cloth,.5);p.normalScale.setScalar(1.15)
      } else if (/Petróleo/.test(d.name)) { p.metalness = 0; p.roughness = .32; p.clearcoat = .18; p.clearcoatRoughness = .24 }
      if (asset === 'floor') { p.color.set(scene.background instanceof THREE.Color ? scene.background : 0xe5dfd2); p.roughness = 1 }
      const u = goalUniforms.get(key) ?? m.userData.canto
      if (d.canto && u) { u.recorrido.value = d.canto.recorrido; u.fuerza.value = d.canto.fuerza }
    }
    preparedMaterials.set(key,m);return m
  }
  function geometry(d: Geometria) {
    let g = geometries.get(d.id)
    if (!g) {
      g = new THREE.BufferGeometry()
      for (const [name, a] of Object.entries(d.attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized))
      if (d.index) g.setIndex(new THREE.BufferAttribute(d.index.array, d.index.itemSize, d.index.normalized))
      for (const group of d.groups) g.addGroup(group.start, group.count, group.materialIndex)
      g.setDrawRange(d.drawRange.start, d.drawRange.count); geometries.set(d.id, g)
    }
    return g
  }
  function object(d: ObjetoVisual, registry=objects, targetScene=scene) {
    if (d.name === 'suspiro-victoria' && d.geometry) {
      let motas = particles.get(d.id)
      if (!motas) { motas = new Motas(gpu); particles.set(d.id, motas); scene.add(motas.group) }
      motas.update(d, camera); return
    }
    const mats = d.materials.map(m => material(m, d.asset)), mat = mats.length === 1 ? mats[0] : mats
    const geo = d.geometry ? geometry(gpu&&d.type==='LineLoop'?segmentosBucle(d.geometry):d.geometry) : undefined
    let o = registry.get(d.id)
    if (!o) {
      if (d.type === 'Sprite') o = new THREE.Sprite(mat as THREE.SpriteMaterial)
      else if (d.type === 'LineSegments') o = new THREE.LineSegments(geo, mat)
      else if (d.type === 'LineLoop') o = gpu?new THREE.LineSegments(geo,mat):new THREE.LineLoop(geo, mat)
      else if (d.type === 'Line') o = new THREE.Line(geo, mat)
      else if (d.type === 'Points') o = new THREE.Points(geo, mat)
      else o = new THREE.Mesh(geo, mat)
      o.matrixAutoUpdate = false; o.name = d.name; targetScene.add(o); registry.set(d.id, o)
    }
    o.material = mat as never
    if (geo && !(o instanceof THREE.Sprite)) o.geometry = geo
    o.matrix.fromArray(d.matrix); o.matrixWorldNeedsUpdate = true
    o.castShadow = d.castShadow; o.receiveShadow = d.receiveShadow; o.renderOrder = d.renderOrder
    if (o instanceof THREE.Sprite && d.center) o.center.fromArray(d.center)
    return o
  }
  function update(frame: CuadroVisual) {
    if (disposed) return
    const ratio = Math.min(frame.dpr, Math.sqrt(maxPixels / (frame.width * frame.height)))
    const w = Math.max(1, Math.round(frame.width * ratio)), h = Math.max(1, Math.round(frame.height * ratio))
    if (w !== width || h !== height) { width = w; height = h; renderer.setSize(w, h, false); probeTarget?.setSize(w,h) }
    scene.background = new THREE.Color(frame.dark ? 0x101813 : 0xe7e0d2)
    scene.environment = frame.dark ? envNight : envDay
    scene.environmentIntensity = frame.dark ? 1.1 : .55
    renderer.toneMappingExposure = frame.dark ? 1.05 : 1.1
    sun.visible = !frame.dark; lamp.visible = frame.dark; fill.intensity = frame.dark ? .65 : .45
    fill.color.setHex(frame.dark ? 0xbacac4 : 0xcbdfe9); fill.groundColor.setHex(frame.dark ? 0x574230 : 0xb1a493)
    const perspective = frame.camera.type === 'perspective'
    if (perspective !== (camera instanceof THREE.PerspectiveCamera)) {
      camera = perspective ? perspectiveCamera : orthographicCamera
      // Pass/depth nodes retain their camera and compile projection-dependent code.
      // Keep one pipeline per camera: repeatedly rebuilding render passes also
      // allocates new transmission/context resources inside Three's renderer.
      prepararEfectos()
    }
    camera.matrixAutoUpdate = false; camera.matrix.fromArray(frame.camera.matrix); camera.matrixWorldNeedsUpdate = true
    camera.matrix.decompose(camera.position,camera.quaternion,camera.scale)
    const { matrix: _matrix, projection: _projection, type: _type, ...projection } = frame.camera
    Object.assign(camera, projection)
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    const source = frame.lights.find(l=>l.type==='DirectionalLight'), night = frame.lights.find(l=>l.type==='SpotLight')
    if (source) {
      sun.position.fromArray(source.position); sun.target.position.fromArray(source.target)
      Object.assign(sun.shadow.camera, source.shadow); sun.shadow.camera.updateProjectionMatrix()
    }
    if (night) {
      lamp.position.fromArray(night.position); lamp.target.position.fromArray(night.target)
      lamp.intensity = 3.1 * lamp.position.distanceToSquared(lamp.target.position)
      lamp.shadow.camera.near = night.shadow.near; lamp.shadow.camera.far = night.shadow.far; lamp.shadow.focus = night.shadow.focus
      lamp.shadow.camera.updateProjectionMatrix()
    }
    const visualObjects = frame.objects.map(visualObject)
    const ids = new Set(visualObjects.map(d=>d.id)), usedGeo = new Set(visualObjects.map(d=>d.geometry&&(gpu&&d.type==='LineLoop'?segmentosBucle(d.geometry).id:d.geometry.id)))
    const usedMat = new Set(visualObjects.flatMap(d=>d.materials.map(m=>m.id+'/'+d.asset)))
    usedTextures.clear();preparedMaterials.clear()
    // Repeated opaque GLB parts share a draw. Picking and game identity remain in r180.
    // Glass, overlays and custom effects retain individual meshes and sorting.
    const groups=new Map<string,ObjetoVisual[]>(),batched=new Set<string>(),activeBatches=new Set<string>()
    for(const d of visualObjects)if(d.type==='Mesh'&&d.geometry&&d.materials.every(m=>!m.transparent&&m.opacity===1&&!/Vidrio/.test(m.name)&&m.type==='MeshStandardMaterial')) {
      const key=[d.geometry.id,d.asset,d.materials.map(m=>m.id).join(','),d.castShadow,d.receiveShadow,d.renderOrder].join('/')
      const list=groups.get(key);if(list)list.push(d);else groups.set(key,[d])
    }
    instanceCount=0
    for(const [key,list] of groups)if(list.length>=3) {
      const d=list[0],mats=d.materials.map(m=>material(m,d.asset)),geo=geometry(d.geometry!)
      let batch=batches.get(key)
      if(!batch||batch.capacity<list.length) {
        batch?.mesh.removeFromParent();batch?.mesh.dispose()
        const capacity=2**Math.ceil(Math.log2(list.length)),mesh=new THREE.InstancedMesh(geo,mats.length===1?mats[0]:mats,capacity)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.matrixAutoUpdate=false
        mesh.castShadow=d.castShadow;mesh.receiveShadow=d.receiveShadow;mesh.renderOrder=d.renderOrder
        batch={mesh,capacity};batches.set(key,batch);scene.add(mesh)
      }
      batch.mesh.count=list.length
      list.forEach((part,i)=>{instanceMatrix.fromArray(part.matrix);batch!.mesh.setMatrixAt(i,instanceMatrix);batched.add(part.id)})
      batch.mesh.instanceMatrix.needsUpdate=true;instanceCount+=list.length;activeBatches.add(key)
    }
    for(const [key,batch] of batches)if(!activeBatches.has(key)){batch.mesh.removeFromParent();batch.mesh.dispose();batches.delete(key)}
    for (const d of visualObjects) if(!batched.has(d.id))object(d)
    for (const [id, o] of objects) if (!ids.has(id)||batched.has(id)) { o.removeFromParent(); objects.delete(id) }
    for (const [id, p] of particles) if (!ids.has(id)) { p.dispose(); particles.delete(id) }
    for (const [id, g] of geometries) if (!usedGeo.has(id)) { g.dispose(); geometries.delete(id) }
    for (const [id, m] of materials) if (!usedMat.has(id)) { m.dispose(); materials.delete(id); goalUniforms.delete(id) }
    for (const [id,t] of textures) if(!usedTextures.has(id)){t.dispose();textures.delete(id)}
  }
  return {
    update,
    setProbe(active) {
      if(active&&!probeTarget) {
        probeTarget=new THREE.WebGLRenderTarget(Math.max(1,width),Math.max(1,height),{type:THREE.UnsignedByteType,samples:4})
        probeTarget.texture.colorSpace=THREE.SRGBColorSpace
      } else if(!active) {probeTarget?.dispose();probeTarget=undefined}
    },
    async waitForGPU() {
      if(renderer instanceof GPU.WebGPURenderer&&renderer.backend instanceof GPU.WebGPUBackend)
        await (renderer.backend as GPU.WebGPUBackend & {device:GPUDevice}).device.queue.onSubmittedWorkDone()
    },
    simulateDeviceLoss() { if(renderer instanceof GPU.WebGPURenderer && renderer.backend instanceof GPU.WebGPUBackend)(renderer.backend as GPU.WebGPUBackend & {device:GPUDevice}).device.destroy() },
    async compile() { const start=performance.now();await renderer.compileAsync(scene, camera);timing.compileMs+=performance.now()-start },
    render() {
      if(disposed)return
      const previous=renderer.getRenderTarget()
      try {
        if(probeTarget)renderer.setRenderTarget(probeTarget)
        if(pipeline)pipeline.render();else renderer.render(scene,camera)
        if(!probeTarget&&!timing.firstFrameAt){timing.firstFrameAt=performance.now();options.onFirstFrame?.()}
      } finally {
        if(renderer instanceof GPU.WebGPURenderer)renderer.setRenderTarget(previous)
        else renderer.setRenderTarget(previous as THREE.WebGLRenderTarget|null)
      }
    },
    async thumbnail(frame) {
      if(disposed)throw new Error('Render cerrado.')
      if(frame.camera.type!=='orthographic')throw new Error('Las miniaturas requieren una cámara ortográfica.')
      preparedMaterials.clear()
      const registry=new Map<string,ViewObject>()
      for(const d of frame.objects)object(visualObject(d),registry,thumbnailScene)
      thumbnailScene.environment=envDay;thumbnailScene.environmentIntensity=.65
      thumbnailCamera.matrixAutoUpdate=false;thumbnailCamera.matrix.fromArray(frame.camera.matrix);thumbnailCamera.matrixWorldNeedsUpdate=true
      Object.assign(thumbnailCamera,{left:frame.camera.left,right:frame.camera.right,top:frame.camera.top,bottom:frame.camera.bottom,near:frame.camera.near,far:frame.camera.far,zoom:frame.camera.zoom})
      thumbnailCamera.updateProjectionMatrix();thumbnailCamera.updateMatrixWorld(true)
      const previous=renderer.getRenderTarget(),exposure=renderer.toneMappingExposure,clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha()
      try {
        renderer.toneMappingExposure=1.1;renderer.setClearColor(0,0);renderer.setRenderTarget(thumbnailTarget)
        renderer.render(thumbnailScene,thumbnailCamera)
      } finally {
        if(renderer instanceof GPU.WebGPURenderer)renderer.setRenderTarget(previous)
        else renderer.setRenderTarget(previous as THREE.WebGLRenderTarget|null)
        renderer.toneMappingExposure=exposure;renderer.setClearColor(clear,alpha)
        for(const o of registry.values())o.removeFromParent()
      }
      const data=renderer instanceof GPU.WebGPURenderer
        ? await renderer.readRenderTargetPixelsAsync(thumbnailTarget,0,0,120,120)
        : await renderer.readRenderTargetPixelsAsync(thumbnailTarget,0,0,120,120,new Uint8Array(120*120*4))
      const pixels=new Uint8ClampedArray(120*120*4),raw=new Uint8Array(data.buffer,data.byteOffset,data.byteLength)
      for(let y=0;y<120;y++)pixels.set(raw.subarray((gpu?y:119-y)*480,(gpu?y+1:120-y)*480),y*480)
      const output=document.createElement('canvas');output.width=output.height=120
      output.getContext('2d')!.putImageData(new ImageData(pixels,120,120),0,0)
      return output.toDataURL()
    },
    statistics: () => ({ backend: options.backend, revision: THREE.REVISION, objects: objects.size+instanceCount, drawObjects:objects.size+batches.size, batches:batches.size, geometries: geometries.size,
      materials: materials.size, textures: textures.size + owned.length + environmentTargets.length, width, height, timing:{...timing},memory:{...renderer.info.memory},
      camera: { type: camera.type, fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : null } }),
    dispose() {
      if (disposed) return; disposed = true
      for (const m of materials.values()) m.dispose()
      for (const g of geometries.values()) g.dispose()
      for (const t of textures.values()) t.dispose()
      for (const t of owned) {t.dispose();if(t.image instanceof ImageBitmap)t.image.close()}
      for (const t of environmentTargets) t.dispose()
      for (const p of particles.values()) p.dispose(); particles.clear()
      for(const b of batches.values())b.mesh.dispose();batches.clear()
      for (const p of pipelines.values()) p.dispose(); pipelines.clear()
      for (const effect of effects) effect.dispose()
      probeTarget?.dispose();thumbnailTarget.dispose();thumbnailScene.clear()
      materials.clear(); preparedMaterials.clear();geometries.clear(); textures.clear(); objects.clear(); goalUniforms.clear(); scene.clear(); renderer.dispose()
    },
  }
}
