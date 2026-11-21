import { configuracion, configuracionValida, configurable, type ConfiguracionDispositivo } from './dispositivos'
import { admiteVoladizo, baseCubierta, parches } from './contactos'
import { alturasCompatibles, SuperficiesTrazo, toleranciaAlturaTrazo } from './superficies-trazo'
import { ensayarEquilibrio, piezasParaEnsayo, type FalloEquilibrio } from './equilibrio'
import { placedShapes } from './geometry'
import { objetosDeNivel, surfaceRect, vacio, conApoyos, ofreceApoyo } from './levels'
import { bases, shapes } from './shapes'
import {
  esMesaLibre, puedeCablear, objetosInstalados, medidasMesa,
  pieceAsset, piezas as catalogo, inventario, apoyosDe, esMando, esReceptor, limitePiezasTaller, secuenciasValidas, type Secuencia, type Conexion,
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
type DestinoPieza = Pick<PiezaColocada, 'id' | 'apoyo' | 'posicion' | 'giroY'>
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
  if (admiteVoladizo(n,p)) {
    const ids = [...new Set(parches(n,p).map(c => c.apoyo))].sort()
    return ids.includes(p.apoyo) ? ids : []
  }
  const ang = p.giroY * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang)
  const candidatos = [surface, ...n.superficies.filter(o => o !== surface && o.zona === 'tapa' && o.admite.includes(p.tipo))]
    .map(o => ({ id: o.id, circular:o.circular, ...surfaceRect(n, o.id) })).filter(o => Math.abs(o.y - r.y) <= epsilon)
  const contactos = new Set<string>()
  const pies = p.tipo === 'bolita' ? [[[0, 0]]] : bases(pieceAsset(p.tipo, p.configuracion))
  let compartidos: ReturnType<typeof parches> | undefined
  for (const [indice, pie] of pies.entries()) {
    const soporte = candidatos.find(o => pie.every(([u, v]) => {
      const dx = x + u * c + v * s - o.x, dz = z - u * s + v * c - o.z
      if (o.circular) return Math.hypot(dx,dz) <= o.w/2 + epsilon
      return Math.abs(dx * Math.cos(o.ang) - dz * Math.sin(o.ang)) <= o.w / 2 + epsilon &&
        Math.abs(dx * Math.sin(o.ang) + dz * Math.cos(o.ang)) <= o.d / 2 + epsilon
    }))
    if (!soporte) {
      // A single foot can span several coplanar lids, for every solid asset.
      // Check each foot separately so a missing leg keeps its own diagnostic.
      if (p.tipo !== 'bolita') {
        compartidos ??= parches(n, p)
        if (baseCubierta(p, compartidos, indice)) {
          for (const c of compartidos) contactos.add(c.apoyo)
          continue
        }
      }
      if (detalle) detalle.pie = indice
      return []
    }
    contactos.add(soporte.id)
  }
  return contactos.has(p.apoyo) ? [...contactos].sort() : []
}
function registrarApoyos(superficies: Nivel, p: PiezaColocada): PiezaColocada {
  const apoyos = apoyosFisicos(superficies, p, undefined)
  if (apoyos.length <= 1 ? !p.apoyos : p.apoyos?.join('|') === apoyos.join('|')) return p
  const { apoyos: anteriores, ...pose } = p
  return apoyos.length > 1 ? { ...pose, apoyos } : pose
}
export function validarPieza(n: Nivel, p: PiezaColocada, otras: PiezaColocada[], detalleChoque?: { objeto?: string }): string | null {
  return validarSobre(conApoyos(n, otras.filter(o => o.id !== p.id)), p, otras, detalleChoque)
}
function validarSobre(n: Nivel, p: PiezaColocada, otras: PiezaColocada[], detalleChoque?: { objeto?: string }): string | null {
  if (!configuracionValida(p.tipo, p.configuracion)) return 'Configuración inválida'
  if (!puedeCablear(n) && !objetosInstalados(n).some(o=>o.id===p.id) && configuracion(p) && 'modo' in configuracion(p)! && (configuracion(p) as {modo:string}).modo !== 'automatico') return 'Este desafío admite dispositivos automáticos'
  const surface = n.superficies.find(s => s.id === p.apoyo)
  if (!surface || !surface.admite.includes(p.tipo)) return 'Elegí un apoyo compatible'
  const detalle: { pie?: number } = {}
  if (!apoyosFisicos(n, p, detalle).length) {
    if (admiteVoladizo(n,p)) return 'Acercá la base a una superficie de apoyo'
    if (p.tipo === 'embudo' && detalle.pie !== undefined)
      return 'Falta apoyo en la pata ' + (detalle.pie === 0 ? 'izquierda' : 'derecha')
    return 'Apoyá toda la base'
  }
  return colisionSobre(n, p, otras, detalleChoque)
}
function colisionSobre(n: Nivel, p: PiezaColocada, otras: PiezaColocada[], detalleChoque?: { objeto?: string }, ignorar = new Set<string>()): string | null {
  const [x, , z] = p.posicion
  const surface = n.superficies.find(s => s.id === p.apoyo)!
  const asiento = surface.zona === 'asiento' ? surface.objeto : undefined
  const me = geometry(pieceAsset(p.tipo, p.configuracion), p)
  // Only lift the virtual probe over a compatible step. Tall parts of the same
  // support (for example the elevator frame) must still obstruct the gesture.
  const sobreJunta = ignorar.size ? geometry(pieceAsset(p.tipo, p.configuracion),
    { ...p, posicion: [x, p.posicion[1] + toleranciaAlturaTrazo, z] }) : me
  const contenidos = new Set(otras.filter(o => o.tipo === 'bolita' && o.apoyo === p.id + '/apoyo' &&
    ['balancin', 'lanzador', 'retenedor'].includes(p.tipo)).map(o => o.id))
  const others = [
    ...n.fijos.filter((o) => o.id !== asiento && o.id !== p.id),
    ...otras
      .filter((o) => o.id !== p.id && o.id !== asiento && !contenidos.has(o.id) && !n.fijos.some(f => f.id === o.id))
      .map((o) => ({ ...o, activo: pieceAsset(o.tipo, o.configuracion), escala: undefined })),
  ]
  const radio = radioDelActivo(pieceAsset(p.tipo, p.configuracion))
  for (const o of others) {
    const otroRadio = radioDelActivo(o.activo) * Math.max(...(o.escala ?? [1]))
    if (Math.hypot(x - o.posicion[0], z - o.posicion[2]) > radio + otroRadio + epsilon) continue
    for (const b of geometry(o.activo, o, o.escala))
      for (const m of ignorar.has(o.id) ? sobreJunta : me) {
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
interface EstadoEdicion { armado: Armado; seleccion: string | null }

export class Editor {
  armado: Armado
  historia: EstadoEdicion[] = []
  futuro: EstadoEdicion[] = []
  seleccion: string | null = null
  private numero = 0
  fallo: FalloEquilibrio | null = null
  constructor(readonly nivel: Nivel, private diferirEquilibrio = false) {
    this.armado = vacio(nivel)
  }
  id() {
    let id: string
    do {
      id = 'pieza-' + ++this.numero
    } while (this.armado.piezas.some(p => p.id === id) || objetosDeNivel(this.nivel).some(p => p.id === id))
    return id
  }
  private guardar(piezas: PiezaColocada[], conexiones = this.armado.conexiones ?? [], reglas = this.armado.secuencias ?? []) {
    if (piezas.length + (this.nivel.objetos?.length ?? 0) > limitePiezasTaller) return false
    const saldo = { ...this.nivel.inventario }
    for (const p of piezas) if (--saldo[p.tipo] < 0) return false
    if (esMesaLibre(this.nivel) || this.nivel.objetos) {
      // A support can slide under an existing bridge without being an old parent.
      const nuevasTapas = piezas.some(p => !this.armado.piezas.includes(p) && ofreceApoyo(p.tipo))
      if (nuevasTapas) {
        const superficies = conApoyos(this.nivel, piezas)
        piezas = piezas.map(p => registrarApoyos(superficies, p))
      }
      if (!this.diferirEquilibrio) {
        this.fallo = ensayarEquilibrio(this.nivel.objetos ? [...this.nivel.objetos, ...piezas] : piezasParaEnsayo(piezas,this.armado), medidasMesa(this.nivel))
        if (this.fallo) return false
      }
    }
    this.registrar()
    const secuencias: Secuencia[] = []
    for (const regla of reglas) {
      const conectados = conexiones.filter(c => c.receptor === regla.receptor).map(c => c.mando)
      if (conectados.length < 2) continue
      const mandos = [...regla.mandos.filter(id => conectados.includes(id)), ...conectados.filter(id => !regla.mandos.includes(id))]
      secuencias.push({ receptor: regla.receptor, mandos })
    }
    this.armado = { ...this.armado, version: 5,
      piezas, saldo, conexiones, secuencias: secuencias.length ? secuencias : undefined }
    return true
  }
  async editarValidado(operacion: (e: Editor) => boolean,
    ensayo: (p: PiezaColocada[]) => Promise<FalloEquilibrio|null>, vigente: () => boolean) {
    this.fallo = null
    const origen = this.armado, borrador = new Editor(this.nivel,true)
    borrador.armado = origen; borrador.seleccion = this.seleccion; borrador.numero = this.numero
    if (!operacion(borrador)) { this.fallo = borrador.fallo; return false }
    const fallo = await ensayo(this.nivel.objetos ? [...this.nivel.objetos, ...borrador.armado.piezas] : piezasParaEnsayo(borrador.armado.piezas,origen))
    if (!vigente() || this.armado !== origen) return false
    this.fallo = fallo
    if (fallo) return false
    this.registrar()
    this.armado = borrador.armado; this.seleccion = borrador.seleccion; this.numero = borrador.numero
    return true
  }
  disponibles(t: TipoColocable) {
    return Math.min(this.armado.saldo[t], limitePiezasTaller - this.armado.piezas.length - (this.nivel.objetos?.length ?? 0))
  }
  agregar(piezas: PiezaColocada[]) {
    if (!piezas.length) return false
    const next = [...this.armado.piezas]
    const numeroAnterior = this.numero
    for (const propuesta of piezas) {
      const id = propuesta.tipo === 'inicio' || propuesta.tipo === 'meta' ? propuesta.tipo : this.id()
      const p = { ...propuesta, id }
      const superficies = conApoyos(this.nivel, next)
      if (validarSobre(superficies, p, next)) { this.numero = numeroAnterior; return false }
      next.push(registrarApoyos(superficies, p))
    }
    if (!this.guardar(next)) { this.numero = numeroAnterior; return false }
    this.seleccion = next.at(-1)!.id
    return true
  }
  movimiento(destino: DestinoPieza) {
    const actual = this.armado.piezas
    const old = actual.find(o => o.id === destino.id)
    if (!old) return { piezas: [], error: 'Elegí una pieza' }
    // A move changes only the pose. Support contacts are resolved below using
    // the placed piece's real shape and configuration, including seating a ball.
    const { apoyo, posicion, giroY } = destino
    const p = { ...old, apoyo, posicion, giroY }
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
    const superficies = conApoyos(this.nivel, next)
    const resueltos: PiezaColocada[] = []
    for (const pieza of afectados) {
      const candidatas = family.has(pieza.id) ? [pieza.apoyo] : apoyosDe(pieza)
      let error: string | null = null, resuelta: PiezaColocada | undefined
      for (const apoyo of candidatas) {
        const propuesta = { ...pieza, apoyo }
        error = validarSobre(superficies, propuesta, next)
        if (!error) { resuelta = registrarApoyos(superficies, propuesta); break }
      }
      if (!resuelta) return { piezas: afectados, error: error ?? 'Falta apoyo' }
      resueltos.push(resuelta)
    }
    return { piezas: resueltos, error: null }
  }
  mover(p: DestinoPieza) {
    const old = this.armado.piezas.find(o => o.id === p.id)
    if (!old || (old.apoyo === p.apoyo && old.giroY === p.giroY && old.posicion.every((v, i) => v === p.posicion[i]))) return false
    const move = this.movimiento(p)
    if (move.error) return false
    return this.guardar(this.armado.piezas.map(o => move.piezas.find(v => v.id === o.id) ?? o))
  }
  retirar() {
    if (!this.armado.piezas.some(p => p.id === this.seleccion)) return false
    const resto = this.armado.piezas.filter(p => p.id !== this.seleccion)
    for (const [i,p] of resto.entries()) {
      if (!apoyosDe(p).includes(this.seleccion + '/apoyo')) continue
      if (!esMesaLibre(this.nivel) && !this.nivel.objetos) {
        this.fallo = {pieza:p.id,mensaje:'Despejá primero el apoyo.'}
        return false
      }
      const alterno = apoyosDe(p).filter(id => id !== this.seleccion + '/apoyo')
        .find(apoyo => !validarPieza(this.nivel,{...p,apoyo},resto))
      if (!alterno) {
        this.fallo = {pieza:p.id,mensaje:catalogo[p.tipo][1] + ' necesita ese apoyo.'}
        return false
      }
      resto[i] = registrarApoyos(conApoyos(this.nivel,resto),{...p,apoyo:alterno})
    }
    if (!this.guardar(resto,this.armado.conexiones?.filter(c => c.mando !== this.seleccion && c.receptor !== this.seleccion))) return false
    this.seleccion = null
    return true
  }
  retirarTodas() {
    if (!this.armado.piezas.length && !this.armado.conexiones?.length) return false
    if (!this.guardar([], [], [])) return false
    this.seleccion = null
    this.fallo = null
    return true
  }
  configurarDispositivo(id: string, valor: ConfiguracionDispositivo) {
    const p = this.armado.piezas.find(p => p.id === id)
    if (!p || !configurable(p.tipo) || !configuracionValida(p.tipo, valor)) return false
    const propuesta = { ...p, configuracion: structuredClone(valor) }
    const superficies = conApoyos(this.nivel, this.armado.piezas.filter(o => o.id !== id))
    if (validarSobre(superficies, propuesta, this.armado.piezas)) return false
    const c = configuracion(propuesta)
    if (c && 'modo' in c && c.modo === 'automatico' && ['lanzador','retenedor'].includes(p.tipo) &&
        this.armado.piezas.some(o => o.apoyo === id + '/apoyo')) return false
    const resuelta = registrarApoyos(superficies, propuesta)
    return this.guardar(this.armado.piezas.map(o => o.id === id ? resuelta : o),
      c && 'modo' in c && c.modo === 'automatico' ? (this.armado.conexiones ?? []).filter(x => x.receptor !== id) : this.armado.conexiones)
  }
  configurarSecuencia(receptor: string, mandos: string[] | null) {
    if (!esMesaLibre(this.nivel)) return false
    const cables = this.armado.conexiones ?? []
    const reglas = (this.armado.secuencias ?? []).filter(r => r.receptor !== receptor)
    if (mandos) reglas.push({ receptor, mandos })
    if (!secuenciasValidas(reglas, cables)) return false
    return this.guardar(this.armado.piezas, cables, reglas)
  }
  conectar(mando: string, receptor: string) {
    if (!puedeCablear(this.nivel)) return false
    if (this.nivel.instalacion?.conexiones.some(c => c.mando === mando && c.receptor === receptor)) return false
    const objetos = [...objetosInstalados(this.nivel), ...this.armado.piezas]
    const elegido = (id: string) => objetos.find(p => p.id === id)?.tipo
    const a = elegido(mando), b = elegido(receptor)
    const salida = objetos.find(p => p.id === receptor)
    const config = salida && configuracion(salida)
    if (config && 'modo' in config && config.modo !== 'cable') return false
    if (!a || !b || !esMando(a) || !esReceptor(b)) return false
    const cables = this.armado.conexiones ?? []
    const existe = cables.some(c => c.mando === mando && c.receptor === receptor)
    return this.guardar(this.armado.piezas, existe ? cables.filter(c => c.mando !== mando || c.receptor !== receptor) : [...cables, { mando, receptor }])
  }
  deshacer() {
    const anterior = this.historia.pop()
    if (!anterior) return
    this.futuro.push(this.estadoEdicion())
    this.restaurar(anterior)
  }
  rehacer() {
    const siguiente = this.futuro.pop()
    if (!siguiente) return
    this.historia.push(this.estadoEdicion())
    this.restaurar(siguiente)
  }
  private estadoEdicion(): EstadoEdicion {
    return { armado: this.armado, seleccion: this.seleccion }
  }
  private registrar() {
    this.historia.push(this.estadoEdicion())
    this.futuro = []
  }
  private restaurar(estado: EstadoEdicion) {
    this.armado = estado.armado
    this.seleccion = estado.armado.piezas.some(p => p.id === estado.seleccion) ? estado.seleccion : null
    this.fallo = null
  }
  cargar(a: Armado, equilibrioComprobado = false) {
    const n = this.nivel,
      ids = new Set(objetosDeNivel(n).map(p => p.id)),
      saldo = { ...n.inventario }
    if (a.piezas.length + (n.objetos?.length ?? 0) > limitePiezasTaller) throw new Error(`Límite de ${limitePiezasTaller} objetos`)
    if (a.version !== 5 || a.nivel !== n.id || a.revision !== n.revision || a.perfilFisico !== n.perfilFisico)
      throw new Error('Montaje de otra revisión')
    for (const p of a.piezas) {
      if (ids.has(p.id) || !tipos.includes(p.tipo) || !configuracionValida(p.tipo,p.configuracion) || --saldo[p.tipo] < 0)
        throw new Error('Montaje inválido: ' + p.id)
      ids.add(p.id)
    }
    const superficies = conApoyos(n, a.piezas)
    for (const p of a.piezas) {
      const invalida = validarSobre(superficies, p, a.piezas, undefined)
      if (invalida) throw new Error(p.id + ' · ' + invalida)
    }
    if (tipos.some((t) => saldo[t] !== (a.saldo[t] ?? 0))) throw new Error('Saldo de montaje inválido')
    const piezas = a.piezas.map(p => registrarApoyos(superficies, p))
    if (!equilibrioComprobado && (esMesaLibre(n) || n.objetos)) {
      const fallo = ensayarEquilibrio(n.objetos ? [...n.objetos, ...piezas] : piezasParaEnsayo(piezas), medidasMesa(n))
      if (fallo) throw new Error(fallo.pieza + ' · ' + fallo.mensaje)
    }
    const conexiones: Conexion[] = a.conexiones ?? []
    if (!puedeCablear(n) && conexiones.length) throw new Error('Circuito instalado')
    const pares = new Set<string>((n.instalacion?.conexiones ?? []).map(c => c.mando + '/' + c.receptor))
    const conectables = [...objetosInstalados(n), ...piezas]
    for (const { mando, receptor } of conexiones) {
      const m = conectables.find(p => p.id === mando), r = conectables.find(p => p.id === receptor)
      if (!m || !r || !esMando(m.tipo) || !esReceptor(r.tipo) || pares.has(mando + '/' + receptor)) throw new Error('Conexión inválida')
      const config = configuracion(r)
      if (config && 'modo' in config && config.modo !== 'cable') throw new Error('El receptor debe estar configurado por cable')
      pares.add(mando + '/' + receptor)
    }
    if (a.secuencias?.length && (!esMesaLibre(n) || !secuenciasValidas(a.secuencias, conexiones)))
      throw new Error('Secuencia inválida')
    this.armado = structuredClone({ ...a, version: 5, piezas, conexiones, saldo: inventario(saldo) })
    this.historia = []
    this.futuro = []
    this.seleccion = null
  }
  trazar(muestras: Vec3[], apoyo: string) {
    const piezas: PiezaColocada[] = [],
      saldo = this.disponibles('domino')
    // Preview dominoes never add supports. Reuse the expanded scenario throughout
    // this gesture evaluation instead of rebuilding it for every 4 mm probe.
    const superficies = conApoyos(this.nivel, this.armado.piezas)
    const recorridoSobre = new SuperficiesTrazo(superficies)
    const inicial = recorridoSobre.tapas.find(s => s.id === apoyo)
    if (!inicial) return { piezas, error: 'Elegí un apoyo compatible' }
    let altura = inicial.y
    let error: string | null = null
    const raw: Vec3[] = []
    const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])
    for (const p of muestras) if (!raw.length || dist(p, raw.at(-1)!) >= 0.002) raw.push(p)
    if (raw.length < 2) return { piezas, error, altura }
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
    let aplazado: number | null = null, errorJunta: string | null = null
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i],
        d = dist(a, b)
      if (!d) continue
      const giroY = (Math.atan2(b[0] - a[0], b[2] - a[2]) * 180) / Math.PI
      const cortes = recorridoSobre.cortes(a, b).map(t => t * d)
      let corte = 0
      // Probe the entire segment so a fast drag cannot jump an obstruction between domino centres.
      for (let t = 0; t <= d + 1e-8; ) {
        if (piezas.length >= saldo) return { piezas, error: 'Límite de fichas' }
        const posicion: Vec3 = [a[0] + ((b[0] - a[0]) * t) / d, altura, a[2] + ((b[2] - a[2]) * t) / d]
        const superficie = recorridoSobre.en(posicion)
        if (!superficie) return { piezas, error: 'Falta superficie de apoyo' }
        if (!alturasCompatibles(superficie.y, altura)) return { piezas, error: 'El desnivel supera los 2 mm' }
        altura = posicion[1] = superficie.y
        const p: PiezaColocada = { tipo: 'domino', id: '@fila-' + piezas.length, apoyo: superficie.id, posicion, giroY }
        // A virtual foot may straddle a small step between actual domino centres.
        // Check obstacles throughout, but require full support only for placed pieces.
        const transicion = new Set(recorridoSobre.tapas.filter(s => alturasCompatibles(s.y, altura)).map(s => s.objeto))
        const obstaculo: { objeto?: string } = {}
        error = colisionSobre(superficies, p, this.armado.piezas, obstaculo, transicion)
        if (error) return { piezas, error: recorridoSobre.tapas.some(s => s.objeto === obstaculo.objeto && !alturasCompatibles(s.y, altura))
          ? 'El desnivel supera los 2 mm' : error }
        if (recorrido + t >= siguiente - 1e-8) {
          const choque: { objeto?: string } = {}
          error = validarSobre(superficies, p, [...this.armado.piezas, ...piezas], choque)
          if (error) {
            if (error !== 'Apoyá toda la base' && !(choque.objeto && transicion.has(choque.objeto))) return { piezas, error }
            aplazado ??= recorrido + t
            // At most one domino thickness (8 mm), never an unbounded gap in the row.
            if (recorrido + t - aplazado >= .008 - 1e-8) return { piezas, error }
            errorJunta = error
            siguiente = recorrido + t + .001
          } else {
            piezas.push(registrarApoyos(superficies, p))
            aplazado = null; errorJunta = null
            siguiente = recorrido + t + perfil.separacion
          }
        }
        if (t >= d) break
        while (corte < cortes.length && cortes[corte] <= t + 1e-10) corte++
        t = Math.min(t + 0.004, d, siguiente - recorrido, cortes[corte] ?? d)
      }
      recorrido += d
    }
    return { piezas, error: piezas.length === saldo ? 'Límite de fichas' : errorJunta, altura }
  }
}
