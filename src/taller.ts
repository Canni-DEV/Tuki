import { configuracionValida } from './dispositivos'
import { piezasParaEnsayo } from './equilibrio'
import { comprobarEnWorker } from './validacion-taller'
import { Editor } from './editor'
import { formatosMesa, medidasMesa, inventario, apoyosDe, limitePiezasTaller, type FormatoMesa, type Secuencia, type Conexion, perfil, piezas, tipos, type Armado, type IdNivel, type Nivel, type PiezaColocada, type TipoColocable } from './types'
import { baseMesa } from './mesas'

export interface DocumentoMesa {
  version: 5 | 6
  formatoMesa?: FormatoMesa
  empujon?: Nivel['empujon']
  ordenFisico?: 'id' | 'geometria'
  secuencias?: Secuencia[]
  conexiones?: Conexion[]
  nombre: string
  perfilFisico: string
  piezas: PiezaColocada[]
}
export interface Creacion { id: string; mesa: DocumentoMesa }
export const faltantes = (mesa: DocumentoMesa, completados: IdNivel[]) =>
  [...new Set<IdNivel>([
    ...mesa.piezas.filter(p => !permiteTipo(p.tipo, completados)).map(p => piezas[p.tipo][2]),
    ...(mesa.secuencias?.length && !completados.includes('mate') ? ['mate' as const] : []),
  ])]

export function nivelTaller(nombre: string, documento?: Pick<DocumentoMesa, 'formatoMesa' | 'empujon' | 'ordenFisico'>): Nivel {
  const n = baseMesa(nombre, documento?.formatoMesa ?? 'clasica')
  n.ordenFisico = documento?.ordenFisico ?? 'id'
  if (documento?.empujon) n.empujon = structuredClone(documento.empujon)
  return n
}
export const mesaNueva = (nombre: string, formatoMesa: FormatoMesa = 'clasica'): DocumentoMesa => ({ version: 6, formatoMesa, ordenFisico: 'geometria', nombre, perfilFisico: perfil.id, piezas: [], conexiones: [] })
export function armadoDeMesa(nivel: Nivel, mesa: DocumentoMesa): Armado {
  const saldo = { ...nivel.inventario }
  for (const p of mesa.piezas) saldo[p.tipo]--
  return { nivel: 'taller', revision: 1, perfilFisico: mesa.perfilFisico, piezas: mesa.piezas, conexiones: mesa.conexiones ?? [], secuencias: mesa.secuencias, version: 5, saldo }
}
function decodificarMesa(data: unknown, diferirEquilibrio: boolean): DocumentoMesa {
  const invalid = (): never => { throw new Error('Archivo de mesa inválido o incompatible.') }
  type PiezaDeArchivo = PiezaColocada
  const m = data as Partial<Omit<DocumentoMesa, 'piezas'> & { piezas: PiezaDeArchivo[] }> | null
  if (m?.version !== undefined && ![5,6].includes(m.version))
    throw new Error('Formato de mesa inválido o incompatible. Se necesita un archivo v5 o v6.')
  if (!m || ![5,6].includes(m.version!) || m.perfilFisico !== perfil.id || typeof m.nombre !== 'string' ||
    !m.nombre.trim() || m.nombre.length > 80 || !Array.isArray(m.piezas)) return invalid()
  if (m.piezas.length > limitePiezasTaller) throw new Error(`Límite de ${limitePiezasTaller} objetos`)
  const ids = new Set<string>(['mesa', 'tablero'])
  const mesa = mesaNueva(m.nombre.trim())
  mesa.version = 6
  mesa.formatoMesa = m.version === 5 ? 'clasica' : m.formatoMesa ?? 'clasica'
  mesa.ordenFisico = m.version === 5 ? 'id' : m.ordenFisico ?? 'geometria'
  if (!Object.hasOwn(formatosMesa, mesa.formatoMesa) || !['id','geometria'].includes(mesa.ordenFisico)) return invalid()
  if (m.empujon !== undefined) {
    if (m.empujon.pieza !== 'inicio' || !Array.isArray(m.empujon.impulsoLocal) || !Array.isArray(m.empujon.puntoLocal) ||
        JSON.stringify(m.empujon.puntoLocal) !== '[0,0.04,0]' || !['[0,0,0.003]','[0,0,0.0045]'].includes(JSON.stringify(m.empujon.impulsoLocal))) return invalid()
    mesa.empujon = structuredClone(m.empujon)
  }
  for (const item of m.piezas) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
      typeof item.apoyo !== 'string' || !Array.isArray(item.posicion) ||
      item.posicion.length !== 3 || !item.posicion.every(Number.isFinite) || !Number.isFinite(item.giroY)) return invalid()
    for (const rol of ['inicio', 'meta']) if ((item.id === rol) !== (item.tipo === rol)) return invalid()
    ids.add(item.id)
    if (item.apoyos !== undefined && (!Array.isArray(item.apoyos) || !item.apoyos.length || item.apoyos.some(id => typeof id !== 'string') || !item.apoyos.includes(item.apoyo))) return invalid()
    if (!tipos.includes(item.tipo) || !configuracionValida(item.tipo, item.configuracion)) return invalid()
    const tipo = item.tipo
    mesa.piezas.push({ id: item.id, tipo, ...(item.configuracion ? { configuracion: structuredClone(item.configuracion) } : {}), ...(item.apoyos ? { apoyos: [...item.apoyos] } : {}), apoyo: item.apoyo, posicion: [...item.posicion], giroY: item.giroY % 360 })
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
  if (m.secuencias !== undefined) {
    if (!Array.isArray(m.secuencias)) return invalid()
    mesa.secuencias = structuredClone(m.secuencias)
  }
  const n = nivelTaller(mesa.nombre, mesa), e = new Editor(n)
  e.cargar(armadoDeMesa(n, mesa), diferirEquilibrio)
  mesa.piezas = e.armado.piezas
  byId.clear()
  terminados.clear()
  for (const p of mesa.piezas) byId.set(p.id, p)
  for (const p of mesa.piezas) comprobar(p, new Set())
  return mesa
}

export const leerMesa = (data: unknown) => decodificarMesa(data,false)
export async function leerMesaAsync(data: unknown) {
  const mesa = decodificarMesa(data,true)
  const fallo = await comprobarEnWorker(piezasParaEnsayo(mesa.piezas), medidasMesa(nivelTaller(mesa.nombre, mesa)))
  if (fallo) throw new Error(fallo.pieza + ' · ' + fallo.mensaje)
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
        const req = indexedDB.open('tuki.taller.v6', 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore('mesas', { keyPath: 'id' })
          req.result.createObjectStore('migraciones')
        }
        req.onerror = () => { this.fallo(); resolve() }
        req.onsuccess = async () => {
          this.db = req.result
          this.db.onversionchange = () => { this.db?.close(); this.db = undefined }
          try { await this.migrarV5() } catch { this.fallo() }
          if (!this.db) { resolve(); return }
          const get = this.db.transaction('mesas').objectStore('mesas').getAll()
          get.onsuccess = async () => {
            for (const entry of get.result as Creacion[]) {
              try {
                if (!/^[0-9a-f-]{36}$/i.test(entry.id)) throw new Error('Identificador inválido')
                const mesa = await leerMesaAsync(entry.mesa)
                if (!this.mesas.has(entry.id)) this.mesas.set(entry.id, { id: entry.id, mesa })
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
  private async migrarV5() {
    const db = this.db!
    const hecha = await new Promise<unknown>((resolve,reject) => {
      const req = db.transaction('migraciones').objectStore('migraciones').get('v5')
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error)
    })
    if (hecha) return
    // Read the old database without rewriting or deleting its source documents.
    const originales = await new Promise<Creacion[]>((resolve,reject) => {
      const req = indexedDB.open('tuki.taller.dispositivos.v5',1)
      let ausente = false
      req.onupgradeneeded=()=>{ ausente=true; req.transaction!.abort() }
      req.onerror=()=>ausente ? resolve([]) : reject(req.error)
      req.onblocked=()=>reject(new Error('La biblioteca anterior está ocupada.'))
      req.onsuccess=()=>{
        const anterior=req.result
        if(!anterior.objectStoreNames.contains('mesas')) {anterior.close();resolve([]);return}
        const get=anterior.transaction('mesas').objectStore('mesas').getAll()
        get.onsuccess=()=>{anterior.close();resolve(get.result)}
        get.onerror=()=>{anterior.close();reject(get.error)}
      }
    })
    const convertidas:Creacion[]=[]
    for (const entry of originales) {
      try { convertidas.push({id:entry.id,mesa:await leerMesaAsync(entry.mesa)}) } catch { this.fallo() }
    }
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['mesas','migraciones'],'readwrite'), store=tx.objectStore('mesas')
      for(const entry of convertidas) {
        const get=store.get(entry.id)
        get.onsuccess=()=>{if(!get.result)store.put(entry)}
      }
      tx.objectStore('migraciones').put(true,'v5')
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error)
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
