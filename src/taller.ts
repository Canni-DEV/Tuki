import { configuracionValida } from './dispositivos'
import { piezasParaEnsayo } from './equilibrio'
import { comprobarEnWorker } from './validacion-taller'
import { Editor } from './editor'
import { initPhysics } from './simulation'
import { formatosMesa, medidasMesa, apoyosDe, limitePiezasTaller, type FormatoMesa, type Secuencia, type Conexion, perfil, piezas, tipos, type Armado, type IdNivel, type Nivel, type PiezaColocada } from './types'
import { baseMesa } from './mesas'
import { permiteTipo } from './desbloqueos'
export { permiteTipo } from './desbloqueos'

export interface DocumentoMesa {
  esquema: 'tuki'
  tipo: 'mesa'
  version: 1
  formatoMesa: FormatoMesa
  empujon?: Nivel['empujon']
  ordenFisico: 'id' | 'geometria'
  secuencias?: Secuencia[]
  conexiones?: Conexion[]
  nombre: string
  perfilFisico: string
  piezas: PiezaColocada[]
}
export interface Creacion { id: string; revisionGuardado: number; mesa: DocumentoMesa; recuperada?: boolean }
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
export const mesaNueva = (nombre: string, formatoMesa: FormatoMesa = 'clasica'): DocumentoMesa => ({ esquema: 'tuki', tipo: 'mesa', version: 1, formatoMesa, ordenFisico: 'geometria', nombre, perfilFisico: perfil.id, piezas: [], conexiones: [] })
export function armadoDeMesa(nivel: Nivel, mesa: DocumentoMesa): Armado {
  const saldo = { ...nivel.inventario }
  for (const p of mesa.piezas) saldo[p.tipo]--
  return { nivel: 'taller', revision: 1, perfilFisico: mesa.perfilFisico, piezas: mesa.piezas, conexiones: mesa.conexiones ?? [], secuencias: mesa.secuencias, saldo }
}
function decodificarMesa(data: unknown, diferirEquilibrio: boolean): DocumentoMesa {
  const invalid = (): never => { throw new Error('Archivo de mesa inválido o incompatible.') }
  type PiezaDeArchivo = PiezaColocada
  const m = data as Partial<Omit<DocumentoMesa, 'piezas'> & { piezas: PiezaDeArchivo[] }> | null
  if (!m || m.esquema !== 'tuki' || m.tipo !== 'mesa' || m.version !== 1 || m.perfilFisico !== perfil.id || typeof m.nombre !== 'string' ||
    !m.nombre.trim() || m.nombre.length > 80 || !Array.isArray(m.piezas)) return invalid()
  if (m.piezas.length > limitePiezasTaller) throw new Error(`Límite de ${limitePiezasTaller} objetos`)
  const ids = new Set<string>(['mesa', 'tablero'])
  const mesa = mesaNueva(m.nombre.trim())
  mesa.formatoMesa = m.formatoMesa!
  mesa.ordenFisico = m.ordenFisico!
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
const validadas = new Map<string, DocumentoMesa>()
export async function leerMesaAsync(data: unknown) {
  const clave = JSON.stringify(data)
  const previa = validadas.get(clave)
  if (previa) return structuredClone(previa)
  await initPhysics()
  const mesa = decodificarMesa(data, true)
  const fallo = await comprobarEnWorker(piezasParaEnsayo(mesa.piezas), medidasMesa(nivelTaller(mesa.nombre, mesa)))
  if (fallo) throw new Error(fallo.pieza + ' · ' + fallo.mensaje)
  if (validadas.size >= 50) validadas.delete(validadas.keys().next().value!)
  validadas.set(clave, mesa)
  return structuredClone(mesa)
}
