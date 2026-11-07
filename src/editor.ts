import { placedShapes } from './geometry'
import { surfaceRect, vacio } from './levels'
import { shapes } from './shapes'
import {
  pieceAsset,
  perfil,
  tipos,
  type Armado,
  type Nivel,
  type PiezaColocada,
  type Vec3,
  type TipoColocable,
} from './types'
import type { Pose } from './types'

type Placed = ReturnType<typeof placedShapes>
const boundsCache = new Map<string, Placed>()
const epsilon = 0.00012
function geometry(asset: string, pose: Pose, scale?: Vec3) {
  const key = [asset, ...pose.posicion, pose.giroY, ...(scale ?? [])].join('|')
  let result = boundsCache.get(key)
  if (!result) {
    result = placedShapes(asset, pose, scale)
    if (boundsCache.size > 500) boundsCache.clear()
    boundsCache.set(key, result)
  }
  return result
}
function footprint(tipo: TipoColocable) {
  if (tipo === 'bolita') return [[0, 0]]
  const all = shapes(pieceAsset(tipo))
  const feet = tipo === 'embudo' ? all.filter((s) => s.kind === 'box') : all.slice(0, 1)
  return feet.flatMap((s) =>
    [-1, 1].flatMap((i) =>
      [-1, 1].map((j) => [s.at[0] + (i * s.size[0]) / 2, s.at[2] + (j * s.size[2]) / 2]),
    ),
  )
}
export function validarPieza(n: Nivel, p: PiezaColocada, otras: PiezaColocada[]): string | null {
  const surface = n.superficies.find((s) => s.id === p.apoyo)
  if (!surface || !surface.admite.includes(p.tipo)) return 'Volvé a la mesa'
  const r = surfaceRect(n, p.apoyo),
    a = (p.giroY * Math.PI) / 180
  const [x, y, z] = p.posicion
  const seat = surface.zona === 'asiento'
  const h = r.y + (p.tipo === 'bolita' && !seat ? 0.008 : 0)
  if (
    !p.posicion.every(Number.isFinite) ||
    !Number.isFinite(p.giroY) ||
    Math.abs(y - h) > epsilon ||
    (seat && Math.hypot(x - r.x, z - r.z) > epsilon)
  )
    return 'Apoyá toda la base'
  for (const [u, v] of footprint(p.tipo)) {
    const dx = x - r.x + u * Math.cos(a) + v * Math.sin(a),
      dz = z - r.z - u * Math.sin(a) + v * Math.cos(a)
    if (
      Math.abs(dx * Math.cos(r.ang) - dz * Math.sin(r.ang)) > r.w / 2 + epsilon ||
      Math.abs(dx * Math.sin(r.ang) + dz * Math.cos(r.ang)) > r.d / 2 + epsilon
    )
      return 'Apoyá toda la base'
  }
  const me = geometry(pieceAsset(p.tipo), p)
  const others = [
    ...n.fijos.filter((o) => o.id !== surface.objeto),
    ...otras
      .filter((o) => o.id !== p.id)
      .map((o) => ({ ...o, activo: pieceAsset(o.tipo), escala: undefined })),
  ]
  for (const o of others) {
    // The only large assets are table/books; small pieces can be rejected cheaply in world space.
    if (
      !['table', 'book', 'channel', 'cup'].includes(o.activo) &&
      !o.escala &&
      Math.hypot(x - o.posicion[0], z - o.posicion[2]) > 0.135
    )
      continue
    for (const b of geometry(o.activo, o, o.escala))
      for (const m of me) {
        const contact = m.shape.contactShape(m.p, m.q, b.shape, b.p, b.q, 0)
        if (contact && contact.distance < -epsilon) return 'Separá las piezas'
      }
  }
  return null
}
export class Editor {
  armado: Armado
  historia: Armado[] = []
  seleccion: string | null = null
  private numero = 0
  constructor(readonly nivel: Nivel) {
    this.armado = vacio(nivel)
  }
  id() {
    let id: string
    do {
      id = 'pieza-' + ++this.numero
    } while (this.armado.piezas.some((p) => p.id === id))
    return id
  }
  private guardar(piezas: PiezaColocada[]) {
    const saldo = { ...this.nivel.inventario }
    for (const p of piezas) if (--saldo[p.tipo] < 0) return false
    this.historia.push(this.armado)
    this.armado = { ...this.armado, piezas, saldo }
    return true
  }
  agregar(piezas: PiezaColocada[]) {
    if (!piezas.length) return false
    const next = [...this.armado.piezas]
    for (const p of piezas) {
      if (validarPieza(this.nivel, p, next)) return false
      next.push({ ...p, id: this.id() })
    }
    if (!this.guardar(next)) return false
    this.seleccion = next.at(-1)!.id
    return true
  }
  mover(p: PiezaColocada) {
    const old = this.armado.piezas.find((o) => o.id === p.id)
    if (!old || validarPieza(this.nivel, p, this.armado.piezas) || JSON.stringify(old) === JSON.stringify(p))
      return false
    return this.guardar(this.armado.piezas.map((o) => (o.id === p.id ? p : o)))
  }
  retirar() {
    if (!this.armado.piezas.some((p) => p.id === this.seleccion)) return false
    this.guardar(this.armado.piezas.filter((p) => p.id !== this.seleccion))
    this.seleccion = null
    return true
  }
  deshacer() {
    const anterior = this.historia.pop()
    if (!anterior) return
    this.armado = anterior
    if (!anterior.piezas.some((p) => p.id === this.seleccion)) this.seleccion = null
  }
  cargar(a: Armado) {
    const n = this.nivel,
      ids = new Set(n.fijos.map((p) => p.id)),
      saldo = { ...n.inventario }
    if (a.nivel !== n.id || a.revision !== n.revision || a.perfilFisico !== n.perfilFisico)
      throw new Error('Montaje de otra revisión')
    for (const p of a.piezas) {
      if (ids.has(p.id) || !tipos.includes(p.tipo) || --saldo[p.tipo] < 0)
        throw new Error('Montaje inválido: ' + p.id)
      const invalida = validarPieza(n, p, a.piezas)
      if (invalida) throw new Error(p.id + ' · ' + invalida)
      ids.add(p.id)
    }
    if (tipos.some((t) => saldo[t] !== a.saldo[t])) throw new Error('Saldo de montaje inválido')
    this.armado = structuredClone(a)
    this.historia = []
    this.seleccion = null
  }
  trazar(muestras: Vec3[], apoyo: string) {
    const piezas: PiezaColocada[] = [],
      saldo = this.armado.saldo.domino
    let error: string | null = null
    const raw: Vec3[] = []
    const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])
    for (const p of muestras) if (!raw.length || dist(p, raw.at(-1)!) >= 0.002) raw.push(p)
    if (raw.length < 2) return { piezas, error }
    const pts = raw.map(
      (p, i): Vec3 =>
        i === 0 || i === raw.length - 1
          ? p
          : [
              (raw[i - 1][0] + 2 * p[0] + raw[i + 1][0]) / 4,
              p[1],
              (raw[i - 1][2] + 2 * p[2] + raw[i + 1][2]) / 4,
            ],
    )
    let recorrido = 0,
      siguiente = 0
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        d = dist(a, b)
      if (!d) continue
      const giroY = (Math.atan2(b[0] - a[0], b[2] - a[2]) * 180) / Math.PI
      // Probe the entire segment so a fast drag cannot jump an obstruction between domino centres.
      for (let t = 0; t <= d + 1e-8; ) {
        if (piezas.length >= saldo) return { piezas, error: 'Límite de fichas' }
        const posicion: Vec3 = [a[0] + ((b[0] - a[0]) * t) / d, a[1], a[2] + ((b[2] - a[2]) * t) / d]
        const p: PiezaColocada = { tipo: 'domino', id: 'preview-' + piezas.length, apoyo, posicion, giroY }
        const colocar = Math.abs(recorrido + t - siguiente) < 1e-7
        error = validarPieza(this.nivel, p, colocar ? [...this.armado.piezas, ...piezas] : this.armado.piezas)
        if (error) return { piezas, error }
        if (colocar) {
          piezas.push(p)
          siguiente += perfil.separacion
        }
        if (t >= d) break
        t = Math.min(t + 0.004, d, siguiente - recorrido)
      }
      recorrido += d
    }
    return { piezas, error: piezas.length === saldo ? 'Límite de fichas' : null }
  }
}
