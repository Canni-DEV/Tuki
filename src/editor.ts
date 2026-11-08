import { placedShapes } from './geometry'
import { objetosDeNivel, surfaceRect, vacio, conApoyos } from './levels'
import { bases, shapes } from './shapes'
import {
  pieceAsset, inventario, apoyosDe, esMando, esReceptor, type Conexion,
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
const radios = new Map<string, number>()
function radioDelActivo(asset: string) {
  const cached = radios.get(asset)
  if (cached !== undefined) return cached
  let radio = 0
  for (const shape of shapes(asset)) {
    let alcance = Math.hypot(...shape.size) / 2
    if (shape.points) {
      for (let i = 0; i < shape.points.length; i += 3)
        alcance = Math.max(alcance, Math.hypot(shape.points[i], shape.points[i + 1], shape.points[i + 2]))
    }
    radio = Math.max(radio, Math.hypot(...shape.at) + alcance)
  }
  radios.set(asset, radio)
  return radio
}
function apoyosFisicos(n: Nivel, p: PiezaColocada, detalle?: { pie?: number }): string[] {
  const surface = n.superficies.find(s => s.id === p.apoyo && s.admite.includes(p.tipo))
  if (!surface || !p.posicion.every(Number.isFinite) || !Number.isFinite(p.giroY)) return []
  const r = surfaceRect(n, p.apoyo), seat = surface.zona === 'asiento'
  const [x, y, z] = p.posicion
  if (Math.abs(y - r.y - (p.tipo === 'bolita' && !seat ? .008 : 0)) > epsilon) return []
  if (seat) return Math.hypot(x - r.x, z - r.z) <= epsilon ? [surface.id] : []
  const ang = p.giroY * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang)
  const candidatos = [surface, ...n.superficies.filter(o => o !== surface && o.zona === 'tapa' && o.admite.includes(p.tipo))]
    .map(o => ({ id: o.id, ...surfaceRect(n, o.id) })).filter(o => Math.abs(o.y - r.y) <= epsilon)
  const contactos = new Set<string>()
  const pies = p.tipo === 'bolita' ? [[[0, 0]]] : bases(pieceAsset(p.tipo))
  for (const [indice, pie] of pies.entries()) {
    const soporte = candidatos.find(o => pie.every(([u, v]) => {
      const dx = x + u * c + v * s - o.x, dz = z - u * s + v * c - o.z
      return Math.abs(dx * Math.cos(o.ang) - dz * Math.sin(o.ang)) <= o.w / 2 + epsilon &&
        Math.abs(dx * Math.sin(o.ang) + dz * Math.cos(o.ang)) <= o.d / 2 + epsilon
    }))
    if (!soporte) {
      if (detalle) detalle.pie = indice
      return []
    }
    contactos.add(soporte.id)
  }
  return contactos.has(p.apoyo) ? [...contactos].sort() : []
}
function registrarApoyos(n: Nivel, p: PiezaColocada, piezas: PiezaColocada[]): PiezaColocada {
  const apoyos = apoyosFisicos(conApoyos(n, piezas.filter(o => o.id !== p.id)), p)
  const { apoyos: anteriores, ...pose } = p
  return apoyos.length > 1 ? { ...pose, apoyos } : pose
}
export function validarPieza(n: Nivel, p: PiezaColocada, otras: PiezaColocada[], detalleChoque?: { objeto?: string }): string | null {
  n = conApoyos(n, otras.filter(o => o.id !== p.id))
  const surface = n.superficies.find(s => s.id === p.apoyo)
  if (!surface || !surface.admite.includes(p.tipo)) return 'Elegí un apoyo compatible'
  const [x, , z] = p.posicion
  const detalle: { pie?: number } = {}
  if (!apoyosFisicos(n, p, detalle).length) {
    if (p.tipo === 'embudo' && detalle.pie !== undefined)
      return 'Falta apoyo en la pata ' + (detalle.pie === 0 ? 'izquierda' : 'derecha')
    return 'Apoyá toda la base'
  }
  const asiento = surface.zona === 'asiento' ? surface.objeto : undefined
  if (p.tipo === 'estampa') return null
  const me = geometry(pieceAsset(p.tipo), p)
  const contenidos = new Set(otras.filter(o => o.tipo === 'bolita' && o.apoyo === p.id + '/apoyo' &&
    ['cuna', 'cunaClasica', 'balancin'].includes(p.tipo)).map(o => o.id))
  const others = [
    ...n.fijos.filter((o) => o.id !== asiento && o.activo !== 'stamp'),
    ...otras
      .filter((o) => o.id !== p.id && o.id !== asiento && !contenidos.has(o.id) && o.tipo !== 'estampa' && !n.fijos.some(f => f.id === o.id))
      .map((o) => ({ ...o, activo: pieceAsset(o.tipo), escala: undefined })),
  ]
  const radio = radioDelActivo(pieceAsset(p.tipo))
  for (const o of others) {
    const otroRadio = radioDelActivo(o.activo) * Math.max(...(o.escala ?? [1]))
    if (Math.hypot(x - o.posicion[0], z - o.posicion[2]) > radio + otroRadio + epsilon) continue
    for (const b of geometry(o.activo, o, o.escala))
      for (const m of me) {
        const contact = m.shape.contactShape(m.p, m.q, b.shape, b.p, b.q, 0)
        if (contact && contact.distance < -epsilon) {
          if (detalleChoque) detalleChoque.objeto = o.id
          if (p.tipo === 'embudo') {
            const nombre = ({ channel: 'la canaleta', cup: 'la taza', book: 'el libro', casebox: 'la caja' } as Record<string, string>)[o.activo] ?? 'otra pieza'
            const pie = me.indexOf(m) - (me.length - 2)
            return (pie < 0 ? 'El embudo' : pie === 0 ? 'La pata izquierda' : 'La pata derecha') + ' toca ' + nombre
          }
          return 'Separá las piezas'
        }
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
    } while (this.armado.piezas.some(p => p.id === id) || objetosDeNivel(this.nivel).some(p => p.id === id))
    return id
  }
  private guardar(piezas: PiezaColocada[], conexiones = this.armado.conexiones ?? []) {
    if (this.nivel.id === 'taller' && piezas.length > 100) return false
    const saldo = { ...this.nivel.inventario }
    for (const p of piezas) if (--saldo[p.tipo] < 0) return false
    this.historia.push(this.armado)
    this.armado = { ...this.armado, piezas, saldo, conexiones }
    return true
  }
  disponibles(t: TipoColocable) {
    return Math.min(this.armado.saldo[t], this.nivel.id === 'taller' ? 100 - this.armado.piezas.length : Infinity)
  }
  agregar(piezas: PiezaColocada[]) {
    if (!piezas.length) return false
    const next = [...this.armado.piezas]
    for (const p of piezas) {
      if (validarPieza(this.nivel, p, next)) return false
      next.push({ ...registrarApoyos(this.nivel, p, next), id: p.tipo === 'inicio' || p.tipo === 'meta' ? p.tipo : this.id() })
    }
    if (!this.guardar(next)) return false
    this.seleccion = next.at(-1)!.id
    return true
  }
  movimiento(p: PiezaColocada) {
    const actual = this.armado.piezas
    const old = actual.find(o => o.id === p.id)
    if (!old) return { piezas: [p], error: validarPieza(this.nivel, p, actual) }
    const family = new Set([p.id])
    for (let count = -1; count !== family.size;) {
      count = family.size
      for (const child of actual) if (apoyosDe(child).every(id => family.has(id.split('/')[0]))) family.add(child.id)
    }
    if (family.has(p.apoyo.split('/')[0])) return { piezas: [p], error: 'Elegí otro apoyo' }
    const angle = (p.giroY - old.giroY) * Math.PI / 180
    const piezas = actual.filter(o => family.has(o.id)).map(o => {
      if (o.id === p.id) return p
      const [x, y, z] = o.posicion.map((v, i) => v - old.posicion[i])
      const posicion: Vec3 = [p.posicion[0] + x * Math.cos(angle) + z * Math.sin(angle), p.posicion[1] + y,
      p.posicion[2] - x * Math.sin(angle) + z * Math.cos(angle)]
      return { ...o, posicion, giroY: o.giroY + p.giroY - old.giroY }
    })
    const next = [...actual.filter(o => !family.has(o.id)), ...piezas]
    const afectados = [p, ...piezas.filter(o => o.id !== p.id),
      ...actual.filter(o => !family.has(o.id) && apoyosDe(o).some(id => family.has(id.split('/')[0])))]
    const resueltos: PiezaColocada[] = []
    for (const pieza of afectados) {
      const candidatas = family.has(pieza.id) ? [pieza.apoyo] : apoyosDe(pieza)
      let error: string | null = null, resuelta: PiezaColocada | undefined
      for (const apoyo of candidatas) {
        const propuesta = { ...pieza, apoyo }
        error = validarPieza(this.nivel, propuesta, next)
        if (!error) { resuelta = registrarApoyos(this.nivel, propuesta, next); break }
      }
      if (!resuelta) return { piezas: afectados, error: error ?? 'Falta apoyo' }
      resueltos.push(resuelta)
    }
    return { piezas: resueltos, error: null }
  }
  mover(p: PiezaColocada) {
    const old = this.armado.piezas.find(o => o.id === p.id)
    if (!old || JSON.stringify(old) === JSON.stringify(p)) return false
    const move = this.movimiento(p)
    if (move.error) return false
    return this.guardar(this.armado.piezas.map(o => move.piezas.find(v => v.id === o.id) ?? o))
  }
  retirar() {
    if (!this.armado.piezas.some(p => p.id === this.seleccion)) return false
    if (this.armado.piezas.some(p => apoyosDe(p).includes(this.seleccion + '/apoyo'))) return false
    this.guardar(this.armado.piezas.filter((p) => p.id !== this.seleccion),
      this.armado.conexiones?.filter(c => c.mando !== this.seleccion && c.receptor !== this.seleccion))
    this.seleccion = null
    return true
  }
  conectar(mando: string, receptor: string) {
    if (this.nivel.id !== 'taller') return false
    const elegido = (id: string) => this.armado.piezas.find(p => p.id === id)?.tipo
    const a = elegido(mando), b = elegido(receptor)
    if (!a || !b || !esMando(a) || !esReceptor(b)) return false
    const cables = this.armado.conexiones ?? []
    const existe = cables.some(c => c.mando === mando && c.receptor === receptor)
    return this.guardar(this.armado.piezas, existe ? cables.filter(c => c.mando !== mando || c.receptor !== receptor) : [...cables, { mando, receptor }])
  }
  deshacer() {
    const anterior = this.historia.pop()
    if (!anterior) return
    this.armado = anterior
    if (!anterior.piezas.some((p) => p.id === this.seleccion)) this.seleccion = null
  }
  cargar(a: Armado) {
    const n = this.nivel,
      ids = new Set(objetosDeNivel(n).map(p => p.id)),
      saldo = { ...n.inventario }
    if (n.id === 'taller' && a.piezas.length > 100) throw new Error('Límite de 100 objetos')
    if (a.nivel !== n.id || a.revision !== n.revision || a.perfilFisico !== n.perfilFisico)
      throw new Error('Montaje de otra revisión')
    for (const p of a.piezas) {
      if (ids.has(p.id) || !tipos.includes(p.tipo) || --saldo[p.tipo] < 0)
        throw new Error('Montaje inválido: ' + p.id)
      const invalida = validarPieza(n, p, a.piezas)
      if (invalida) throw new Error(p.id + ' · ' + invalida)
      ids.add(p.id)
    }
    if (tipos.some((t) => saldo[t] !== (a.saldo[t] ?? 0))) throw new Error('Saldo de montaje inválido')
    const piezas = a.piezas.map(p => registrarApoyos(n, p, a.piezas))
    const conexiones: Conexion[] = a.conexiones ?? []
    if (n.id !== 'taller' && conexiones.length) throw new Error('Circuito instalado')
    const pares = new Set<string>()
    for (const { mando, receptor } of conexiones) {
      const m = piezas.find(p => p.id === mando), r = piezas.find(p => p.id === receptor)
      if (!m || !r || !esMando(m.tipo) || !esReceptor(r.tipo) || pares.has(mando + '/' + receptor)) throw new Error('Conexión inválida')
      pares.add(mando + '/' + receptor)
    }
    this.armado = structuredClone({ ...a, version: 2, piezas, conexiones, saldo: inventario(a.saldo) })
    this.historia = []
    this.seleccion = null
  }
  trazar(muestras: Vec3[], apoyo: string) {
    const piezas: PiezaColocada[] = [],
      saldo = this.disponibles('domino')
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
