import { Box3, MathUtils, Vector3 } from 'three'

export type PuntoCamara = { x: number; y: number }
export type ModoCamara = 'orbitar' | 'desplazar'
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

/** Intersect an orthographic screen ray with a horizontal plane, in canvas pixels. */
export function puntoEnPlano(v: Vista, p: PuntoCamara, width: number, height: number, y: number) {
  const { derecha, fondo } = ejesVista(v)
  const u = (p.x - width/2) * v.alto / height
  const arriba = (height/2 - p.y) * v.alto / height
  const z = (Math.cos(v.elevacion) * (y - v.centro.y) - arriba) / Math.sin(v.elevacion)
  const punto = v.centro.clone().addScaledVector(derecha, u).addScaledVector(fondo, z)
  punto.y = y
  return punto
}

export function trasladarVista(v: Vista, anterior: PuntoCamara, actual: PuntoCamara,
  alto: number, width: number, height: number, plano: number): Vista {
  const nueva = { ...v, alto, centro: v.centro.clone() }
  const antes = puntoEnPlano(v, anterior, width, height, plano)
  const despues = puntoEnPlano(nueva, actual, width, height, plano)
  nueva.centro.add(antes.sub(despues))
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
  width: number, height: number, altoInicial: number, margenes: MargenesCamara) {
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
  return { minimo, maximo, general, width, height, arriba: top*height, abajo: bottom*height }
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
  const offsets = [12, limites.width-12].flatMap(x => [limites.arriba+12, limites.height-limites.abajo-12].map(y =>
    puntoEnPlano({ ...v, alto }, { x, y }, limites.width, limites.height, t.y).sub(v.centro).applyAxisAngle(vertical, -t.ang)))
  for (const eje of ejes) for (const signo of [-1, 1]) {
    const normal = eje.clone().multiplyScalar(signo)
    const radio = Math.abs(normal.x)*(t.w/2-.002) + Math.abs(normal.z)*(t.d/2-.002)
    const tope = radio - Math.min(...offsets.map(p => p.dot(normal)))
    const entrada = poligono
    poligono = []
    for (let i = 0; i < entrada.length; i++) {
      const a = entrada[i], b = entrada[(i+1)%entrada.length]
      const da = a.dot(normal)-tope, db = b.dot(normal)-tope
      if (da <= 1e-10) poligono.push(a)
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) poligono.push(a.clone().lerp(b, da/(da-db)))
    }
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
