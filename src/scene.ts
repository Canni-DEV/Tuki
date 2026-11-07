import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { surfaceRect } from './levels'
import { shapes } from './shapes'
import { pieceAsset, tipos } from './types'
import type { Nivel, PiezaColocada, TipoColocable, Vec3 } from './types'

type Poses = Map<string, { p: Vec3, q: [number, number, number, number] }>
type Surface = ReturnType<typeof surfaceRect> & Nivel['superficies'][number]
const models = new Map<string, Promise<THREE.Group>>()
const thumbnails = new Map<TipoColocable, string>()
const gltf = new GLTFLoader()
const deg = THREE.MathUtils.degToRad

function loadModel(asset: string) {
  let model = models.get(asset)
  if (!model) {
    model = gltf.loadAsync(`${import.meta.env.BASE_URL}models/${asset}.glb`)
      .then(({ scene }) => scene)
      .catch(() => {
        models.delete(asset)
        throw new Error(`No se pudo cargar el modelo «${asset}».`)
      })
    models.set(asset, model)
  }
  return model
}

function instance(source: THREE.Group, id: string) {
  const root = source.clone(true)
  const variant = Array.from(id).reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0) % 3
  root.traverse(node => {
    if (node.name === 'pipset_1') node.visible = variant >= 1
    if (node.name === 'pipset_2') node.visible = variant === 2
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
      node.userData.piece = id
    }
  })
  return root
}

function ring(radius: number, thickness: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - thickness, radius + thickness, 56), material)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

function planarShape(xz: number[], material: THREE.Material) {
  const shape = new THREE.Shape()
  for (let i = 0; i < xz.length; i += 2) {
    if (i === 0) shape.moveTo(xz[i], -xz[i + 1])
    else shape.lineTo(xz[i], -xz[i + 1])
  }
  shape.closePath()
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

function arrow(material: THREE.Material) {
  return planarShape([-.0012, 0, .0012, 0, .0012, .009, .0042, .009, 0, .016, -.0042, .009, -.0012, .009], material)
}

function flat(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, side: THREE.DoubleSide, depthWrite: opacity === 1 })
}

const footprint: Record<TipoColocable, [number, number]> = {
  domino: [.025, .008], bolita: [.016, .016], rampa: [.032, .095], embudo: [.054, .054],
}

function localXZ(point: THREE.Vector3, surface: Surface) {
  const x = point.x - surface.x, z = point.z - surface.z
  const cos = Math.cos(surface.ang), sin = Math.sin(surface.ang)
  return [x * cos - z * sin, x * sin + z * cos]
}

function disposeGeometry(root: THREE.Object3D) {
  root.traverse(node => {
    if (node instanceof THREE.Mesh && node.userData.generated) node.geometry.dispose()
  })
}

function generated<T extends THREE.Object3D>(root: T): T {
  root.traverse(node => { if (node instanceof THREE.Mesh) node.userData.generated = true })
  return root
}

export class Mesa {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 8)
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0))
  private target = new THREE.Vector3()
  private eye = new THREE.Vector3()
  private azimuth = 0
  private elevation = 0
  private viewHeight = 0
  private topView = false
  private opening = true
  private width = 0
  private height = 0
  private orbit: { pointer: number, x: number, y: number } | null = null
  private observer: ResizeObserver
  private events = new AbortController()
  private environment: THREE.WebGLRenderTarget
  private sun: THREE.DirectionalLight
  private colliderOverlay?: typeof import('./scene-debug').mostrarColisionadores
  private readonly loaded = new Map<string, THREE.Group>()
  private readonly fixed = new Map<string, THREE.Group>()
  private readonly placed = new Map<string, THREE.Group>()
  private readonly surfaces: Surface[]
  private readonly fixedOccluders: THREE.Mesh[] = []
  private readonly pickables = new Map<string, THREE.Mesh[]>()
  private selection = new THREE.Group()
  private previews = new THREE.Group()
  private previewTemplates = new Map<string, THREE.Group>()
  private coverMaterials = new Set<THREE.Material>()
  private previewKey = ''
  private selectionKey = ''
  private selectedId: string | null = null
  private selectedRadius = 0
  private selectedBase = 0
  private materials = {
    ink: flat(0x204d49), cream: flat(0xfff6d8), orange: flat(0xf68b36),
    valid: flat(0x266b60), fill: flat(0x90cba1, .31), invalid: flat(0xac4027),
    ghost: new THREE.MeshStandardMaterial({ color: 0xc6dfbb, transparent: true, opacity: .52, roughness: .86, depthWrite: false }),
    badGhost: new THREE.MeshStandardMaterial({ color: 0xf5b585, transparent: true, opacity: .48, roughness: .86, depthWrite: false }),
    pole: new THREE.MeshStandardMaterial({ color: 0x704629, roughness: .77 }),
    flag: new THREE.MeshStandardMaterial({ color: 0xfb8734, roughness: .79, side: THREE.DoubleSide }),
    joinery: new THREE.MeshStandardMaterial({ color: 0x9c7049, roughness: .9 }),
  }
  private retired = false
  private dirty = true

  constructor(private canvas: HTMLCanvasElement, private nivel: Nivel) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('Para jugar Tuki necesitás WebGL 2 con aceleración gráfica.')
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.09
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    const studio = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(this.renderer)
    this.environment = generator.fromScene(studio, .04)
    studio.dispose()
    generator.dispose()
    this.scene.environment = this.environment.texture
    this.scene.environmentIntensity = .34
    this.scene.background = new THREE.Color(0xe8d4ad)
    this.scene.add(new THREE.HemisphereLight(0xfff2d4, 0x9b7860, 1.16))
    this.sun = new THREE.DirectionalLight(0xffe6be, 2.6)
    this.sun.position.set(-.29, .49, -.20)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -.40, right: .40, top: .35, bottom: -.35, near: .02, far: 1.4 })
    this.sun.shadow.camera.updateProjectionMatrix()
    this.sun.shadow.normalBias = .00018
    this.sun.shadow.bias = -.00013
    this.sun.shadow.radius = 2.2
    this.scene.add(this.sun, this.sun.target)
    const fill = new THREE.DirectionalLight(0xc4ded6, .56)
    fill.position.set(.32, .20, .38)
    this.scene.add(fill)
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0xe2c9a2, roughness: 1 }))
    backdrop.rotation.x = -Math.PI / 2
    backdrop.position.y = -.115
    backdrop.receiveShadow = true
    backdrop.userData.backdrop = true
    this.scene.add(generated(backdrop), this.selection, this.previews)
    this.surfaces = nivel.superficies.map(surface => ({ ...surface, ...surfaceRect(nivel, surface.id) }))
    this.encuadrar()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    const options = { signal: this.events.signal }
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options)
    canvas.addEventListener('pointerdown', this.pointerDown, options)
    canvas.addEventListener('pointermove', this.pointerMove, options)
    canvas.addEventListener('pointerup', this.pointerUp, options)
    canvas.addEventListener('lostpointercapture', this.pointerUp, options)
    canvas.addEventListener('pointercancel', this.pointerUp, options)
    canvas.addEventListener('wheel', this.wheel, { ...options, passive: false })
  }

  async cargar() {
    const assets = new Set(this.nivel.fijos.map(item => item.activo))
    for (const tipo of tipos) if (this.nivel.inventario[tipo]) assets.add(pieceAsset(tipo))
    await Promise.all([...assets].map(async asset => { this.loaded.set(asset, await loadModel(asset)) }))
    if (this.retired) return
    for (const item of this.nivel.fijos) {
      const root = instance(this.loaded.get(item.activo)!, item.id)
      root.position.fromArray(item.posicion)
      root.rotation.y = deg(item.giroY)
      if (item.escala) root.scale.fromArray(item.escala)
      if (item.activo === 'book' && item.id !== 'libro-alto') this.tintCover(root, item.id)
      const meshes = this.collectMeshes(root)
      this.fixedOccluders.push(...meshes)
      if (item.rol !== 'escenario') this.pickables.set(item.id, meshes)
      if (item.activo === 'table') root.add(this.tableFrame())
      if (item.rol === 'inicio') {
        const direction = arrow(this.materials.ink)
        direction.scale.setScalar(1.28)
        direction.position.set(0, .054, -.006)
        root.add(generated(direction))
      }
      if (item.rol === 'meta') root.add(this.flag())
      this.scene.add(root)
      this.fixed.set(item.id, root)
    }
    if (new URLSearchParams(location.search).has('colisionadores')) {
      this.colliderOverlay = (await import('./scene-debug')).mostrarColisionadores
      if (this.retired) return
      for (const item of this.nivel.fijos) this.fixed.get(item.id)!.add(this.colliderOverlay(item.activo))
    }
    this.scene.updateMatrixWorld(true)
    this.makeThumbnails()
    this.dirty = true
    this.render()
  }

  private collectMeshes(root: THREE.Object3D) {
    const meshes: THREE.Mesh[] = []
    root.traverseVisible(node => { if (node instanceof THREE.Mesh) meshes.push(node) })
    return meshes
  }

  private tintCover(root: THREE.Object3D, id: string) {
    const colors: Record<string, number> = {
      'escalon-medio': 0x849783, 'escalon-bajo': 0x9a8061, 'base-del-libro': 0x6e7461,
    }
    const color = colors[id]
    if (!color) return
    const clones = new Map<THREE.Material, THREE.Material>()
    const tint = (material: THREE.Material) => {
      if (!material.name.startsWith('Tela encerada') || !(material instanceof THREE.MeshStandardMaterial)) return material
      let clone = clones.get(material)
      if (!clone) {
        const cover = material.clone()
        cover.color.setHex(color)
        this.coverMaterials.add(cover)
        clones.set(material, cover)
        clone = cover
      }
      return clone
    }
    root.traverse(node => {
      if (node instanceof THREE.Mesh) node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material)
    })
  }

  private flag() {
    const group = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.00065, .0007, .021, 7), this.materials.pole)
    pole.position.set(.008, .059, .0002)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      .008, .069, 0, .0077, .060, 0, .016, .064, .004, .021, .064, .008,
    ], 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    geometry.computeVertexNormals()
    const cloth = new THREE.Mesh(geometry, this.materials.flag)
    group.add(pole, cloth)
    return generated(group)
  }

  private tableFrame() {
    const frame = new THREE.Group()
    const [width, thickness, depth] = shapes('table')[0].size
    const beam = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materials.joinery)
      mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true
      frame.add(mesh)
    }
    const insetX = width/2-.025, insetZ = depth/2-.025
    for (const x of [-insetX,insetX]) for (const z of [-insetZ,insetZ]) {
      beam(x,-thickness-.067,z,.014,.134,.014)
    }
    for (const z of [-insetZ,insetZ]) beam(0,-thickness-.007,z,2*insetX,.014,.007)
    for (const x of [-insetX,insetX]) beam(x,-thickness-.007,0,.007,.014,2*insetZ)
    return generated(frame)
  }

  private makeThumbnails() {
    const missing = tipos.filter(tipo => !thumbnails.has(tipo) && this.loaded.has(pieceAsset(tipo)))
    if (!missing.length) return
    const thumb = new THREE.Scene()
    thumb.environment = this.environment.texture
    thumb.environmentIntensity = .47
    thumb.add(new THREE.HemisphereLight(0xfff5df, 0xc1ad8b, 1.5))
    const light = new THREE.DirectionalLight(0xffebce, 2.5)
    light.position.set(-.4, .5, .7)
    thumb.add(light)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 2)
    const copy = document.createElement('canvas')
    copy.width = copy.height = 120
    const copyContext = copy.getContext('2d')
    if (!copyContext) return
    const previousColor = this.renderer.getClearColor(new THREE.Color())
    const previousAlpha = this.renderer.getClearAlpha()
    this.renderer.setSize(120, 120, false)
    this.renderer.setClearColor(0, 0)
    for (const tipo of missing) {
      const root = instance(this.loaded.get(pieceAsset(tipo))!, 'thumbnail')
      thumb.add(root)
      const bounds = new THREE.Box3().setFromObject(root)
      const center = bounds.getCenter(new THREE.Vector3())
      const size = bounds.getSize(new THREE.Vector3())
      const half = Math.max(size.x, size.y, size.z) * .62
      Object.assign(camera, { left: -half, right: half, top: half, bottom: -half })
      camera.position.copy(center).add(new THREE.Vector3(.24, .17, .38))
      camera.lookAt(center)
      camera.updateProjectionMatrix()
      this.renderer.render(thumb, camera)
      copyContext.clearRect(0, 0, 120, 120)
      copyContext.drawImage(this.canvas, 0, 0, 120, 120)
      thumbnails.set(tipo, copy.toDataURL())
      thumb.remove(root)
    }
    this.renderer.setClearColor(previousColor, previousAlpha)
    this.width = this.height = 0
    this.resize()
  }

  miniatura(tipo: TipoColocable) { return thumbnails.get(tipo) }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 2) return
    event.preventDefault()
    this.orbit = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private pointerMove = (event: PointerEvent) => {
    if (this.orbit?.pointer !== event.pointerId) return
    const deltaX = event.clientX - this.orbit.x, deltaY = event.clientY - this.orbit.y
    if (deltaX === 0 && deltaY === 0) return
    this.azimuth -= deltaX * .006
    this.elevation = THREE.MathUtils.clamp(this.elevation + deltaY * .006, deg(12), deg(85))
    this.topView = false
    this.opening = false
    this.orbit.x = event.clientX; this.orbit.y = event.clientY
    this.updateCamera()
  }

  private pointerUp = (event: PointerEvent) => {
    if (this.orbit?.pointer !== event.pointerId) return
    this.orbit = null
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
  }

  private wheel = (event: WheelEvent) => {
    event.preventDefault()
    this.opening = false
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1)
    const initialHeight = this.nivel.camara.altoVisible
    this.viewHeight = THREE.MathUtils.clamp(this.viewHeight * Math.exp(Math.sign(pixels) * Math.min(Math.abs(pixels), 160) * .0018), initialHeight * .30, initialHeight * 2)
    this.updateCamera()
  }

  encuadrar() {
    const view = this.nivel.camara
    this.target.fromArray(view.objetivo)
    this.azimuth = deg(view.azimut)
    this.elevation = deg(view.elevacion)
    this.viewHeight = view.altoVisible
    this.topView = false
    this.opening = true
    this.resize()
    this.fitEndpoints()
    this.updateCamera()
  }

  superior() {
    this.azimuth = 0
    this.elevation = Math.PI / 2
    this.topView = true
    this.opening = false
    this.updateCamera()
  }

  private resize() {
    if (this.retired) return
    const box = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height))
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    if (this.opening) this.fitEndpoints()
    this.updateCamera()
  }

  private fitEndpoints() {
    this.viewHeight = this.nivel.camara.altoVisible
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth))
    const up = new THREE.Vector3(-Math.sin(this.elevation)*Math.sin(this.azimuth), Math.cos(this.elevation), -Math.sin(this.elevation)*Math.cos(this.azimuth))
    for (const item of this.nivel.fijos.filter(p=>p.rol==='inicio'||p.rol==='meta')) {
      for (const dy of [0, .074]) {
        const point = new THREE.Vector3(...item.posicion).sub(this.target)
        point.y += dy
        this.viewHeight = Math.max(this.viewHeight,
          (Math.abs(point.dot(up))+.006)*2,
          (Math.abs(point.dot(right))+.016)*2*this.height/this.width)
      }
    }
  }

  private updateCamera() {
    this.dirty = true
    const halfHeight = this.viewHeight / 2
    const halfWidth = halfHeight * this.width / Math.max(this.height, 1)
    Object.assign(this.camera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight })
    const horizontal = Math.cos(this.elevation)
    this.eye.set(Math.sin(this.azimuth) * horizontal, Math.sin(this.elevation), Math.cos(this.azimuth) * horizontal)
    this.camera.position.copy(this.target).addScaledVector(this.eye, 1.35)
    this.camera.up.set(0, this.topView ? 0 : 1, this.topView ? -1 : 0)
    this.camera.lookAt(this.target)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
  }

  private pointerRay(clientX: number, clientY: number) {
    const box = this.canvas.getBoundingClientRect()
    const x = ((clientX - box.left) / box.width) * 2 - 1
    const y = 1 - ((clientY - box.top) / box.height) * 2
    this.ray.setFromCamera(new THREE.Vector2(x, y), this.camera)
  }

  superficiePunto(clientX: number, clientY: number, y: number): Vec3 | null {
    this.pointerRay(clientX, clientY)
    this.plane.constant = -y
    const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3())
    return point ? [point.x, point.y, point.z] : null
  }

  proyectar(pos: Vec3) {
    const point = new THREE.Vector3(...pos).project(this.camera)
    const box = this.canvas.getBoundingClientRect()
    return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 }
  }

  apuntar(clientX: number, clientY: number, tipo: TipoColocable): { apoyo: string, posicion: Vec3 } | null {
    this.pointerRay(clientX, clientY)
    const hit = this.ray.intersectObjects(this.fixedOccluders, false)[0]
    let best: { distance: number, apoyo: string, posicion: Vec3 } | undefined
    for (const surface of this.surfaces) {
      if (!surface.admite.includes(tipo)) continue
      this.plane.constant = -surface.y
      const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3())
      if (!point) continue
      const [x, z] = localXZ(point, surface)
      const cradle = this.nivel.fijos.some(item => item.id === surface.objeto && item.activo === 'cradle')
      const hitCradle = cradle && hit?.object.userData.piece === surface.objeto
      if (!hitCradle && (Math.abs(x) > surface.w / 2 || Math.abs(z) > surface.d / 2)) continue
      const distance = point.distanceTo(this.ray.ray.origin)
      if (hit && hit.object.userData.piece !== surface.objeto && hit.distance < distance - .0006) continue
      if (best && best.distance <= distance) continue
      const centerHeight = surface.y + (tipo === 'bolita' && !cradle ? .008 : 0)
      const posicion: Vec3 = cradle ? [surface.x, centerHeight, surface.z] : [point.x, centerHeight, point.z]
      best = { distance, apoyo: surface.id, posicion }
    }
    return best ? { apoyo: best.apoyo, posicion: best.posicion } : null
  }

  seleccionar(clientX: number, clientY: number): { id: string, aro: boolean } | null {
    this.pointerRay(clientX, clientY)
    const targets = [...this.pickables.values()].flat()
    const hit = this.ray.intersectObjects(targets, false)[0]
    const occluder = this.ray.intersectObjects(this.fixedOccluders, false)[0]
    if (this.selectedId && this.selectedRadius) {
      this.plane.constant = -this.selectedBase
      const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3())
      if (point) {
        const radius = Math.hypot(point.x - this.selection.position.x, point.z - this.selection.position.z)
        const tolerance = Math.max(.002, this.viewHeight / Math.max(1, this.height) * 5)
        const nearRing = Math.abs(radius - this.selectedRadius) <= tolerance
        if (nearRing && (!occluder || occluder.distance + .001 >= point.distanceTo(this.ray.ray.origin))) return { id: this.selectedId, aro: true }
      }
    }
    if (hit && (!occluder || occluder.distance + .0002 >= hit.distance)) return { id: hit.object.userData.piece, aro: false }
    return null
  }

  dibujar(piezas: PiezaColocada[], seleccion: string | null, previas: PiezaColocada[], error: string | null, poses?: Poses) {
    if (this.retired || !this.fixed.size) return
    this.dirty = true
    const ids = new Set(piezas.map(piece => piece.id))
    for (const [id, mesh] of this.placed) {
      if (ids.has(id)) continue
      mesh.traverse(node => node.userData.disposeOverlay?.())
      this.scene.remove(mesh); this.placed.delete(id); this.pickables.delete(id)
    }
    const previews = new Set(previas.map(piece => piece.id))
    for (const piece of piezas) {
      let root = this.placed.get(piece.id)
      if (!root) {
        root = instance(this.loaded.get(pieceAsset(piece.tipo))!, piece.id)
        this.scene.add(root); this.placed.set(piece.id, root)
        this.pickables.set(piece.id, this.collectMeshes(root))
        if (this.colliderOverlay) root.add(this.colliderOverlay(pieceAsset(piece.tipo)))
      }
      root.visible = !previews.has(piece.id)
      this.setPose(root, piece, poses?.get(piece.id))
    }
    for (const item of this.nivel.fijos) {
      const root = this.fixed.get(item.id)
      if (root) this.setPose(root, item, poses?.get(item.id))
    }
    const selection = !poses && seleccion ? piezas.find(p => p.id === seleccion) : undefined
    const fixed = !poses && seleccion && !selection ? this.nivel.fijos.find(p => p.id === seleccion) : undefined
    this.showSelection(selection, fixed)
    this.showPreviews(poses ? [] : previas, error)
    this.scene.updateMatrixWorld(true)
  }

  private setPose(root: THREE.Object3D, rest: { posicion: Vec3, giroY: number }, simulated?: { p: Vec3, q: [number, number, number, number] }) {
    if (simulated) {
      root.position.fromArray(simulated.p)
      root.quaternion.fromArray(simulated.q)
    } else {
      root.position.fromArray(rest.posicion)
      root.rotation.set(0, deg(rest.giroY), 0)
    }
  }

  private showSelection(piece?: PiezaColocada, fixed?: Nivel['fijos'][number]) {
    const item = piece ?? fixed
    this.selection.visible = Boolean(item)
    this.selectedId = piece?.id ?? null
    this.selectedRadius = 0
    if (!item) return
    const type = piece?.tipo ?? 'domino'
    const [width, depth] = footprint[type]
    const radius = Math.max(.019, Math.hypot(width, depth) / 2 + .005)
    const key = type + ':' + Boolean(fixed)
    if (this.selectionKey !== key) {
      disposeGeometry(this.selection); this.selection.clear()
      this.selection.add(ring(radius, .00070, this.materials.ink))
      if (piece) {
        this.selection.add(ring(radius + .0011, .00038, this.materials.cream))
        for (const side of [-1, 1]) {
          const knob = planarShape([-.0024, 0, 0, -.0024, .0024, 0, 0, .0024], this.materials.cream)
          knob.position.x = side * radius; knob.position.y = .00014
          this.selection.add(knob)
        }
        const direction = arrow(this.materials.ink)
        direction.position.z = radius + .001
        this.selection.add(direction)
      }
      generated(this.selection)
      this.selectionKey = key
    }
    this.selection.position.fromArray(item.posicion)
    this.selection.position.y += .00045 - (type === 'bolita' ? .008 : 0)
    this.selection.rotation.y = deg(item.giroY)
    this.selectedBase = this.selection.position.y
    this.selectedRadius = piece ? radius : 0
  }

  private showPreviews(pieces: PiezaColocada[], invalid: string | null) {
    const key = pieces.map(p => [p.tipo, ...p.posicion, p.giroY].join(',')).join('|') + (invalid ?? '')
    if (this.previewKey === key) return
    this.previewKey = key
    while (this.previews.children.length > pieces.length) this.previews.remove(this.previews.children.at(-1)!)
    for (const [index, piece] of pieces.entries()) {
      const row = /^preview-\d+$/.test(piece.id)
      const rejected = Boolean(invalid && !row && invalid !== 'Límite de fichas')
      const limit = index === pieces.length - 1 && invalid === 'Límite de fichas'
      const templateKey = [piece.tipo, rejected, limit].join(',')
      let group = this.previews.children[index]
      if (group?.userData.template !== templateKey) {
        let template = this.previewTemplates.get(templateKey)
        if (!template) {
          template = this.previewTemplate(piece.tipo, rejected, limit)
          this.previewTemplates.set(templateKey, template)
        }
        if (group) this.previews.remove(group)
        group = template.clone(true)
        group.userData.template = templateKey
        // Replacing a slot must keep its row index stable for the next pointer sample.
        this.previews.add(group)
        this.previews.children.splice(this.previews.children.indexOf(group), 1)
        this.previews.children.splice(index, 0, group)
      }
      group.position.fromArray(piece.posicion)
      group.rotation.y = deg(piece.giroY)
    }
  }

  private previewTemplate(tipo: TipoColocable, invalid: boolean, limit: boolean) {
    const group = new THREE.Group()
    const ghost = instance(this.loaded.get(pieceAsset(tipo))!, 'preview')
    ghost.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.material = invalid ? this.materials.badGhost : this.materials.ghost
        node.castShadow = false
      }
    })
    group.add(ghost)
    const ground = new THREE.Group()
    const material = invalid ? this.materials.invalid : this.materials.valid
    const stripe = (x1: number, z1: number, x2: number, z2: number, t: number) => {
      const length = Math.hypot(x2 - x1, z2 - z1)
      const dx = -(z2 - z1) / length * t, dz = (x2 - x1) / length * t
      const stroke = planarShape([x1+dx,z1+dz,x2+dx,z2+dz,x2-dx,z2-dz,x1-dx,z1-dz], material)
      stroke.position.y = .00012
      ground.add(stroke)
    }
    const pad = (cx: number, cz: number, w: number, d: number) => {
      const x1 = cx - w/2 - .001, x2 = cx + w/2 + .001
      const z1 = cz - d/2 - .001, z2 = cz + d/2 + .001
      ground.add(planarShape([x1,z1,x2,z1,x2,z2,x1,z2], this.materials.fill))
      stripe(x1,z1,x2,z1,.0005); stripe(x2,z1,x2,z2,.0005)
      stripe(x2,z2,x1,z2,.0005); stripe(x1,z2,x1,z1,.0005)
      if (invalid) {
        stripe(x1,z1,x2,z2,.0007); stripe(x1,z2,x2,z1,.0007)
        for (let x = x1+.003; x < x2-.001; x += .004) {
          const dx = Math.min(.003, x2-x)
          stripe(x,z1,x+dx,z1+Math.min(dx, d),.0003)
        }
      }
    }
    const [width, depth] = footprint[tipo]
    if (tipo === 'embudo') {
      for (const foot of shapes('funnel').filter(s => s.kind === 'box')) pad(foot.at[0], foot.at[2], foot.size[0], foot.size[2])
    } else pad(0, 0, width, depth)
    const front = depth / 2 + .002
    if (limit) stripe(-width/2, front + .004, width/2, front + .004, .0012)
    else if (!invalid) {
      const direction = arrow(material)
      direction.position.z = front
      ground.add(direction)
    }
    ground.position.y = .00045 - (tipo === 'bolita' ? .008 : 0)
    group.add(generated(ground))
    return group
  }

  render() {
    if (this.retired || !this.dirty) return
    this.renderer.render(this.scene, this.camera)
    this.dirty = false
  }

  dispose() {
    this.retired = true
    this.events.abort()
    this.observer.disconnect()
    this.previews.clear()
    this.previewTemplates.forEach(disposeGeometry)
    disposeGeometry(this.scene)
    this.scene.traverse(node => {
      node.userData.disposeOverlay?.()
      if (node instanceof THREE.Mesh && node.userData.backdrop) node.material.dispose()
    })
    Object.values(this.materials).forEach(material => material.dispose())
    this.coverMaterials.forEach(material => material.dispose())
    this.sun.shadow.dispose()
    this.environment.dispose()
    this.scene.clear()
    this.renderer.dispose()
  }
}
