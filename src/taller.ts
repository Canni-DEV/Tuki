import { Editor } from './editor'
import { inventario, apoyosDe, limitePiezasTaller, type Conexion, perfil, piezas, tipos, type Armado, type IdNivel, type Nivel, type PiezaColocada, type TipoColocable } from './types'

export interface DocumentoMesa {
  version: 1 | 2
  conexiones?: Conexion[]
  nombre: string
  perfilFisico: string
  piezas: PiezaColocada[]
}
export interface Creacion { id: string; mesa: DocumentoMesa }
export const faltantes = (mesa: DocumentoMesa, completados: IdNivel[]) =>
  [...new Set(mesa.piezas.filter(p => !permiteTipo(p.tipo, completados)).map(p => piezas[p.tipo][2]))]

export function nivelTaller(nombre: string): Nivel {
  const saldo = inventario()
  for (const tipo of tipos) saldo[tipo] = tipo === 'inicio' || tipo === 'meta' ? 1 : limitePiezasTaller
  return {
    version: 1, revision: 1, id: 'taller', nombre, objetivo: 'Armá tu recorrido en la mesa.', perfilFisico: perfil.id, requiere: 'recta',
    inventario: saldo, fijos: [{ id: 'mesa', activo: 'table', rol: 'escenario', posicion: [0, 0, 0], giroY: 0, escala: [2, 1, 2], apoyo: null }],
    superficies: [{ id: 'tablero', objeto: 'mesa', zona: 'tapa', admite: tipos }],
    camara: { objetivo: [0, .03, 0], azimut: 16, elevacion: 48, altoVisible: .54 },
    empujon: { pieza: 'inicio', impulsoLocal: [0, 0, .003], puntoLocal: [0, .04, 0] },
  }
}
export const mesaNueva = (nombre: string): DocumentoMesa => ({ version: 2, nombre, perfilFisico: perfil.id, piezas: [], conexiones: [] })
export function armadoDeMesa(nivel: Nivel, mesa: DocumentoMesa): Armado {
  const saldo = { ...nivel.inventario }
  for (const p of mesa.piezas) saldo[p.tipo]--
  return { nivel: 'taller', revision: 1, perfilFisico: mesa.perfilFisico, piezas: mesa.piezas, conexiones: mesa.conexiones ?? [], version: 2, saldo }
}
export function leerMesa(data: unknown): DocumentoMesa {
  const invalid = (): never => { throw new Error('Archivo de mesa inválido o incompatible.') }
  type PiezaDeArchivo = Omit<PiezaColocada, 'tipo'> & { tipo: TipoColocable | 'estampa' }
  const m = data as Partial<Omit<DocumentoMesa, 'piezas'> & { piezas: PiezaDeArchivo[] }> | null
  if (!m || (m.version !== 1 && m.version !== 2) || m.perfilFisico !== perfil.id || typeof m.nombre !== 'string' ||
    !m.nombre.trim() || m.nombre.length > 80 || !Array.isArray(m.piezas)) return invalid()
  if (m.piezas.length > limitePiezasTaller) throw new Error(`Límite de ${limitePiezasTaller} objetos`)
  const ids = new Set<string>(['mesa', 'tablero'])
  const mesa = mesaNueva(m.nombre.trim())
  for (const item of m.piezas) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
      typeof item.apoyo !== 'string' || !Array.isArray(item.posicion) ||
      item.posicion.length !== 3 || !item.posicion.every(Number.isFinite) || !Number.isFinite(item.giroY)) return invalid()
    for (const rol of ['inicio', 'meta']) if ((item.id === rol) !== (item.tipo === rol)) return invalid()
    ids.add(item.id)
    if (item.apoyos !== undefined && (!Array.isArray(item.apoyos) || !item.apoyos.length || item.apoyos.some(id => typeof id !== 'string') || !item.apoyos.includes(item.apoyo))) return invalid()
    if (item.tipo === 'estampa') continue
    if (!tipos.includes(item.tipo)) return invalid()
    const tipo = m.version === 1 && item.tipo === 'puente' ? 'puenteClasico' : m.version === 1 && item.tipo === 'cuna' ? 'cunaClasica' : item.tipo
    mesa.piezas.push({ id: item.id, tipo, ...(item.apoyos ? { apoyos: [...item.apoyos] } : {}), apoyo: item.apoyo, posicion: [...item.posicion], giroY: item.giroY % 360 })
  }
  const byId = new Map(mesa.piezas.map(p => [p.id, p]))
  const terminados = new Set<string>()
  function comprobar(p: PiezaColocada, ruta: Set<string>) {
    if (terminados.has(p.id)) return
    if (ruta.has(p.id)) return invalid()
    ruta.add(p.id)
    for (const apoyo of apoyosDe(p)) {
      if (apoyo === 'tablero') continue
      const parent = byId.get(apoyo.split('/')[0])
      if (!parent || apoyo !== parent.id + '/apoyo') return invalid()
      comprobar(parent, ruta)
    }
    ruta.delete(p.id); terminados.add(p.id)
  }
  for (const p of mesa.piezas) comprobar(p, new Set())
  if (m.conexiones !== undefined && (!Array.isArray(m.conexiones) || m.conexiones.some(c => !c || typeof c.mando !== 'string' || typeof c.receptor !== 'string'))) return invalid()
  mesa.conexiones = (m.conexiones ?? []).map(({ mando, receptor }) => ({ mando, receptor }))
  const n = nivelTaller(mesa.nombre), e = new Editor(n)
  e.cargar(armadoDeMesa(n, mesa))
  mesa.piezas = e.armado.piezas
  byId.clear()
  terminados.clear()
  for (const p of mesa.piezas) byId.set(p.id, p)
  for (const p of mesa.piezas) comprobar(p, new Set())
  return mesa
}

export class Biblioteca {
  readonly mesas = new Map<string, Creacion>()
  private db?: IDBDatabase
  private ready?: Promise<void>
  constructor(private fallo: () => void) { }
  abrir() {
    return this.ready ??= new Promise<void>((resolve) => {
      try {
        const req = indexedDB.open('tuki.taller', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('mesas', { keyPath: 'id' })
        req.onerror = () => { this.fallo(); resolve() }
        req.onsuccess = () => {
          this.db = req.result
          this.db.onversionchange = () => { this.db?.close(); this.db = undefined }
          const get = this.db.transaction('mesas').objectStore('mesas').getAll()
          get.onsuccess = () => {
            for (const entry of get.result as Creacion[]) {
              try {
                if (!/^[0-9a-f-]{36}$/i.test(entry.id)) throw new Error('Identificador inválido')
                if (!this.mesas.has(entry.id)) this.mesas.set(entry.id, { id: entry.id, mesa: leerMesa(entry.mesa) })
              }
              catch { this.fallo() }
            }
            resolve()
          }
          get.onerror = () => { this.fallo(); resolve() }
        }
        req.onblocked = () => { this.fallo(); resolve() }
      } catch { this.fallo(); resolve() }
    })
  }
  private escribir(id: string, mesa?: DocumentoMesa) {
    try {
      if (!this.db) { this.fallo(); return }
      const tx = this.db.transaction('mesas', 'readwrite'), store = tx.objectStore('mesas')
      tx.onabort = () => this.fallo()
      if (mesa) store.put({ id, mesa })
      else store.delete(id)
    } catch { this.fallo() }
  }
  guardar(mesa: DocumentoMesa, id = crypto.randomUUID() as string) {
    const entry = { id, mesa: structuredClone(mesa) }
    this.mesas.set(id, entry)
    this.escribir(id, entry.mesa)
    return entry
  }
  borrar(id: string) { this.mesas.delete(id); this.escribir(id) }
}
export function permiteTipo(t: TipoColocable, completados: IdNivel[]) {
  if (t === 'palanca' || t === 'boton') return ['puerta', 'puente', 'taza-llave'].some(id => completados.includes(id as IdNivel))
  return completados.includes(piezas[t][2])
}
