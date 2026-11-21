import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { niveles } from './levels'
import { instance, loadModel, tableFrame } from './modelos'
import { cantidadPortada, dibujarPortada, duracionPortada } from './portada'
import type { Mesa } from './scene'
import type { Armado, IdNivel, Nivel } from './types'
import { acotarVista, esquinas, limitesCamara, trasladarVista, type MovimientoCamara, type Vista } from './camara'

export type Encuadre = 'inicio' | 'seleccion' | 'juego'
type Estacion = IdNivel | 'inicio'
type Parada = { id: Estacion; grupo: THREE.Group; mesa?: Mesa }
type Viaje = { desde: Vista; hasta: Vista; inicio: number; duracion: number; arco: number; fin: () => void }
const rad = THREE.MathUtils.degToRad
const alturaSuelo = -.151
const direccionSol = new THREE.Vector3(-.29, .49, -.20)
const reducido = () => document.documentElement.dataset.reducido === 'true'
const estaciones: Estacion[] = ['inicio', ...niveles.map(n => n.id), 'taller']
const posicionGrilla = (id: Estacion) => {
  const i = estaciones.indexOf(id)
  return new THREE.Vector3((i % 4) * 1.16, 0, -Math.floor(i / 4) * 1.08)
}
const copiar = (v: Vista): Vista => ({ ...v, centro: v.centro.clone() })

function alcanceLuz(contenido: THREE.Box3) {
  return Math.max(1.35, contenido.getSize(new THREE.Vector3()).length() + .5)
}

function focoNocturno(contenido: THREE.Box3) {
  return contenido.getCenter(new THREE.Vector3()).addScaledVector(direccionSol.clone().normalize(), alcanceLuz(contenido))
}

// A local source spreads shadows outwards; include their projection onto the floor
// when separating tables during a journey, as well as when fitting shadow cameras.
function conSombras(contenido: THREE.Box3, foco?: THREE.Vector3) {
  const limites = contenido.clone()
  limites.min.y = alturaSuelo
  for (const p of esquinas(contenido)) {
    const direccion = foco ? p.clone().sub(foco) : direccionSol.clone().negate()
    p.addScaledVector(direccion, (alturaSuelo - p.y) / direccion.y)
    limites.expandByPoint(p)
  }
  return limites
}

// Bounds in table coordinates, including the shadow cast onto the floor.
function limitesVisibles(grupo: THREE.Group, oscuro: boolean) {
  grupo.updateWorldMatrix(true, true)
  const limites = new THREE.Box3(), parte = new THREE.Box3()
  grupo.traverseVisible(objeto => {
    if (!(objeto instanceof THREE.Mesh)) return
    const geometria = objeto.geometry
    if (!geometria.boundingBox) geometria.computeBoundingBox()
    limites.union(parte.copy(geometria.boundingBox!).applyMatrix4(objeto.matrixWorld))
  })
  limites.translate(grupo.position.clone().negate())
  return conSombras(limites, oscuro ? focoNocturno(limites) : undefined)
}

// Scale the travel vector until the other table clears at least one edge of this framing.
function escalaParaSalir(vista: Vista, limites: THREE.Box3, paso: THREE.Vector3, aspecto: number) {
  const { azimut, elevacion } = vista
  const centro = limites.getCenter(new THREE.Vector3()).sub(vista.centro)
  const mitad = limites.getSize(new THREE.Vector3()).multiplyScalar(.5)
  const distancia = (eje: THREE.Vector3, campo: number) => {
    const avance = paso.dot(eje)
    if (Math.abs(avance) < .00001) return Infinity
    const radio = Math.abs(eje.x)*mitad.x + Math.abs(eje.y)*mitad.y + Math.abs(eje.z)*mitad.z
    return (campo * .55 + radio - Math.sign(avance) * centro.dot(eje)) / Math.abs(avance)
  }
  const derecha = new THREE.Vector3(Math.cos(azimut), 0, -Math.sin(azimut))
  const arriba = new THREE.Vector3(-Math.sin(elevacion)*Math.sin(azimut), Math.cos(elevacion), -Math.sin(elevacion)*Math.cos(azimut))
  return Math.min(distancia(derecha, vista.alto * aspecto), distancia(arriba, vista.alto))
}

export class Espacio {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 10)
  readonly renderer: THREE.WebGLRenderer
  readonly vista: Vista = { centro: new THREE.Vector3(), azimut: 0, elevacion: .55, alto: .2 }
  width = 1
  height = 1
  private luz = new THREE.DirectionalLight(0xffe6be, 2.6)
  private nocturna = new THREE.SpotLight(0xffd9aa, 1, 0, .76, .65, 2)
  private relleno = new THREE.DirectionalLight(0xc4ded6, .56)
  private ambiente = new THREE.HemisphereLight(0xfff2d4, 0x9b7860, 1.16)
  private suelo = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0xe7d8b8, roughness: 1 }))
  private noche = false
  get oscuro() { return this.noche }
  private distanciaLuz = direccionSol.length()
  private portada: Parada = { id: 'inicio', grupo: new THREE.Group() }
  private actual = this.portada
  private salida?: Parada
  private fila: THREE.Group[] = []
  private baseLista?: Promise<void>
  private inicioCaida?: number
  private finCaida = false
  private encuadre: Encuadre = 'inicio'
  private get activa() { return this.actual.mesa }
  private viaje?: Viaje
  private solicitud = 0
  private lista = false
  private automatica = true
  private sucia = true
  contextoPerdido = false
  private pausaContexto = 0

  private entorno?: THREE.WebGLRenderTarget
  private prepararEntorno() {
    this.entorno?.dispose()
    const studio = new RoomEnvironment(), generator = new THREE.PMREMGenerator(this.renderer)
    this.entorno = generator.fromScene(studio, .04)
    this.scene.environment = this.entorno.texture
    studio.dispose(); generator.dispose()
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('Para jugar Tuki necesitás WebGL 2 con aceleración gráfica.')
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })
    canvas.addEventListener('webglcontextlost', ev => {
      ev.preventDefault(); this.contextoPerdido = true; this.pausaContexto = performance.now()
    })
    canvas.addEventListener('webglcontextrestored', () => {
      const pausa = performance.now() - this.pausaContexto
      if (this.viaje) this.viaje.inicio += pausa
      if (this.inicioCaida !== undefined) this.inicioCaida += pausa
      this.contextoPerdido = false; this.prepararEntorno(); this.invalidar()
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.09
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.prepararEntorno()
    this.scene.environmentIntensity = .34
    this.scene.background = new THREE.Color(0xf0e6d0)
    this.relleno.position.set(.32, .20, .38)
    this.luz.castShadow = true
    this.luz.shadow.mapSize.set(2048, 2048)
    Object.assign(this.luz.shadow.camera, { left: -.48, right: .48, top: .39, bottom: -.39, near: .02, far: 1.7 })
    this.luz.shadow.camera.updateProjectionMatrix()
    this.luz.shadow.normalBias = .00018
    this.luz.shadow.bias = -.00013
    this.nocturna.castShadow = true
    this.nocturna.shadow.mapSize.set(2048, 2048)
    this.nocturna.shadow.camera.near = .4
    this.nocturna.shadow.normalBias = .00035
    this.nocturna.shadow.radius = 2
    this.suelo.rotation.x = -Math.PI / 2
    this.suelo.position.y = alturaSuelo
    this.suelo.receiveShadow = true
    this.scene.add(this.suelo, this.portada.grupo, this.luz, this.luz.target,
      this.nocturna, this.nocturna.target, this.relleno, this.relleno.target, this.ambiente)
    this.aplicarApariencia(document.documentElement.dataset.apariencia === 'oscuro')
    this.resize()
    new ResizeObserver(() => this.resize()).observe(canvas)
  }

  aplicarApariencia(oscuro: boolean) {
    this.noche = oscuro
    this.luz.visible = !oscuro
    this.nocturna.visible = oscuro
    this.scene.background = new THREE.Color(oscuro ? 0x111d1b : 0xf0e6d0)
    this.suelo.material.color.setHex(oscuro ? 0x183331 : 0xe7d8b8)
    this.scene.environmentIntensity = oscuro ? .14 : .34
    this.relleno.color.setHex(oscuro ? 0xb9cdc3 : 0xc4ded6)
    this.relleno.intensity = oscuro ? .34 : .56
    this.ambiente.color.setHex(oscuro ? 0xd5cfb9 : 0xfff2d4)
    this.ambiente.groundColor.setHex(oscuro ? 0x68513b : 0x9b7860)
    this.ambiente.intensity = oscuro ? .28 : 1.16
    this.actual.mesa?.aplicarApariencia(oscuro)
    this.salida?.mesa?.aplicarApariencia(oscuro)
    this.actualizarLuz()
  }

  private prepararEspacio() {
    return this.baseLista ??= Promise.all([loadModel('table'), loadModel('domino')]).then(([mesa, ficha]) => {
      this.portada.grupo.add(instance(mesa, 'inicio'), tableFrame())
      for (let i = 0; i < cantidadPortada; i++) {
        const pieza = instance(ficha, 'muestra-' + i)
        pieza.name = 'domino-portada-' + i
        this.fila.push(pieza)
        this.portada.grupo.add(pieza)
      }
      dibujarPortada(this.fila, 0)
      this.invalidar()
    }).catch(e => { this.baseLista = undefined; throw e })
  }

  cancelarViaje() {
    this.solicitud++
    this.viaje?.fin()
    this.viaje = undefined
  }

  private retirar(parada: Parada) {
    if (parada.mesa) parada.mesa.dispose()
    else parada.grupo.removeFromParent()
  }

  async mostrar(modo: Encuadre, nivel?: Nivel, armado?: Armado): Promise<Mesa | undefined> {
    this.cancelarViaje()
    const solicitud = this.solicitud
    const id = nivel?.id ?? 'inicio'
    await this.prepararEspacio()
    if (solicitud !== this.solicitud) return
    const presentes = this.salida ? [this.actual, this.salida] : [this.actual]
    const existente = presentes.find(p => p.id === id && p.mesa?.nivel === nivel)
    const modulo = nivel && !existente ? await import('./scene') : undefined
    if (solicitud !== this.solicitud) return
    const mesa = existente?.mesa ?? (nivel && modulo ? new modulo.Mesa(this, nivel) : undefined)
    const destino = existente ?? (mesa ? { id, mesa, grupo: mesa.grupo } : this.portada)
    try {
      await mesa?.preparar(armado?.piezas ?? [], modo === 'juego')
    } catch (e) {
      if (!existente) mesa?.dispose()
      throw e
    }
    if (solicitud !== this.solicitud) {
      if (!existente) mesa?.dispose()
      return
    }
    const desde = copiar(this.vista)
    // On interruption keep the endpoint nearest the visible camera as the departure.
    const origen = presentes.reduce((a, b) =>
      a.grupo.position.distanceToSquared(desde.centro) <= b.grupo.position.distanceToSquared(desde.centro) ? a : b)
    const misma = origen.id === id
    this.salida = misma ? presentes.find(p => p.id !== id) : origen
    this.actual = destino
    this.encuadre = modo
    this.automatica = true
    const baseDestino = (existente ?? origen).grupo.position.clone()
    destino.grupo.position.set(0, 0, 0)
    this.scene.add(destino.grupo)
    mesa?.dibujar(armado?.piezas ?? [], null, [], null, undefined, armado?.conexiones)
    const hasta = this.encuadreInicial()
    if (!existente && !misma) {
      const paso = posicionGrilla(id).sub(posicionGrilla(origen.id))
      const aspecto = this.width / this.height
      const local = { ...desde, centro: desde.centro.clone().sub(origen.grupo.position) }
      const escala = Math.max(1, escalaParaSalir(local, limitesVisibles(destino.grupo, this.noche), paso, aspecto),
        escalaParaSalir(hasta, limitesVisibles(origen.grupo, this.noche), paso.clone().negate(), aspecto))
      baseDestino.addScaledVector(paso, escala)
    }
    // Rebase both camera and departure by the same amount. Gameplay stays at local (0, 0, 0).
    desde.centro.sub(baseDestino)
    this.salida?.grupo.position.sub(baseDestino)
    for (const p of presentes) if (p !== this.salida && p !== destino) this.retirar(p)
    this.aplicar(desde)
    this.scene.updateMatrixWorld(true)
    if (this.lista && !reducido()) {
      await new Promise<void>(fin => {
        this.viaje = { desde, hasta, inicio: performance.now(), duracion: misma ? 350 : 700, arco: misma ? 0 : .26, fin }
      })
    } else {
      this.aplicar(hasta)
    }
    if (solicitud !== this.solicitud) return
    this.lista = true
    if (this.salida) this.retirar(this.salida)
    this.salida = undefined
    this.actualizarLuz()
    this.invalidar()
    return mesa
  }

  private encuadreInicial(): Vista {
    const vertical = this.width < this.height, aspecto = this.width / this.height
    if (!this.activa) {
      const alto = vertical ? .227 / aspecto : Math.max(.125, .245 / aspecto)
      return { centro: new THREE.Vector3(vertical ? .042 : -.035, vertical ? -.010 : .020, vertical ? .018 : .013), azimut: rad(vertical ? 42 : -16), elevacion: rad(vertical ? 42 : 27), alto }
    }
    const n = this.activa.nivel, cam = n.camara
    const centro = new THREE.Vector3(...cam.objetivo)
    const azimut = rad(cam.azimut), elevacion = rad(cam.elevacion)
    const derecha = new THREE.Vector3(Math.cos(azimut), 0, -Math.sin(azimut))
    const arriba = new THREE.Vector3(-Math.sin(elevacion)*Math.sin(azimut), Math.cos(elevacion), -Math.sin(elevacion)*Math.cos(azimut))
    let alto = cam.altoVisible
    // A level's controls and scenery must remain visible in portrait too.
    // Fitting only start and goal crops lateral branches such as the mate switches.
    const objetos = this.activa.objetosCamara
    if (!objetos.isEmpty()) for (const x of [objetos.min.x,objetos.max.x])
      for (const y of [objetos.min.y,objetos.max.y]) for (const z of [objetos.min.z,objetos.max.z]) {
        const p = new THREE.Vector3(x,y,z).sub(centro)
        alto = Math.max(alto, (Math.abs(p.dot(derecha))+.012)*2/aspecto, (Math.abs(p.dot(arriba))+.012)*2)
      }
    for (const extremo of n.fijos.filter(p => p.rol === 'inicio' || p.rol === 'meta')) {
      for (const y of [0, .074]) {
        const p = new THREE.Vector3(...extremo.posicion).sub(centro)
        p.y += y
        alto = Math.max(alto, (Math.abs(p.dot(derecha)) + (extremo.rol === 'meta' ? .052 : .017)) * 2 / aspecto, (Math.abs(p.dot(arriba)) + .009) * 2)
      }
    }
    if (n.id === 'taller') alto = Math.max(alto, this.activa.tableroCamara.w / aspecto)
    const seleccion = this.encuadre === 'seleccion'
    alto *= seleccion ? 1.29 : 1.06
    // Keep the pieces between the top controls and bottom rack, also in short landscape viewports.
    const cabecera = document.querySelector('.game-head')?.getBoundingClientRect()
    const margenArriba = seleccion ? 58 : Math.max(56, (cabecera?.bottom ?? 0) - this.canvas.getBoundingClientRect().top + 8)
    const margenAbajo = seleccion ? Math.min(this.height * .37, 166) : (n.id === 'taller' ? 128 : 74)
    alto *= this.height / Math.max(this.height * .5, this.height - margenArriba - margenAbajo)
    centro.addScaledVector(arriba, (margenArriba - margenAbajo) * .5 * alto / this.height)
    return { centro, azimut, elevacion, alto }
  }

  private aplicar(vista: Vista) {
    this.vista.centro.copy(vista.centro)
    this.vista.azimut = vista.azimut
    this.vista.elevacion = vista.elevacion
    this.vista.alto = vista.alto
    const { azimut, elevacion, alto } = vista
    const medio = alto / 2, ancho = medio * this.width / this.height
    Object.assign(this.camera, { left: -ancho, right: ancho, top: medio, bottom: -medio })
    const centro = this.vista.centro
    this.camera.position.set(Math.sin(azimut)*Math.cos(elevacion), Math.sin(elevacion), Math.cos(azimut)*Math.cos(elevacion)).multiplyScalar(1.35).add(centro)
    this.camera.up.set(0, elevacion === Math.PI / 2 ? 0 : 1, elevacion === Math.PI / 2 ? -1 : 0)
    this.camera.lookAt(centro)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
    if (!this.activa || this.encuadre !== 'juego' || this.viaje) {
      this.luz.target.position.copy(centro)
      this.luz.position.copy(centro).addScaledVector(direccionSol, this.distanciaLuz/direccionSol.length())
      this.posicionarNocturna(centro, Math.max(1.35, this.distanciaLuz))
    }
    // Fill has a fixed direction in the room, independent of camera orbit or travel.
    this.relleno.target.position.copy(centro)
    this.relleno.position.copy(centro).add(new THREE.Vector3(.32, .20, .38))
    this.activa?.actualizarSellos()
    this.invalidar()
  }

  encuadrar() { this.automatica = true; this.aplicar(this.encuadreInicial()) }
  superior() {
    if (!this.puedeNavegar) return
    this.automatica = false
    this.aplicar(this.acotar({ ...this.vista, azimut: 0, elevacion: Math.PI / 2 }))
  }
  guardarVista() { return { ...copiar(this.vista), automatica: this.automatica } }
  restaurarVista(vista: Vista & { automatica: boolean }) {
    this.automatica = vista.automatica
    this.aplicar(vista.automatica ? vista : this.acotar(vista))
  }
  get puedeNavegar() { return this.encuadre === 'juego' && !this.viaje && !!this.activa }

  private limites(vista: Vista) {
    const box = this.canvas.getBoundingClientRect()
    const cabecera = document.querySelector('.game-head')?.getBoundingClientRect()
    const bandeja = document.querySelector('#bandeja')?.getBoundingClientRect()
    return limitesCamara(vista, this.activa!.tableroCamara, this.activa!.contenidoCamara,
      this.width, this.height, this.encuadreInicial().alto, {
        arriba: cabecera ? Math.max(0, cabecera.bottom - box.top + 8) : 56,
        abajo: bandeja ? Math.max(0, box.bottom - bandeja.top + 8) : 74,
      })
  }
  private acotar(vista: Vista) {
    return this.puedeNavegar ? acotarVista(vista, this.activa!.tableroCamara, this.limites(vista)) : vista
  }
  mover(movimiento: MovimientoCamara) {
    if (!this.puedeNavegar) return
    this.automatica = false
    const { anterior, actual, modo, zoom } = movimiento
    const dx = actual.x-anterior.x, dy = actual.y-anterior.y
    let vista = copiar(this.vista)
    if (modo === 'orbitar' && (dx || dy)) {
      vista.azimut -= dx * .006
      vista.elevacion = THREE.MathUtils.clamp(vista.elevacion + dy * .006, rad(12), rad(85))
    }
    const limites = this.limites(vista)
    const alto = THREE.MathUtils.clamp(vista.alto * zoom, limites.minimo, limites.maximo)
    if (modo === 'desplazar' || alto !== vista.alto) {
      const rect = this.canvas.getBoundingClientRect()
      const local = (p: { x: number; y: number }) => ({ x: p.x-rect.left, y: p.y-rect.top })
      const plano = alto !== vista.alto ? this.activa!.alturaAnclaCamara(anterior.x, anterior.y) : this.activa!.tableroCamara.y
      vista = trasladarVista(vista, local(modo === 'desplazar' ? anterior : actual), local(actual),
        alto, this.width, this.height, plano)
    }
    this.aplicar(acotarVista(vista, this.activa!.tableroCamara, limites))
  }

  private posicionarNocturna(centro: THREE.Vector3, distancia: number) {
    this.nocturna.target.position.copy(centro)
    this.nocturna.position.copy(centro).addScaledVector(direccionSol, distancia / direccionSol.length())
    // Keep illumination at the working plane stable when tall workshop builds
    // require raising the source. The source itself has no visible geometry.
    this.nocturna.intensity = 1.9 * distancia * distancia
    this.nocturna.shadow.focus = 1
    this.nocturna.shadow.camera.near = distancia * .3
    this.nocturna.shadow.camera.far = distancia * 2 + .5
    this.ajustarProfundidadNocturna(distancia)
  }

  private ajustarProfundidadNocturna(distancia: number) {
    const camara = this.nocturna.shadow.camera
    const { near, far } = camara
    // The wider title/travel map needs more offset to suppress self-shadowing.
    // Convert metres into perspective depth so near-plane changes do not detach shadows.
    const margen = this.nocturna.shadow.focus === 1 ? .004 : .001
    this.nocturna.shadow.bias = -margen * near * far / ((far - near) * distancia * distancia)
    camara.updateProjectionMatrix()
  }

  actualizarLuz() {
    const contenido = this.activa?.contenidoCamara
    if (!contenido || contenido.isEmpty()) {
      this.distanciaLuz = direccionSol.length()
      this.luz.target.position.copy(this.vista.centro)
      this.luz.position.copy(this.vista.centro).add(direccionSol)
      this.posicionarNocturna(this.vista.centro, 1.35)
      Object.assign(this.luz.shadow.camera, { left: -.48, right: .48, top: .39, bottom: -.39, near: .02, far: 1.7 })
      this.luz.shadow.camera.updateProjectionMatrix()
      this.invalidar()
      return
    }
    const centro = contenido.getCenter(new THREE.Vector3())
    const alcance = alcanceLuz(contenido)
    this.distanciaLuz = alcance
    this.luz.target.position.copy(centro)
    this.luz.position.copy(centro).addScaledVector(direccionSol.clone().normalize(), alcance)
    this.posicionarNocturna(centro, alcance)
    const sombra = this.nocturna.shadow, perspectiva = sombra.camera
    perspectiva.position.copy(this.nocturna.position)
    perspectiva.lookAt(centro)
    perspectiva.updateMatrixWorld(true)
    const puntos = esquinas(conSombras(contenido, this.nocturna.position)).map(p => p.applyMatrix4(perspectiva.matrixWorldInverse))
    const angulo = Math.max(...puntos.map(p => Math.atan2(Math.max(Math.abs(p.x), Math.abs(p.y)), -p.z)))
    // Fit the shadow map to the table and its floor shadow, not the whole light cone.
    sombra.focus = Math.min(1, (angulo + .025) / this.nocturna.angle)
    perspectiva.near = Math.max(.02, Math.min(...puntos.map(p => -p.z)) - .03)
    perspectiva.far = Math.max(...puntos.map(p => -p.z)) + .03
    this.ajustarProfundidadNocturna(alcance)
    const cam = this.luz.shadow.camera
    cam.position.copy(this.luz.position); cam.lookAt(centro); cam.updateMatrixWorld(true)
    const cobertura = conSombras(contenido)
    const luz = new THREE.Box3().setFromPoints(esquinas(cobertura).map(p => p.applyMatrix4(cam.matrixWorldInverse)))
    Object.assign(cam, { left: luz.min.x-.03, right: luz.max.x+.03, bottom: luz.min.y-.03, top: luz.max.y+.03,
      near: Math.max(.001, -luz.max.z-.03), far: Math.max(.1, -luz.min.z+.03) })
    cam.updateProjectionMatrix()
    this.invalidar()
  }
  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.renderer.setSize(this.width, this.height, false)
    if (this.viaje) this.viaje.hasta = this.encuadreInicial()
    this.aplicar(this.automatica && !this.viaje ? this.encuadreInicial() : this.acotar(this.vista))
  }
  invalidar() { this.sucia = true }

  render(t: number) {
    if (this.contextoPerdido) return
    const viaje = this.viaje
    if (viaje) {
      const u = reducido() ? 1 : Math.min(1, Math.max(0, (t - viaje.inicio) / viaje.duracion))
      const k = u*u*(3 - 2*u), subida = Math.sin(k * Math.PI) * viaje.arco
      this.aplicar({ centro: viaje.desde.centro.clone().lerp(viaje.hasta.centro, k),
        alto: THREE.MathUtils.lerp(viaje.desde.alto, viaje.hasta.alto, k) + subida,
        azimut: viaje.desde.azimut + Math.atan2(Math.sin(viaje.hasta.azimut-viaje.desde.azimut), Math.cos(viaje.hasta.azimut-viaje.desde.azimut))*k,
        elevacion: THREE.MathUtils.lerp(viaje.desde.elevacion, viaje.hasta.elevacion, k) + subida })
      if (u === 1) { this.viaje = undefined; viaje.fin() }
    }
    if (this.actual === this.portada && this.fila.length && !this.finCaida) {
      this.inicioCaida ??= t
      const tiempo = reducido() ? duracionPortada : t - this.inicioCaida
      dibujarPortada(this.fila, tiempo)
      this.finCaida = tiempo >= duracionPortada
      this.invalidar()
    }
    if (this.sucia) {
      this.renderer.render(this.scene, this.camera)
      this.sucia = false
    }
  }
}
