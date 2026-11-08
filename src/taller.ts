import { Editor } from './editor'
import { inventario, perfil, piezas, tipos, type Armado, type IdNivel, type Nivel, type PiezaColocada, type TipoColocable } from './types'

export interface DocumentoMesa {
  version: 1
  nombre: string
  perfilFisico: string
  piezas: PiezaColocada[]
}
export interface Creacion { id: string; mesa: DocumentoMesa }
export const faltantes = (mesa: DocumentoMesa, completados: IdNivel[]) =>
  [...new Set(mesa.piezas.map(p => piezas[p.tipo][2]).filter(n => !completados.includes(n)))]

export function nivelTaller(nombre: string): Nivel {
  const saldo = inventario()
  for (const tipo of tipos) saldo[tipo] = tipo === 'inicio' || tipo === 'meta' ? 1 : 100
  return {
    version: 1, revision: 1, id: 'taller', nombre, objetivo: 'Armá tu recorrido en la mesa.', perfilFisico: perfil.id, requiere: 'recta',
    inventario: saldo, fijos: [{ id: 'mesa', activo: 'table', rol: 'escenario', posicion: [0, 0, 0], giroY: 0, escala: [2, 1, 2], apoyo: null }],
    superficies: [{ id: 'tablero', objeto: 'mesa', zona: 'tapa', admite: tipos }],
    camara: { objetivo: [0, .03, 0], azimut: 16, elevacion: 48, altoVisible: .54 },
    empujon: { pieza: 'inicio', impulsoLocal: [0, 0, .003], puntoLocal: [0, .04, 0] },
  }
}
export const mesaNueva = (nombre: string): DocumentoMesa => ({ version: 1, nombre, perfilFisico: perfil.id, piezas: [] })
export function armadoDeMesa(nivel: Nivel, mesa: DocumentoMesa): Armado {
  const saldo = { ...nivel.inventario }
  for (const p of mesa.piezas) saldo[p.tipo]--
  return { nivel: 'taller', revision: 1, perfilFisico: mesa.perfilFisico, piezas: mesa.piezas, saldo }
}
export function leerMesa(data: unknown): DocumentoMesa {
  const invalid = (): never => { throw new Error('Archivo de mesa inválido o incompatible.') }
  const m = data as Partial<DocumentoMesa> | null
  if (!m || m.version !== 1 || m.perfilFisico !== perfil.id || typeof m.nombre !== 'string' ||
    !m.nombre.trim() || m.nombre.length > 80 || !Array.isArray(m.piezas) || m.piezas.length > 100) return invalid()
  const ids = new Set<string>(['mesa', 'tablero'])
  const mesa = mesaNueva(m.nombre.trim())
  for (const item of m.piezas) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
      !tipos.includes(item.tipo) || typeof item.apoyo !== 'string' || !Array.isArray(item.posicion) ||
      item.posicion.length !== 3 || !item.posicion.every(Number.isFinite) || !Number.isFinite(item.giroY)) return invalid()
    for (const rol of ['inicio', 'meta']) if ((item.id === rol) !== (item.tipo === rol)) return invalid()
    ids.add(item.id)
    mesa.piezas.push({ id: item.id, tipo: item.tipo, apoyo: item.apoyo, posicion: [...item.posicion], giroY: item.giroY % 360 })
  }
  const byId = new Map(mesa.piezas.map(p => [p.id, p]))
  for (const p of mesa.piezas) {
    const vistos = new Set([p.id])
    let current = p
    while (current.apoyo !== 'tablero') {
      const parent = byId.get(current.apoyo.split('/')[0])
      if (!parent || vistos.has(parent.id) || current.apoyo !== parent.id + '/apoyo') return invalid()
      vistos.add(parent.id)
      current = parent
    }
  }
  // Import uses the same placement, support and intersection rules as the live editor.
  const n = nivelTaller(mesa.nombre)
  new Editor(n).cargar(armadoDeMesa(n, mesa))
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
export function permiteTipo(t: TipoColocable, completados: IdNivel[]) { return completados.includes(piezas[t][2]) }
