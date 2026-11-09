import R from '@dimforge/rapier3d-compat'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import { volumeColliders, yaw } from './geometry'
import { objetosDeNivel } from './levels'
import { assemblies, partRotation, shapes } from './shapes'
import { pieceAsset, type Conexion, type ConexionInstalada, type Nivel, type PiezaColocada, type TipoColocable, type Vec3 } from './types'
import type { BodyPose } from './simulation'

export const radioCable = .001
const altura = radioCable + .00014
const identidad = new Quaternion(), cero = new Vector3(), unidad = new Vector3(1, 1, 1)
const esfera = new R.Ball(radioCable)
const salidas: Partial<Record<TipoColocable, [Vec3, Vec3]>> = {
  palanca: [[0, .0035, -.0168], [0, 0, -1]], boton: [[.0104, .0035, .003], [1, 0, 0]],
  puerta: [[-.0175, .006, -.009], [-1, 0, 0]], compuerta: [[-.039, .006, .0225], [0, 0, 1]],
  puente: [[.011, .006, -.0265], [0, 0, -1]],
}
export function borne(p: PiezaColocada) {
  const [punto, normal] = salidas[p.tipo]!, q = yaw(p.giroY)
  return { punto: new Vector3(...punto).applyQuaternion(q).add(new Vector3(...p.posicion)), normal: new Vector3(...normal).applyQuaternion(q) }
}

interface Primitiva { shape: R.Shape; p: Vector3; q: Quaternion; caja: Box3; inversa?: Quaternion; mitad?: Vector3 }
interface Cuerpo { id: string; caja: Box3; partes: Primitiva[] }
interface Plantilla { shape: R.Shape; p: Vector3; q: Quaternion; local: Box3; mitad?: Vector3 }
const plantillas = new Map<string, Plantilla[]>()
function plantilla(asset: string, scale: Vec3) {
  const key = [asset, ...scale].join('/')
  let lista = plantillas.get(key)
  if (!lista) {
    const desc = volumeColliders(asset, scale)
    lista = shapes(asset).map((s, i) => {
      const local = new Box3()
      if (s.points) {
        for (let k = 0; k < s.points.length; k += 3) local.expandByPoint(new Vector3(s.points[k] * scale[0], s.points[k + 1] * scale[1], s.points[k + 2] * scale[2]))
      } else {
        const half = new Vector3(...s.size).multiply(new Vector3(...scale)).multiplyScalar(.5)
        local.set(half.clone().negate(), half)
      }
      return { shape: desc[i].shape, local, mitad: s.kind === 'box' ? local.max : undefined, p: new Vector3().copy(desc[i].translation), q: new Quaternion().copy(desc[i].rotation) }
    })
    plantillas.set(key, lista)
  }
  return lista
}
function cuerpo(id: string, base: Plantilla[], punto: Vector3, giro: Quaternion): Cuerpo {
  const caja = new Box3()
  const partes = base.map(s => {
    const p = s.p.clone().applyQuaternion(giro).add(punto), q = giro.clone().multiply(s.q)
    const bounds = s.local.clone().applyMatrix4(new Matrix4().compose(p, q, unidad)).expandByScalar(radioCable)
    caja.union(bounds)
    return { shape: s.shape, p, q, caja: bounds, mitad: s.mitad, inversa: s.mitad ? q.clone().invert() : undefined }
  })
  return { id, partes, caja }
}
// The distance to a box along a segment is piecewise quadratic between crossings of its six face planes.
function tocaCaja(a: Vector3, b: Vector3, s: Primitiva) {
  const p = a.clone().sub(s.p).applyQuaternion(s.inversa!), d = b.clone().sub(a).applyQuaternion(s.inversa!)
  const h = s.mitad!, cortes = [0, 1]
  let entrada = 0, salida = 1
  for (const k of ['x', 'y', 'z'] as const) {
    const ancho = h[k] + radioCable
    if (Math.abs(d[k]) < 1e-12) {
      if (Math.abs(p[k]) > ancho) return false
      continue
    }
    const u = (-ancho - p[k]) / d[k], v = (ancho - p[k]) / d[k]
    entrada = Math.max(entrada, Math.min(u, v)); salida = Math.min(salida, Math.max(u, v))
    if (entrada > salida) return false
    for (const cara of [-h[k], h[k]]) {
      const t = (cara - p[k]) / d[k]
      if (t > 0 && t < 1) cortes.push(t)
    }
  }
  cortes.sort((u, v) => u - v)
  for (let i = 1; i < cortes.length; i++) {
    const t = (cortes[i - 1] + cortes[i]) / 2
    let lineal = 0, cuadratico = 0, constante = 0
    for (const k of ['x', 'y', 'z'] as const) {
      const medio = p[k] + t * d[k]
      if (Math.abs(medio) <= h[k]) continue
      const offset = p[k] - Math.sign(medio) * h[k]
      constante += offset * offset; lineal += offset * d[k]; cuadratico += d[k] * d[k]
    }
    const u = cuadratico ? Math.max(cortes[i - 1], Math.min(cortes[i], -lineal / cuadratico)) : t
    if (constante + u * (2 * lineal + u * cuadratico) <= radioCable ** 2) return true
  }
  return false
}
// Broad phase against the swept tube, then the actual oriented primitive. No physics world is involved.
function choca(a: Vector3, b: Vector3, objetos: Cuerpo[]) {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
  const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z)
  const cerca = (c: Box3) => maxX >= c.min.x && minX <= c.max.x && maxY >= c.min.y && minY <= c.max.y && maxZ >= c.min.z && minZ <= c.max.z
  const vel = new Vector3().subVectors(b, a)
  for (const o of objetos) if (cerca(o.caja)) for (const s of o.partes) if (cerca(s.caja)) {
    if (s.mitad) { if (tocaCaja(a, b, s)) return true; continue }
    if (vel.lengthSq() < 1e-15 ? esfera.intersectsShape(a, identidad, s.shape, s.p, s.q) :
      esfera.castShape(a, identidad, vel, s.shape, s.p, s.q, cero, 0, 1, true)) return true
  }
  return false
}

class Tapa {
  y: number
  constructor(readonly origen: Vector3, readonly q: Quaternion, readonly w: number, readonly d: number) { this.y = origen.y + altura }
  punto(x: number, z: number) { return new Vector3(x, altura, z).applyQuaternion(this.q).add(this.origen) }
  contiene(p: Vector3) {
    const v = p.clone().sub(this.origen).applyQuaternion(this.q.clone().invert())
    return Math.abs(v.x) <= this.w / 2 + .00002 && Math.abs(v.z) <= this.d / 2 + .00002
  }
}
interface Nodo { punto: Vector3; enlaces: Map<Nodo, Vector3[]> }
const largo = (p: Vector3[]) => p.reduce((n, v, i) => n + (i ? v.distanceTo(p[i - 1]) : 0), 0)
const limpio = (p: Vector3[]) => p.filter((v, i) => !i || v.distanceToSquared(p[i - 1]) > 1e-12)
export type Tendido = Vector3[][]

// Metadata lives as long as its cached world-space route; another edit can reuse that route.
const extremosOcultos = new WeakMap<Tendido, { inicio: Vector3; fin: Vector3; limites: Box3 }>()
export class SuperficiesCable {
  readonly limitesObjetos = new Map<string, Box3>()
  private tapas: Tapa[] = []
  private objetos: Cuerpo[] = []
  private nodos: Nodo[] = []
  private construido = false
  readonly dispositivos: Map<string, PiezaColocada>
  private moviles = new Map<string, { base: Plantilla[]; p: Vector3; q: Quaternion; radio: number }>()
  constructor(readonly nivel: Nivel, piezas: PiezaColocada[]) {
    this.dispositivos = new Map([...(nivel.instalacion?.dispositivos ?? []), ...piezas].map(p => [p.id, p]))
    for (const o of [...objetosDeNivel(nivel), ...piezas.map(p => ({ ...p, activo: pieceAsset(p.tipo), escala: undefined }))]) {
      const p = new Vector3(...o.posicion), q = yaw(o.giroY), escala: Vec3 = o.escala ?? [1, 1, 1]
      const agregar = (id: string, asset: string, pos: Vector3, rot: Quaternion) => {
        const base = plantilla(asset, escala), solido = cuerpo(id, base, pos, rot)
        this.objetos.push(solido)
        const limites = this.limitesObjetos.get(o.id) ?? new Box3()
        this.limitesObjetos.set(o.id, limites.union(solido.caja))
        const radio = solido.caja.getSize(new Vector3()).length() + solido.caja.getCenter(new Vector3()).distanceTo(pos)
        this.moviles.set(id, { base, p: pos, q: rot, radio })
      }
      if (assemblies[o.activo]) for (const s of assemblies[o.activo])
        agregar(o.id + '/' + s.key, s.asset, new Vector3(...s.at).applyQuaternion(q).add(p), q.clone().multiply(partRotation(s)))
      else agregar(o.id, o.activo, p, q)
      if (['table', 'book', 'casebox', 'pencilcase', 'spacer'].includes(o.activo)) {
        const s = shapes(o.activo)[0]
        this.tapas.push(new Tapa(p.clone().add(new Vector3(0, (s.at[1] + s.size[1] / 2) * escala[1], 0)), q, s.size[0] * escala[0], s.size[2] * escala[2]))
      }
    }
    this.tapas.sort((a, b) => b.y - a.y)
  }
  limitesRuta(ruta: Tendido) {
    return extremosOcultos.get(ruta)?.limites ?? new Box3().setFromPoints(ruta.flat()).expandByScalar(radioCable)
  }
  libre(a: Vector3, b = a) { return !choca(a, b, this.objetos) }
  private apoyo(p: Vector3) { return this.tapas.find(t => t.y <= p.y + .00004 && t.contiene(p)) }
  private sobreTapa(a: Vector3, b: Vector3) {
    if (Math.abs(a.y - b.y) > .00004 || !this.libre(a, b)) return false
    const planos = this.tapas.filter(t => Math.abs(t.y - a.y) < .00004)
    if (planos.some(t => t.contiene(a) && t.contiene(b))) return true
    const pasos = Math.ceil(a.distanceTo(b) / .003)
    for (let i = 0; i <= pasos; i++) if (!planos.some(t => t.contiene(a.clone().lerp(b, i / Math.max(1, pasos))))) return false
    return true
  }
  private nodo(punto: Vector3): Nodo {
    const n: Nodo = { punto, enlaces: new Map() }
    this.nodos.push(n)
    return n
  }
  private grafo() {
    if (this.construido) return
    this.construido = true
    for (const t of this.tapas) {
      // Both banks of each exposed edge are in the graph, even under an overhanging book.
      for (const eje of ['x', 'z'] as const) for (const signo of [-1, 1]) {
        const ancho = eje === 'x' ? t.w : t.d, lado = eje === 'x' ? t.d : t.w
        const pasos = Math.max(1, Math.ceil(lado / .018))
        for (let i = 0; i <= pasos; i++) {
          const u = (lado - .002) * (i / pasos - .5)
          const punto = (v: number) => eje === 'x' ? t.punto(signo * (ancho / 2 + v), u) : t.punto(u, signo * (ancho / 2 + v))
          const cima = punto(-.0003), salida = punto(.0024), pie = punto(.005)
          const inferior = this.tapas.find(s => s.y < t.y - .0001 && s.contiene(pie))
          if (!inferior) continue
          pie.y = inferior.y
          const desnivel = t.y - inferior.y
          const holgura = Math.min(.004, desnivel * .10)
          const curva = [cima, salida]
          for (let paso = 1; paso <= 8; paso++) {
            const u = paso / 8
            const centro = punto(.0024 + .0026 * u + holgura * Math.sin(Math.PI * u) ** 2)
            centro.y = t.y - desnivel * u * u * (3 - 2 * u)
            curva.push(centro)
          }
          if (curva.slice(1).some((p, i) => !this.libre(curva[i], p))) continue
          const a = this.nodo(cima), b = this.nodo(pie)
          a.enlaces.set(b, curva); b.enlaces.set(a, [...curva].reverse())
        }
      }
      // Tangent waypoints around footprints of individual parts, including the cup handle.
      for (const o of this.objetos) {
        const c = o.caja
        if (c.min.y > t.y || c.max.y < t.y) continue
        for (const x of [c.min.x - .0015, c.max.x + .0015]) for (const z of [c.min.z - .0015, c.max.z + .0015]) {
          const v = new Vector3(x, t.y, z)
          if (t.contiene(v) && this.libre(v)) this.nodo(v)
        }
      }
    }
  }
  private camino(a: Vector3, b: Vector3): Vector3[] {
    if (this.sobreTapa(a, b)) return [a, b]
    this.grafo()
    const inicio: Nodo = { punto: a, enlaces: new Map() }, fin: Nodo = { punto: b, enlaces: new Map() }
    const candidatos = [...this.nodos, fin]
    const abiertos = new Set([inicio]), coste = new Map([[inicio, 0]]), estimado = new Map([[inicio, a.distanceTo(b)]])
    const previo = new Map<Nodo, { desde: Nodo; curva: Vector3[] }>()
    while (abiertos.size) {
      let n!: Nodo, menor = Infinity
      for (const v of abiertos) if (estimado.get(v)! < menor) { menor = estimado.get(v)!; n = v }
      if (n === fin) {
        const tramos: Vector3[][] = []
        while (n !== inicio) { const e = previo.get(n)!; tramos.push(e.curva.slice(1)); n = e.desde }
        return [a, ...tramos.reverse().flat()]
      }
      abiertos.delete(n)
      for (const v of candidatos) {
        if (v === n) continue
        const salto = n.enlaces.get(v)
        if (!salto && Math.abs(v.punto.y - n.punto.y) > .00004) continue
        const g = coste.get(n)! + (salto ? largo(salto) : n.punto.distanceTo(v.punto))
        if (g >= (coste.get(v) ?? Infinity) - 1e-9 || (!salto && !this.sobreTapa(n.punto, v.punto))) continue
        coste.set(v, g); estimado.set(v, g + v.punto.distanceTo(b)); previo.set(v, { desde: n, curva: salto ?? [n.punto, v.punto] }); abiertos.add(v)
      }
    }
    return []
  }
  private salida(p: PiezaColocada) {
    const { punto, normal } = borne(p)
    let visible: Vector3[] = []
    for (let i = 0; i < 360; i++) {
      const v = punto.clone().addScaledVector(normal, .002 * i)
      if (!this.libre(v)) { visible = []; continue }
      if (visible.length && !this.libre(visible.at(-1)!, v)) visible = []
      visible.push(v)
      if (i < 2) continue
      const tapa = this.apoyo(v)
      if (!tapa && i <= 4 && visible.length) {
        // An outward-facing socket can overhang the tabletop. Turn around the housing lip.
        for (const ang of [Math.PI / 2, -Math.PI / 2]) {
          const lateral = normal.clone().applyAxisAngle(new Vector3(0, 1, 0), ang)
          for (const distancia of [.006, .012, .018, .024]) {
            const borde = v.clone().addScaledVector(lateral, distancia)
            if (!this.libre(v, borde)) continue
            for (const retorno of [0, .006, .012, .018, .024]) {
              const vuelta = borde.clone().addScaledVector(normal, -retorno)
              const apoyo = this.apoyo(vuelta)
              if (!apoyo || !this.libre(borde, vuelta)) continue
              const fin = vuelta.clone()
              fin.y = apoyo.y
              if (this.libre(vuelta, fin)) return limpio([visible[0], v, borde, vuelta, fin])
            }
          }
        }
      }
      if (tapa) {
        const pie = v.clone(); pie.y = tapa.y
        if (this.libre(v, pie)) return limpio([visible[0], v, pie])
      }
    }
    return []
  }
  trazar(c: Conexion | ConexionInstalada): Tendido {
    const a = this.dispositivos.get(c.mando), b = this.dispositivos.get(c.receptor)
    if (!a || !b) return []
    const entrada = this.salida(a), salida = this.salida(b)
    if (!entrada.length || !salida.length) return []
    const apoyos = [entrada.at(-1)!]
    if ('guias' in c) for (const guia of c.guias) {
      const o = this.nivel.fijos.find(p => p.id === guia.objeto)!
      // Local offsets are metres along the object's oriented axes, after model scaling.
      const p = new Vector3(...guia.local).applyQuaternion(yaw(o.giroY)).add(new Vector3(...o.posicion))
      p.y += altura
      if (this.libre(p) && this.apoyo(p)) apoyos.push(p)
    }
    const fin = salida.at(-1)!, puntos = [...entrada]
    for (const destino of [...apoyos.slice(1), fin]) {
      const tramo = this.camino(puntos.at(-1)!, destino)
      if (!tramo.length) {
        if (destino !== fin) continue
        const directo = this.camino(entrada.at(-1)!, fin)
        if (!directo.length) return []
        puntos.splice(0, puntos.length, ...entrada, ...directo.slice(1))
        break
      }
      puntos.push(...tramo.slice(1))
    }
    puntos.push(...salida.reverse().slice(1))
    const ruta = [this.redondear(limpio(puntos))]
    const inicio = borne(a).punto, extremo = borne(b).punto
    if (inicio.distanceToSquared(ruta[0][0]) > .003 ** 2 || extremo.distanceToSquared(ruta[0].at(-1)!) > .003 ** 2) {
      extremosOcultos.set(ruta, { inicio, fin: extremo, limites: new Box3().setFromPoints([...ruta[0], inicio, extremo]).expandByScalar(radioCable) })
    }
    return ruta
  }
  private redondear(p: Vector3[]) {
    const ruta: Vector3[] = [p[0]]
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], v = p[i], b = p[i + 1], radio = Math.min(.0025, v.distanceTo(a) * .35, v.distanceTo(b) * .35)
      const u = v.clone().lerp(a, radio / v.distanceTo(a)), w = v.clone().lerp(b, radio / v.distanceTo(b))
      const arco = [u, ...[.25, .5, .75].map(t => u.clone().lerp(v, t).lerp(v.clone().lerp(w, t), t)), w]
      if (arco.slice(1).every((pt, j) => this.libre(arco[j], pt))) ruta.push(...arco)
      else ruta.push(v)
    }
    ruta.push(p.at(-1)!)
    const suave = limpio(ruta)
    return suave.slice(1).every((v, i) => this.libre(suave[i], v)) ? suave : p
  }
  // Only intervals touched by a moving body are resampled. Once clear, reuse the exact rest route.
  ceder(ruta: Tendido, poses: Map<string, BodyPose>, limites: Box3): Tendido {
    const oculto = extremosOcultos.get(ruta)
    if (oculto) limites = oculto.limites
    const movidos: Cuerpo[] = [], ids = new Set<string>()
    for (const [id, pose] of poses) {
      const modelo = this.moviles.get(id)
      if (!modelo) continue
      const p = new Vector3(...pose.p), q = new Quaternion(...pose.q)
      if (p.distanceToSquared(modelo.p) < 1e-12 && 1 - Math.abs(q.dot(modelo.q)) < 1e-7) continue
      if (limites.distanceToPoint(modelo.p) <= modelo.radio) ids.add(id)
      if (limites.distanceToPoint(p) > modelo.radio) continue
      const solido = cuerpo(id, modelo.base, p, q)
      if (limites.intersectsBox(solido.caja)) { movidos.push(solido); ids.add(id) }
    }
    if (!movidos.length && !(oculto && ids.size)) return ruta
    const todos = [...this.objetos.filter(o => !ids.has(o.id)), ...movidos]
    if (oculto) {
      const puntos = ruta[0]
      const recuperar = (exterior: Vector3, extremo: Vector3) => {
        const pasos = Math.ceil(exterior.distanceTo(extremo) / .0005)
        let libre = exterior
        for (let j = 1; j <= pasos; j++) {
          const v = exterior.clone().lerp(extremo, j / pasos)
          if (choca(libre, v, todos)) break
          libre = v
        }
        return libre
      }
      const primero = recuperar(puntos[0], oculto.inicio), ultimo = recuperar(puntos.at(-1)!, oculto.fin)
      if (primero.distanceToSquared(puntos[0]) > 1e-8 || ultimo.distanceToSquared(puntos.at(-1)!) > 1e-8)
        ruta = [limpio([primero, ...puntos, ultimo])]
    }
    if (!ruta.some(t => t.slice(1).some((p, i) => choca(t[i], p, movidos)))) return ruta
    const resultado: Tendido = []
    for (const tira of ruta) {
      // Bound the affected interval in world space even for a long straight between two clips.
      const puntos = [tira[0]]
      for (let i = 1; i < tira.length; i++) {
        const a = tira[i - 1], b = tira[i]
        const pasos = choca(a, b, movidos) ? Math.ceil(a.distanceTo(b) / .002) : 1
        for (let j = 1; j <= pasos; j++) puntos.push(a.clone().lerp(b, j / pasos))
      }
      let parte: Vector3[] = this.libreEnPose(puntos[0], todos) ? [puntos[0]] : []
      for (let i = 1; i < puntos.length;) {
        if (!choca(puntos[i - 1], puntos[i], movidos)) { parte.push(puntos[i++]); continue }
        const inicio = i - 1
        while (i < puntos.length && choca(puntos[i - 1], puntos[i], movidos)) i++
        const a = puntos[inicio], b = puntos[i - 1]
        const tocados = movidos.filter(o => puntos.slice(inicio + 1, i).some((v, j) => choca(puntos[inicio + j], v, [o])))
        const desvio = parte.length && this.libreEnPose(b, todos) ? this.desviar(a, b, tocados, todos) : []
        if (desvio.length) parte.push(...desvio.slice(1))
        else {
          if (parte.length > 1) resultado.push(parte)
          parte = this.libreEnPose(b, todos) ? [b] : []
        }
      }
      if (parte.length > 1) resultado.push(parte)
    }
    return resultado
  }
  private libreEnPose(p: Vector3, objetos: Cuerpo[]) { return !choca(p, p, objetos) }
  private desviar(a: Vector3, b: Vector3, tocados: Cuerpo[], todos: Cuerpo[]) {
    // Resting on a horizontal surface, the cheapest free path skirts a fallen tile.
    // A rising leaf can also lift a short section. Keep both unaffected endpoints pinned.
    const nodos = [a, b]
    for (const { caja } of tocados) {
      for (const y of [a.y, b.y, caja.max.y + .0004]) for (const x of [caja.min.x - .0004, caja.max.x + .0004])
        for (const z of [caja.min.z - .0004, caja.max.z + .0004]) {
          const v = new Vector3(x, y, z)
          if (!choca(v, v, todos)) nodos.push(v)
        }
    }
    const costes = nodos.map(() => Infinity), anterior = nodos.map(() => -1), cerrados = new Set<number>()
    costes[0] = 0
    for (; ;) {
      let i = -1, menor = Infinity
      for (let j = 0; j < nodos.length; j++) if (!cerrados.has(j) && costes[j] < menor) { i = j; menor = costes[j] }
      if (i < 0) return []
      if (i === 1) {
        const ruta: Vector3[] = []
        while (i >= 0) { ruta.push(nodos[i]); i = anterior[i] }
        return ruta.reverse()
      }
      cerrados.add(i)
      for (let j = 0; j < nodos.length; j++) {
        const coste = menor + nodos[i].distanceTo(nodos[j]) + Math.abs(nodos[i].y - nodos[j].y)
        if (coste >= costes[j] || choca(nodos[i], nodos[j], todos)) continue
        costes[j] = coste; anterior[j] = i
      }
    }
  }
}
