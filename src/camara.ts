import { Box3, MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'

export type PuntoCamara = { x: number; y: number }
export type ModoCamara = 'orbitar' | 'desplazar'
export type ProyeccionCamara = 'ortografica' | 'perspectiva'
export type CamaraJuego = OrthographicCamera | PerspectiveCamera
export const campoVertical = 30
const tangente = Math.tan(MathUtils.degToRad(campoVertical / 2))
const fraccionCercana = .05
export const distanciaPerspectiva = (alto: number) => alto / (2 * tangente)
export type MovimientoCamara = {
  modo: ModoCamara
  anterior: PuntoCamara
  actual: PuntoCamara
  zoom: number
}
export type Vista = { centro: Vector3; azimut: number; elevacion: number; alto: number }
export type TableroCamara = { x: number; y: number; z: number; w: number; d: number; ang: number }
export type MargenesCamara = { arriba: number; abajo: number }
const vertical = new Vector3(0, 1, 0)
const margenMesa = .02

export function ejesVista(vista: Pick<Vista, 'azimut' | 'elevacion'>) {
  const { azimut: a, elevacion: e } = vista
  return {
    derecha: new Vector3(Math.cos(a), 0, -Math.sin(a)),
    fondo: new Vector3(Math.sin(a), 0, Math.cos(a)),
    arriba: new Vector3(-Math.sin(e)*Math.sin(a), Math.cos(e), -Math.sin(e)*Math.cos(a)),
  }
}

/** Match both projections at the target plane. Orbit never changes this scale. */
export function configurarCamara(camera: CamaraJuego, v: Vista, width: number, height: number) {
  const distancia = camera instanceof PerspectiveCamera ? distanciaPerspectiva(v.alto) : 1.35
  if (camera instanceof PerspectiveCamera) { camera.fov = campoVertical; camera.aspect = width / height }
  else Object.assign(camera, { left: -v.alto*width/height/2, right: v.alto*width/height/2, top: v.alto/2, bottom: -v.alto/2 })
  // A millimetric near plane wastes perspective depth precision at tabletop
  // distance: coplanar print/decorations start fighting with their surfaces.
  camera.near = camera instanceof PerspectiveCamera ? Math.max(.001,distancia*fraccionCercana) : .001
  camera.far = camera instanceof PerspectiveCamera ? distancia + 30 : 10
  camera.position.set(Math.sin(v.azimut)*Math.cos(v.elevacion), Math.sin(v.elevacion), Math.cos(v.azimut)*Math.cos(v.elevacion))
    .multiplyScalar(distancia).add(v.centro)
  camera.up.set(0, v.elevacion === Math.PI/2 ? 0 : 1, v.elevacion === Math.PI/2 ? -1 : 0)
  camera.lookAt(v.centro); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
}

/** Fit only on explicit framing/resize, never as a side effect of orbiting. */
export function altoPerspectiva(v: Vista, puntos: Vector3[], aspecto: number, top = 0, bottom = 0) {
  const { derecha, arriba, fondo } = ejesVista(v)
  const normal = fondo.multiplyScalar(Math.cos(v.elevacion)); normal.y = Math.sin(v.elevacion)
  let distancia = distanciaPerspectiva(v.alto)
  for (const punto of puntos) {
    const p = punto.clone().sub(v.centro), z = p.dot(normal), y = p.dot(arriba)
    distancia = Math.max(distancia, z/(1-fraccionCercana) + .002, z + Math.abs(p.dot(derecha))/(tangente*aspecto),
      z + y/(tangente*(1-2*top)), z - y/(tangente*(1-2*bottom)))
  }
  return distancia * 2 * tangente
}

/** Intersect the screen ray with a horizontal plane, in canvas pixels. */
export function puntoEnPlano(v: Vista, p: PuntoCamara, width: number, height: number, y: number, proyeccion: ProyeccionCamara = 'ortografica') {
  const { derecha, fondo } = ejesVista(v)
  const u = (p.x - width/2) * v.alto / height
  const arriba = (height/2 - p.y) * v.alto / height
  if (proyeccion === 'perspectiva') {
    const normal = fondo.clone().multiplyScalar(Math.cos(v.elevacion)); normal.y = Math.sin(v.elevacion)
    const distancia = distanciaPerspectiva(v.alto), origen = v.centro.clone().addScaledVector(normal, distancia)
    const direccion = normal.multiplyScalar(-distancia).addScaledVector(derecha, u).addScaledVector(ejesVista(v).arriba, arriba)
    // The upper viewport can look above the horizon at a low elevation. No pan
    // or cursor anchor exists there; keep the view instead of jumping to infinity.
    if (Math.abs(direccion.y) < 1e-7) return null
    const t = (y-origen.y)/direccion.y
    if (t <= 0) return null
    origen.addScaledVector(direccion, t); origen.y = y
    return origen
  }
  const z = (Math.cos(v.elevacion) * (y - v.centro.y) - arriba) / Math.sin(v.elevacion)
  const punto = v.centro.clone().addScaledVector(derecha, u).addScaledVector(fondo, z)
  punto.y = y
  return punto
}

export function trasladarVista(v: Vista, anterior: PuntoCamara, actual: PuntoCamara,
  alto: number, width: number, height: number, plano: number, proyeccion: ProyeccionCamara = 'ortografica'): Vista {
  const nueva = { ...v, alto, centro: v.centro.clone() }
  const antes = puntoEnPlano(v, anterior, width, height, plano, proyeccion)
  const despues = puntoEnPlano(nueva, actual, width, height, plano, proyeccion)
  if (antes && despues) nueva.centro.add(antes.sub(despues))
  return nueva
}

function local(p: Vector3, t: TableroCamara) {
  return p.clone().sub(new Vector3(t.x, 0, t.z)).applyAxisAngle(vertical, -t.ang)
}
function mundial(p: Vector3, t: TableroCamara, y: number) {
  p.applyAxisAngle(vertical, t.ang).add(new Vector3(t.x, 0, t.z))
  p.y = y
  return p
}
function acotarLocal(p: Vector3, t: TableroCamara) {
  p.x = MathUtils.clamp(p.x, -t.w/2 - margenMesa, t.w/2 + margenMesa)
  p.z = MathUtils.clamp(p.z, -t.d/2 - margenMesa, t.d/2 + margenMesa)
  return p
}
export function esquinas(caja: Box3) {
  return [caja.min.x, caja.max.x].flatMap(x => [caja.min.y, caja.max.y].flatMap(y =>
    [caja.min.z, caja.max.z].map(z => new Vector3(x, y, z))))
}

export function limitesCamara(v: Vista, tablero: TableroCamara, contenido: Box3,
  width: number, height: number, altoInicial: number, margenes: MargenesCamara, proyeccion: ProyeccionCamara = 'ortografica') {
  const aspecto = width / height, minimo = .12 / Math.min(1, aspecto)
  const { derecha, arriba, fondo } = ejesVista(v)
  const puntos = esquinas(contenido)
  const xs = puntos.map(p => p.dot(derecha)), ys = puntos.map(p => p.dot(arriba))
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const centroX = (minX+maxX)/2, centroY = (minY+maxY)/2
  // Leave at least half the canvas available in short landscape viewports.
  const escala = Math.min(1, height * .5 / Math.max(1, margenes.arriba + margenes.abajo))
  const top = margenes.arriba * escala / height, bottom = margenes.abajo * escala / height
  const radioX = (maxX-minX) * .55, radioY = (maxY-minY) * .55
  let maximo = Math.max(minimo, altoInicial, 2*radioX/aspecto, 2*radioY/(1-top-bottom))
  const objetivoArriba = centroY - (bottom-top) * maximo/2
  const general = derecha.clone().multiplyScalar(centroX).addScaledVector(fondo,
    (Math.cos(v.elevacion)*v.centro.y - objetivoArriba) / Math.sin(v.elevacion))
  general.copy(mundial(acotarLocal(local(general, tablero), tablero), tablero, v.centro.y))
  // Clamping the overview target may prevent perfect centering of tall stacks. Fit
  // their actual projections as well, without raising or freeing the camera target.
  maximo = Math.max(maximo, 2*(Math.abs(centroX-general.dot(derecha))+radioX)/aspecto,
    (centroY+radioY-general.dot(arriba))/(.5-top), (general.dot(arriba)-centroY+radioY)/(.5-bottom))
  if (proyeccion === 'perspectiva') maximo = altoPerspectiva({ ...v, centro: general, alto: maximo },
    esquinas(contenido.clone().expandByScalar(.012)), aspecto, top, bottom)
  return { minimo, maximo, general, width, height, arriba: top*height, abajo: bottom*height, proyeccion }
}

function recortar(entrada: Vector3[], normal: Vector3, tope: number) {
  const salida: Vector3[] = []
  for (let i = 0; i < entrada.length; i++) {
    const a = entrada[i], b = entrada[(i+1)%entrada.length], da = a.dot(normal)-tope, db = b.dot(normal)-tope
    if (da <= 1e-10) salida.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) salida.push(a.clone().lerp(b, da/(da-db)))
  }
  return salida
}

// Clip a horizontal plane against the perspective frustum. Unlike four ray
// intersections this remains finite when the viewport straddles the horizon.
function huellaPerspectiva(v: Vista, t: TableroCamara, limites: ReturnType<typeof limitesCamara>, alto: number) {
  const { derecha, arriba, fondo } = ejesVista(v)
  const normal = fondo.multiplyScalar(Math.cos(v.elevacion)); normal.y = Math.sin(v.elevacion)
  const distancia = distanciaPerspectiva(alto), aspecto = limites.width/limites.height
  const radio = 4*(Math.hypot(t.w,t.d) + Math.abs(t.y-v.centro.y) + limites.maximo + limites.general.distanceTo(new Vector3(t.x,v.centro.y,t.z))) + 1
  let puntos = [new Vector3(-radio,0,-radio),new Vector3(radio,0,-radio),new Vector3(radio,0,radio),new Vector3(-radio,0,radio)]
  const planos: [Vector3, number][] = [
    [derecha.clone(), tangente*aspecto*(1-24/limites.width)], [derecha.negate(), tangente*aspecto*(1-24/limites.width)],
    [arriba.clone(), tangente*(1-2*(limites.arriba+12)/limites.height)], [arriba.negate(), tangente*(1-2*(limites.abajo+12)/limites.height)],
  ]
  for (const [eje, pendiente] of planos) {
    const n = eje.addScaledVector(normal, pendiente).applyAxisAngle(vertical, -t.ang)
    puntos = recortar(puntos, n, pendiente*distancia - n.y*(t.y-v.centro.y))
  }
  const n = normal.applyAxisAngle(vertical, -t.ang)
  return recortar(puntos, n, distancia-Math.max(.001,distancia*fraccionCercana)-n.y*(t.y-v.centro.y))
}

// Intersect the allowed target rectangle with the translations for which the
// tabletop overlaps the usable viewport. This is the Minkowski sum of two
// rectangles, whose separating axes are the table axes and the camera axes.
function zonaVisible(v: Vista, t: TableroCamara, limites: ReturnType<typeof limitesCamara>, alto: number) {
  const libertad = limites.maximo === limites.minimo ? 0 : (limites.maximo-alto)/(limites.maximo-limites.minimo)
  const general = local(limites.general, t)
  const minX = MathUtils.lerp(general.x, -t.w/2-margenMesa, libertad), maxX = MathUtils.lerp(general.x, t.w/2+margenMesa, libertad)
  const minZ = MathUtils.lerp(general.z, -t.d/2-margenMesa, libertad), maxZ = MathUtils.lerp(general.z, t.d/2+margenMesa, libertad)
  let poligono = [new Vector3(minX,0,minZ), new Vector3(maxX,0,minZ), new Vector3(maxX,0,maxZ), new Vector3(minX,0,maxZ)]
  const { derecha, fondo } = ejesVista(v)
  const ejes = [new Vector3(1,0,0), new Vector3(0,0,1), derecha.applyAxisAngle(vertical, -t.ang), fondo.applyAxisAngle(vertical, -t.ang)]
  const offsets = limites.proyeccion === 'perspectiva' ? huellaPerspectiva(v,t,limites,alto)
    : [12, limites.width-12].flatMap(x => [limites.arriba+12, limites.height-limites.abajo-12].map(y =>
      puntoEnPlano({ ...v, alto }, { x, y }, limites.width, limites.height, t.y)!.sub(v.centro).applyAxisAngle(vertical, -t.ang)))
  if (!offsets.length) return []
  if (limites.proyeccion === 'perspectiva') for (let i=0;i<offsets.length;i++) {
    const a=offsets[i],b=offsets[(i+1)%offsets.length]
    ejes.push(new Vector3(b.z-a.z,0,a.x-b.x).normalize())
  }
  for (const eje of ejes) for (const signo of [-1, 1]) {
    const normal = eje.clone().multiplyScalar(signo)
    const radio = Math.abs(normal.x)*(t.w/2-.002) + Math.abs(normal.z)*(t.d/2-.002)
    const tope = radio - Math.min(...offsets.map(p => p.dot(normal)))
    poligono = recortar(poligono, normal, tope)
  }
  return poligono
}

export function acotarVista(v: Vista, tablero: TableroCamara, limites: ReturnType<typeof limitesCamara>): Vista {
  let alto = MathUtils.clamp(v.alto, limites.minimo, limites.maximo)
  let zona = zonaVisible(v, tablero, limites, alto)
  if (!zona.length) {
    // A very high focus and a grazing angle can make a close-up impossible.
    // Keep the angle/height and find the nearest zoom that still shows the table.
    let inferior = alto, superior = limites.maximo
    for (let i = 0; i < 24; i++) {
      const medio = (inferior+superior)/2
      if (zonaVisible(v, tablero, limites, medio).length) superior = medio
      else inferior = medio
    }
    alto = superior
    zona = zonaVisible(v, tablero, limites, alto)
  }
  const deseado = local(v.centro, tablero); deseado.y = 0
  const area = zona.reduce((s, p, i) => { const b = zona[(i+1)%zona.length]; return s+p.x*b.z-b.x*p.z }, 0)
  const dentro = area > 1e-18 &&
    zona.every((a, i) => {
      const b = zona[(i+1)%zona.length]
      return (b.x-a.x)*(deseado.z-a.z)-(b.z-a.z)*(deseado.x-a.x) >= -1e-12
    })
  let centro = dentro ? deseado : local(limites.general, tablero), distancia = Infinity
  if (!dentro) for (let i = 0; i < zona.length; i++) {
    const a = zona[i], delta = zona[(i+1)%zona.length].clone().sub(a)
    const t = delta.lengthSq() ? MathUtils.clamp(deseado.clone().sub(a).dot(delta)/delta.lengthSq(), 0, 1) : 0
    const p = a.clone().addScaledVector(delta, t), d = p.distanceToSquared(deseado)
    if (d < distancia) { centro = p; distancia = d }
  }
  return { ...v, alto, centro: mundial(centro, tablero, v.centro.y) }
}
