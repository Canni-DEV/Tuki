import * as THREE from 'three'
import { loadModel, instance, tableFrame } from './modelos'
import type { Espacio } from './espacio'
import { surfaceRect, conApoyos, objetosDeNivel } from './levels'
import { borne, obstaculoCable, radioCable, SuperficiesCable, type Tendido } from './cables'
import { initPhysics } from './simulation'
import { contactosDePieza, admiteVoladizo } from './contactos'
import { shapes, assemblies, partRotation, bases, escenario } from './shapes'
import { validarPieza } from './editor'
import { crearSello } from './sellos'
import { pieceAsset, tipos, esMando, esReceptor, type Conexion } from './types'
import type { Nivel, PiezaColocada, TipoColocable, Vec3 } from './types'

type Poses = Map<string, { p: Vec3, q: [number, number, number, number] }>
type Surface = ReturnType<typeof surfaceRect> & Nivel['superficies'][number]
const thumbnails = new Map<TipoColocable, string>()
const deg = THREE.MathUtils.degToRad
const vertical = new THREE.Vector3(0, 1, 0)

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

const huellas: Partial<Record<TipoColocable, [number, number]>> = {
  taco: [.024, .026], boton: [.031, .031], palanca: [.022, .023], compuerta: [.085, .060], puerta: [.06, .023],
  cunaClasica: [.021, .021], puenteClasico: [.04, .025],
  inicio: [.025, .008], meta: [.025, .008],
  cuna: [.021, .021], canal: [.026, .09], llave: [.10, .14], curva90: [.075, .075],
  pendulo: [.052, .028], balancin: [.038, .024], puente: [.04, .025],
  domino: [.025, .008], bolita: [.016, .016], rampa: [.032, .095], embudo: [.054, .054],
}

function footprint(tipo: TipoColocable) {
  return escenario[pieceAsset(tipo)]?.tamanoEnPlanta ?? huellas[tipo]!
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
  private readonly objetos: Nivel['fijos']
  readonly grupo = new THREE.Group()
  private get camera() { return this.espacio.camera }
  private get renderer() { return this.espacio.renderer }
  private get canvas() { return this.espacio.canvas }
  private get height() { return this.espacio.height }
  private get viewHeight() { return this.espacio.vista.alto }
  private readonly conflicto = new THREE.BoxHelper(new THREE.Object3D(), 0xb34832)
  private circuitos = new THREE.Group()
  private terminales = new THREE.Group()
  private objetosCable = new Map<string,PiezaColocada>()
  private piezasCable?: PiezaColocada[]
  private conexionesCable?: Conexion[]
  private previewCable = ''
  private superficiesCable?: SuperficiesCable
  private rutas: { conexion: Conexion; reposo: Tendido; limites: THREE.Box3; grupo: THREE.Group }[] = []
  mostrarCables(visible: boolean) { this.circuitos.visible = visible; this.espacio.invalidar() }
  recorridosCable() { return this.rutas.map(r => r.reposo.map(t => t.map(p => p.toArray()))) }
  private hilo = new THREE.MeshStandardMaterial({ color: 0x3c5055, roughness: .82 })
  private borne = new THREE.MeshStandardMaterial({ color: 0xd29b49, metalness: .48, roughness: .34 })
  motivoPuntero = 'Volvé a la mesa'
  private readonly limitesModelo = new Map<string, THREE.Box3>()
  private ray = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0))
  private colliderOverlay?: typeof import('./scene-debug').mostrarColisionadores
  private readonly loaded = new Map<string, THREE.Group>()
  private readonly fixed = new Map<string, THREE.Group>()
  private readonly sellos = new Map<Nivel['fijos'][number], THREE.Sprite>()
  private readonly placed = new Map<string, THREE.Group>()
  private marcaCompuerta?: THREE.Sprite
  marcarCompuerta(id?: string, texto?: string) {
    if (this.marcaCompuerta) {
      this.marcaCompuerta.removeFromParent()
      this.marcaCompuerta.material.map?.dispose()
      this.marcaCompuerta.material.dispose()
      this.marcaCompuerta = undefined
    }
    if (id && texto) {
      const mecanismo = this.fixed.get(id)
      if (mecanismo) {
        const sello = crearSello('mando', texto)
        sello.position.set(-.040, .039, .01)
        sello.scale.setScalar(.029)
        mecanismo.add(sello)
        this.marcaCompuerta = sello
      }
    }
    this.espacio.invalidar()
  }
  private cantoMeta?: THREE.MeshStandardMaterial
  private readonly recorridoLuz = { value: -1 }
  private inicioReflejo?: number
  private surfaces: Surface[]
  private lastPieces?: PiezaColocada[]
  private readonly fixedOccluders: THREE.Mesh[] = []
  private readonly pickables = new Map<string, THREE.Mesh[]>()
  private selection = new THREE.Group()
  private contactos = new THREE.Group()
  private materialContacto = new THREE.MeshBasicMaterial({color:0x41aa81, transparent:true, opacity:.25, depthTest:false, depthWrite:false, side:THREE.DoubleSide})
  private bordeContacto = new THREE.LineBasicMaterial({color:0x197156, depthTest:false, transparent:true, opacity:.9})
  private marcaContacto = ''
  private avisoInestable?: ReturnType<typeof setTimeout>
  private piezasContacto?: PiezaColocada[]
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
  }
  private retired = false

  constructor(private espacio: Espacio, readonly nivel: Nivel) {
    this.objetos = objetosDeNivel(nivel)
    this.surfaces = nivel.superficies.map(s => ({ ...s, ...surfaceRect(nivel, s.id) }))
    this.conflicto.visible = false
    this.circuitos.add(this.terminales)
    this.grupo.add(this.conflicto, this.selection, this.previews, this.contactos, this.circuitos)
  }

  async preparar(piezas: PiezaColocada[], edicion: boolean) {
    const assets = new Set(this.objetos.map(item => item.activo))
    for (const p of piezas) assets.add(pieceAsset(p.tipo))
    if (edicion) for (const tipo of tipos) {
      if (this.nivel.id === 'taller' || this.nivel.inventario[tipo]) assets.add(pieceAsset(tipo))
    }
    const modelos = [...assets].map(async asset => this.loaded.set(asset, await loadModel(asset)))
    // The fixed routes use Rapier shape queries even in the level selection preview.
    await Promise.all([...modelos, this.nivel.instalacion && initPhysics()])
    if (this.retired) return
    if (!this.fixed.size) await this.montar()
    if (edicion && !this.retired) this.makeThumbnails()
  }

  private async montar() {
    if (this.nivel.instalacion) this.dibujarCables([], [], [])
    for (const item of this.objetos) {
      let root = instance(this.loaded.get(item.activo)!, item.id)
      if (item.activo === 'book' && (item.escala?.[1] ?? 1) > 3) {
        const count = Math.round(item.escala![1]), pile = new THREE.Group()
        for (let i = 0; i < count; i++) {
          const book = i === 0 ? root : instance(this.loaded.get('book')!, item.id)
          book.position.y = i * .018 / count
          book.scale.y = 1 / count
          pile.add(book)
        }
        root = pile
      }
      root.position.fromArray(item.posicion)
      root.rotation.y = deg(item.giroY)
      if (item.escala) root.scale.fromArray(item.escala)
      if (item.activo === 'book' && item.id !== 'libro-alto') this.tintCover(root, item.id)
      const meshes = this.collectMeshes(root)
      this.fixedOccluders.push(...meshes)
      if (item.rol === 'inicio' || item.rol === 'meta') this.pickables.set(item.id, meshes)
      if (item.activo === 'table') root.add(tableFrame())
      if (item.rol === 'inicio' || item.rol === 'meta') {
        const sello = crearSello(item.rol)
        this.sellos.set(item, sello)
        this.grupo.add(sello)
      }
      if (this.nivel.instalacion?.secuencias?.some(s => s.mandos.includes(item.id))) {
        const letra = crearSello('mando', item.id)
        letra.name = 'letra-mando'
        letra.position.set(0, .037, 0)
        letra.scale.setScalar(.029)
        root.add(letra)
      }
      if (item.rol === 'meta') this.prepararCanto(root)
      this.grupo.add(root)
      this.fixed.set(item.id, root)
    }
    if (new URLSearchParams(location.search).has('colisionadores')) {
      this.colliderOverlay = (await import('./scene-debug')).mostrarColisionadores
      if (this.retired) return
      for (const item of this.objetos) this.fixed.get(item.id)!.add(this.colliderOverlay(item.activo))
    }
    this.grupo.updateMatrixWorld(true)
    this.espacio.invalidar()
  }

  private prepararCanto(meta: THREE.Group) {
    meta.traverse(node => {
      if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial) ||
          node.material.name !== 'Canto mandarina') return
      if (!this.cantoMeta) {
        const canto: THREE.MeshStandardMaterial = node.material.clone()
        canto.onBeforeCompile = shader => {
          shader.uniforms.recorridoLuz = this.recorridoLuz
          shader.vertexShader = 'varying float alturaCanto;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>', '#include <begin_vertex>\nalturaCanto = position.y / 0.05;')
          shader.fragmentShader = 'uniform float recorridoLuz;\nvarying float alturaCanto;\n' + shader.fragmentShader.replace(
            '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float franja = 1.0 - smoothstep(0.0, 0.22, abs(alturaCanto - recorridoLuz));
            float luz = recorridoLuz > 1.5 ? 0.48 : franja;
            totalEmissiveRadiance += vec3(0.85, 0.48, 0.18) * luz;`)
        }
        this.cantoMeta = canto
      }
      node.material = this.cantoMeta
    })
  }

  iniciarReflejo(t: number) {
    this.inicioReflejo = t
  }

  actualizarReflejo(t: number, reducido: boolean) {
    if (this.inicioReflejo === undefined) return
    const avance = (t - this.inicioReflejo) / 500
    // Position is measured along the domino's own edge, even while the piece is falling.
    this.recorridoLuz.value = reducido ? 2 : avance < 1 ? .04 + avance * 1.2 : -1
  }

  terminarReflejo() {
    this.inicioReflejo = undefined
    this.recorridoLuz.value = -1
    this.espacio.invalidar()
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

  private makeThumbnails() {
    const missing = tipos.filter(tipo => !thumbnails.has(tipo) && this.loaded.has(pieceAsset(tipo)))
    if (!missing.length) return
    const thumb = new THREE.Scene()
    thumb.environment = this.espacio.scene.environment
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
    this.renderer.setSize(this.espacio.width, this.height, false)
    this.espacio.invalidar()
  }

  miniatura(tipo: TipoColocable) { return thumbnails.get(tipo) }

  encuadrar() { this.espacio.encuadrar() }
  superior() { this.espacio.superior() }

  actualizarSellos() {
    const pixel = this.viewHeight / this.height
    const diametro = THREE.MathUtils.clamp(.012 / pixel, 21, 30) * pixel
    const arriba = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1)
    const [ancho, alto, fondo] = shapes('domino')[0].size
    const start = this.placed.get('inicio')
    const label = start?.getObjectByName('extremo') as THREE.Sprite | undefined
    if (start && label) {
      const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(start.quaternion).transformDirection(this.camera.matrixWorldInverse)
      label.material.rotation = Math.atan2(direction.y, direction.x)
    }
    for (const [pieza, sello] of this.sellos) {
      const giro = deg(pieza.giroY)
      const [sx, sy, sz] = pieza.escala ?? [1, 1, 1]
      // Project the top face's half-extents onto screen-up, including in plan view.
      const local = arriba.clone().applyAxisAngle(vertical, -giro)
      const borde = (Math.abs(local.x) * ancho * sx + Math.abs(local.z) * fondo * sz) / 2
      sello.position.fromArray(pieza.posicion)
      sello.position.y += alto * sy
      sello.position.addScaledVector(arriba, borde + 6 * pixel + diametro / 2)
      sello.scale.setScalar(diametro)
      if (pieza.rol === 'inicio') {
        const sentido = new THREE.Vector3().fromArray(this.nivel.empujon.impulsoLocal)
        sentido.y = 0
        sentido.applyAxisAngle(vertical, giro).transformDirection(this.camera.matrixWorldInverse)
        sello.material.rotation = Math.atan2(sentido.y, sentido.x)
      }
    }
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

  paneo(pos: Vec3) {
    return .55 * Math.max(-1, Math.min(1, new THREE.Vector3(...pos).project(this.camera).x))
  }

  proyectar(pos: Vec3) {
    const point = new THREE.Vector3(...pos).project(this.camera)
    const box = this.canvas.getBoundingClientRect()
    return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 }
  }

  private cimaVisible(tipo: TipoColocable, pos: Vec3, giroY: number, solids: THREE.Mesh[]) {
    const mesh = this.loaded.get(pieceAsset(tipo))
    if (!mesh) return false
    const asset = pieceAsset(tipo)
    const box = this.limitesModelo.get(asset) ?? new THREE.Box3().setFromObject(mesh)
    this.limitesModelo.set(asset, box)
    const centro = box.getCenter(new THREE.Vector3())
    const corona = tipo === 'embudo'
      ? Array.from({ length: 12 }, (_, i) => [.98 * Math.cos(i * Math.PI / 6), .98 * Math.sin(i * Math.PI / 6)])
      : [[0, 0], [-.8, 0], [.8, 0], [0, -.8], [0, .8]]
    return corona.some(([u, v]) => {
      const top = new THREE.Vector3(centro.x + u * (box.max.x - box.min.x) / 2, box.max.y,
        centro.z + v * (box.max.z - box.min.z) / 2)
        .applyAxisAngle(vertical, deg(giroY)).add(new THREE.Vector3(...pos))
      const projected = top.clone().project(this.camera)
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return false
      this.ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), this.camera)
      const front = this.ray.intersectObjects(solids, false)[0]
      return !front || front.distance >= this.ray.ray.origin.distanceTo(top) - .0006
    })
  }

  previaVisible(p: PiezaColocada) {
    const solids = [...new Set([...this.fixedOccluders, ...Array.from(this.pickables.values()).flat()])]
      .filter(mesh => mesh.userData.piece !== p.id)
    return this.cimaVisible(p.tipo, p.posicion, p.giroY, solids)
  }

  apuntar(clientX: number, clientY: number, tipo: TipoColocable, excluir?: string, giroY = 0,
    validarMovimiento?: (pieza: PiezaColocada) => string | null): { apoyo: string, posicion: Vec3 } | null {
    this.pointerRay(clientX, clientY)
    const pointer = this.ray.ray.clone()
    this.motivoPuntero = 'Volvé a la mesa'
    const excluded = new Set<string>(excluir ? [excluir] : [])
    const piezas = this.lastPieces ?? []
    for (let n = -1; n !== excluded.size;) {
      n = excluded.size
      for (const p of piezas) if ((p.apoyos ?? [p.apoyo]).every(id => excluded.has(id.split('/')[0]))) excluded.add(p.id)
    }
    const solids = [...new Set([...this.fixedOccluders, ...Array.from(this.pickables.values()).flat()])]
      .filter(mesh => !excluded.has(mesh.userData.piece))
    const hit = this.ray.intersectObjects(solids, false)[0]
    const selected = hit?.object.userData.piece
    const candidates: { apoyo: string, posicion: Vec3, directo: boolean, distance: number }[] = []
    const [ancho, fondo] = footprint(tipo)
    for (const s of this.surfaces) {
      if (excluded.has(s.objeto) || !s.admite.includes(tipo)) continue
      this.plane.constant = -s.y
      const point = pointer.intersectPlane(this.plane, new THREE.Vector3())
      if (!point) continue
      const [x, z] = localXZ(point, s), seat = s.zona === 'asiento', direct = selected === s.objeto
      const margen = seat ? 0 : Math.hypot(ancho, fondo) / 2
      if (!(seat && direct) && (Math.abs(x) > s.w / 2 + margen || Math.abs(z) > s.d / 2 + margen)) continue
      if (s.objeto === 'mesa' && Math.abs(x) <= s.w / 2 && Math.abs(z) <= s.d / 2)
        this.motivoPuntero = 'Girá la cámara para ver la pieza'
      const y = s.y + (tipo === 'bolita' && !seat ? .008 : 0)
      const pos: Vec3 = seat ? [s.x, y, s.z] : [point.x, y, point.z]
      if (!direct && hit && hit.distance < pointer.origin.distanceTo(point) - .0006) {
        if (!this.cimaVisible(tipo, pos, giroY, solids)) continue
      }
      candidates.push({ apoyo: s.id, posicion: pos, directo: direct, distance: pointer.origin.distanceTo(point) })
    }
    this.ray.ray.copy(pointer)
    candidates.sort((a, b) => Number(b.directo) - Number(a.directo) || a.distance - b.distance)
    const others = piezas.filter(p => !excluded.has(p.id))
    const validar = validarMovimiento ?? (p => validarPieza(this.nivel, p, others))
    return candidates.find(c => !validar({ posicion: c.posicion, apoyo: c.apoyo, giroY, tipo, id: excluir ?? '@previa' })) ?? candidates[0] ?? null
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

  elegirBorne(x: number, y: number, receptor: boolean) {
    const piezas = (this.lastPieces ?? []).filter(p => receptor ? esReceptor(p.tipo) : esMando(p.tipo))
    let cerca = 17, id: string | undefined
    for (const p of piezas) {
      const punto = this.proyectar(borne(p).punto.toArray() as Vec3)
      const distancia = Math.hypot(x - punto.x, y - punto.y)
      if (distancia < cerca) { cerca = distancia; id = p.id }
    }
    return id
  }
  private tubos(grupo: THREE.Group, ruta: Tendido) {
    disposeGeometry(grupo); grupo.clear()
    for (const puntos of ruta) {
      if (puntos.length < 2) continue
      // One ring at every validated vertex so a short bend never gets cut by length resampling.
      class Polilinea extends THREE.Curve<THREE.Vector3> {
        constructor() { super() }
        getPoint(t: number, out = new THREE.Vector3()) {
          const u = t * (puntos.length - 1), i = Math.min(Math.floor(u), puntos.length - 2)
          return out.copy(puntos[i]).lerp(puntos[i + 1], u - i)
        }
        getPointAt(t: number, out?: THREE.Vector3) { return this.getPoint(t, out) }
        getTangentAt(t: number, out = new THREE.Vector3()) {
          const i = Math.round(t * (puntos.length - 1))
          return out.subVectors(puntos[Math.min(i + 1, puntos.length - 1)], puntos[Math.max(0, i - 1)]).normalize()
        }
      }
      const tubo = new THREE.Mesh(new THREE.TubeGeometry(new Polilinea(), puntos.length - 1, radioCable, 8, false), this.hilo)
      tubo.castShadow = true; tubo.receiveShadow = true
      grupo.add(generated(tubo))
    }
  }
  private dibujarCables(piezas: PiezaColocada[], cables: Conexion[], previas: PiezaColocada[]) {
    const conexiones = this.nivel.instalacion?.conexiones ?? cables
    previas = previas.filter(obstaculoCable)
    const preview = previas.length ? JSON.stringify(previas) : ''
    const conexionesCambiaron = conexiones !== this.conexionesCable
    if (piezas === this.piezasCable && !conexionesCambiaron && this.previewCable === preview) return
    this.piezasCable = piezas; this.conexionesCable = conexiones; this.previewCable = preview
    const porId = new Map([...piezas.filter(obstaculoCable), ...previas].map(p => [p.id, p]))
    const cambios = [...new Set([...this.objetosCable.keys(), ...porId.keys()])].filter(id => {
      const a = this.objetosCable.get(id), b = porId.get(id)
      return a !== b && (!a || !b || a.tipo !== b.tipo || a.giroY !== b.giroY || a.posicion.some((x, i) => x !== b.posicion[i]))
    })
    this.objetosCable = porId
    if (!cambios.length && !conexionesCambiaron) return

    disposeGeometry(this.terminales); this.terminales.clear()
    const anteriores = this.rutas, antes = this.superficiesCable
    this.rutas = []
    const actuales = Array.from(porId.values())
    for (const p of [...this.nivel.instalacion?.dispositivos ?? [], ...actuales]) {
      if (!esMando(p.tipo) && !esReceptor(p.tipo)) continue
      const m = new THREE.Mesh(new THREE.SphereGeometry(.003, 12, 8), this.borne)
      m.position.copy(borne(p).punto); this.terminales.add(generated(m))
    }
    let superficies = antes
    if (!conexiones.length) superficies = undefined
    else if (cambios.length || !superficies) superficies = new SuperficiesCable(this.nivel, actuales)
    this.superficiesCable = superficies
    if (superficies) for (const conexion of conexiones) {
      const anterior = anteriores.find(r => r.conexion.mando === conexion.mando && r.conexion.receptor === conexion.receptor)
      const afecta = !anterior || !anterior.reposo.length || cambios.some(id => {
        if (id === conexion.mando || id === conexion.receptor) return true
        return [antes?.limitesObjetos.get(id), superficies.limitesObjetos.get(id)].some(c => c && c.intersectsBox(anterior.limites))
      })
      if (anterior && !afecta) { this.rutas.push(anterior); continue }
      const reposo = superficies.trazar(conexion), grupo = new THREE.Group()
      this.rutas.push({ conexion, reposo, limites: superficies.limitesRuta(reposo), grupo })
      this.tubos(grupo, reposo); this.circuitos.add(grupo)
    }
    for (const r of anteriores) if (!this.rutas.includes(r)) {
      this.circuitos.remove(r.grupo); disposeGeometry(r.grupo)
    }
  }
  dibujar(piezas: PiezaColocada[], seleccion: string | null, previas: PiezaColocada[], error: string | null, poses?: Poses, cables: Conexion[] = []) {
    if (this.retired || !this.fixed.size) return
    this.espacio.invalidar()
    if (this.lastPieces !== piezas) {
      const support = conApoyos(this.nivel, piezas)
      this.surfaces = support.superficies.map(s => ({ ...s, ...surfaceRect(support, s.id) }))
      this.lastPieces = piezas
    }
    for (const sello of this.sellos.values()) sello.visible = !poses
    const ids = new Set(piezas.map(piece => piece.id))
    for (const [id, mesh] of this.placed) {
      if (ids.has(id)) continue
      mesh.traverse(node => node.userData.disposeOverlay?.())
      const label = mesh.getObjectByName('extremo') as THREE.Sprite | undefined
      if (label) { label.material.map?.dispose(); label.material.dispose() }
      this.grupo.remove(mesh); this.placed.delete(id); this.pickables.delete(id)
    }
    const previews = new Set(previas.map(piece => piece.id))
    for (const piece of piezas) {
      let root = this.placed.get(piece.id)
      if (!root) {
        root = instance(this.loaded.get(pieceAsset(piece.tipo))!, piece.id)
        if (piece.tipo === 'meta') this.prepararCanto(root)
        if (piece.tipo === 'inicio' || piece.tipo === 'meta') {
          const label = crearSello(piece.tipo)
          label.name = 'extremo'; label.position.y = .066; label.scale.setScalar(.020)
          root.add(label)
        }
        this.grupo.add(root); this.placed.set(piece.id, root)
        this.pickables.set(piece.id, this.collectMeshes(root))
        if (this.colliderOverlay) root.add(this.colliderOverlay(pieceAsset(piece.tipo)))
      }
      root.visible = !previews.has(piece.id)
      this.setPose(root, piece, poses?.get(piece.id))
      this.posePartes(root, pieceAsset(piece.tipo), piece.id, poses)
      const label = root.getObjectByName('extremo')
      if (label) label.visible = !poses
    }
    for (const item of this.objetos) {
      const root = this.fixed.get(item.id)
      if (root) { this.setPose(root, item, poses?.get(item.id)); this.posePartes(root, item.activo, item.id, poses) }
    }
    const selection = !poses && seleccion ? piezas.find(p => p.id === seleccion) : undefined
    const fixed = !poses && seleccion && !selection ? this.objetos.find(p => p.id === seleccion) : undefined
    if (!poses && this.nivel.id === 'taller') this.actualizarSellos()
    if (this.nivel.id === 'taller' && !poses) this.dibujarCables(piezas, cables, previas)
    this.showSelection(selection, fixed)
    this.mostrarContactos(piezas,poses ? undefined : previas[0] ?? selection,previas)
    this.showPreviews(poses ? [] : previas, error)
    this.grupo.updateMatrixWorld(true)
  }

  private mostrarContactos(piezas: PiezaColocada[], pieza: PiezaColocada | undefined, previas: PiezaColocada[]) {
    const clave = pieza && admiteVoladizo(this.nivel,pieza) ? JSON.stringify([pieza, previas]) : ''
    if (clave === this.marcaContacto && piezas === this.piezasContacto) return
    this.marcaContacto = clave; this.piezasContacto = piezas
    for (const parche of this.contactos.children) (parche as THREE.Mesh).geometry.dispose()
    this.contactos.clear()
    if (!clave || !pieza) return
    const propuestas = new Map([...piezas,...previas].map(p => [p.id,p]))
    for (const c of contactosDePieza(this.nivel,pieza,[...propuestas.values()])) {
      const mesh = planarShape(c.poligono.flat(),this.materialContacto)
      mesh.position.y = pieza.posicion[1] + .0002
      mesh.renderOrder = 4
      const contorno = new THREE.BufferGeometry().setFromPoints(c.poligono.map(([x,z]) => new THREE.Vector3(x,mesh.position.y,z)))
      const borde = new THREE.LineLoop(contorno,this.bordeContacto)
      borde.renderOrder = 5
      this.contactos.add(mesh,borde)
    }
  }
  marcarInestable(id: string, propuesta?: PiezaColocada) {
    this.limpiarInestable()
    let objeto = this.placed.get(id)
    if (!objeto && propuesta) {
      objeto = this.loaded.get(pieceAsset(propuesta.tipo))?.clone(true)
      if (objeto) this.setPose(objeto, propuesta)
    }
    if (!objeto) return
    this.conflicto.setFromObject(objeto)
    this.conflicto.visible = true
    this.espacio.invalidar()
    this.avisoInestable = setTimeout(() => this.limpiarInestable(), 4000)
  }
  limpiarInestable() {
    if (!this.avisoInestable) return
    clearTimeout(this.avisoInestable)
    this.avisoInestable = undefined
    this.conflicto.visible = false
    this.espacio.invalidar()
  }

  private posePartes(root: THREE.Group, asset: string, id: string, poses?: Poses) {
    for (const part of assemblies[asset] ?? []) {
      const node = root.getObjectByName(part.key)!
      const pose = poses?.get(id + '/' + part.key)
      if (pose) {
        node.position.fromArray(pose.p).sub(root.position).applyQuaternion(root.quaternion.clone().invert())
        node.quaternion.fromArray(pose.q).premultiply(root.quaternion.clone().invert())
      } else {
        node.position.fromArray(part.at)
        node.quaternion.copy(partRotation(part))
      }
    }
    if (asset === 'shutter') {
      const corredera = root.getObjectByName('slider')!
      root.getObjectByName('pinon')!.rotation.z = corredera.position.x / .0035
    }
    if (asset === 'drawbridge') {
      const hoja = root.getObjectByName('leaf')!
      const apertura = THREE.MathUtils.clamp((hoja.rotation.x + 1.14) / .08, 0, 1)
      root.getObjectByName('pasador')!.position.x = .017 + .007 * apertura
    }
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
    const [width, depth] = footprint(type)
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
    this.limpiarInestable()
    this.previewKey = key
    this.conflicto.visible = false
    if (invalid && pieces.length === 1 && this.lastPieces) {
      const detalle: { objeto?: string } = {}
      validarPieza(this.nivel, pieces[0], this.lastPieces, detalle)
      const objeto = detalle.objeto && (this.fixed.get(detalle.objeto) ?? this.placed.get(detalle.objeto))
      if (objeto) {
        this.conflicto.setFromObject(objeto)
        this.conflicto.visible = true
      }
    }
    while (this.previews.children.length > pieces.length) this.previews.remove(this.previews.children.at(-1)!)
    for (const [index, piece] of pieces.entries()) {
      const row = /^@fila-\d+$/.test(piece.id)
      const rejected = Boolean(invalid && !row && invalid !== 'Límite de fichas')
      const limit = index === pieces.length - 1 && invalid === 'Límite de fichas'
      const pie = invalid?.includes('izquierda') ? -1 : invalid?.includes('derecha') ? 1 : 0
      const templateKey = [piece.tipo, rejected, limit, pie].join(',')
      let group = this.previews.children[index]
      if (group?.userData.template !== templateKey) {
        let template = this.previewTemplates.get(templateKey)
        if (!template) {
          template = this.previewTemplate(piece.tipo, rejected, limit, pie)
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

  private previewTemplate(tipo: TipoColocable, invalid: boolean, limit: boolean, pie: number) {
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
    let material = invalid ? this.materials.invalid : this.materials.valid
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
      if (invalid && material === this.materials.invalid) {
        stripe(x1,z1,x2,z2,.0007); stripe(x1,z2,x2,z1,.0007)
        for (let x = x1+.003; x < x2-.001; x += .004) {
          const dx = Math.min(.003, x2-x)
          stripe(x,z1,x+dx,z1+Math.min(dx, d),.0003)
        }
      }
    }
    const [width, depth] = footprint(tipo)
    if (tipo === 'embudo') {
      for (const foot of shapes('funnel').filter(s => s.kind === 'box')) {
        material = invalid && (!pie || pie === Math.sign(foot.at[0])) ? this.materials.invalid : this.materials.valid
        pad(foot.at[0], foot.at[2], foot.size[0], foot.size[2])
      }
    } else if (['curva90', 'balancin', 'pendulo', 'puente', 'llave', 'cuna', 'canal'].includes(tipo)) {
      for (const patch of bases(pieceAsset(tipo))) {
        ground.add(planarShape(patch.flat(), this.materials.fill))
        for (let i = 0; i < patch.length; i++) {
          const a = patch[i], b = patch[(i + 1) % patch.length]
          stripe(a[0], a[1], b[0], b[1], .0004)
        }
        if (invalid) stripe(patch[0][0], patch[0][1], patch[2][0], patch[2][1], .0007)
      }
    } else if (this.nivel.id !== 'taller' || !escenario[pieceAsset(tipo)]) pad(0, 0, width, depth)
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

  dispose() {
    this.limpiarInestable()
    for (const parche of this.contactos.children) (parche as THREE.Mesh).geometry.dispose()
    this.bordeContacto.dispose()
    this.materialContacto.dispose()
    this.conflicto.dispose()
    this.hilo.dispose()
    this.borne.dispose()
    this.retired = true
    this.previews.clear()
    this.previewTemplates.forEach(disposeGeometry)
    disposeGeometry(this.grupo)
    this.grupo.traverse(node => {
      node.userData.disposeOverlay?.()
      if (node instanceof THREE.Sprite && ['extremo','letra-mando'].includes(node.name)) { node.material.map?.dispose(); node.material.dispose() }
    })
    Object.values(this.materials).forEach(material => material.dispose())
    this.coverMaterials.forEach(material => material.dispose())
    for (const sello of this.sellos.values()) {
      sello.material.map?.dispose()
      sello.material.dispose()
    }
    this.marcarCompuerta()
    this.cantoMeta?.dispose()
    this.grupo.clear()
    this.grupo.removeFromParent()
  }
}
