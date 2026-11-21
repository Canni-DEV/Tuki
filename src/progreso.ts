import { niveles } from './levels'
import { permiteTipo } from './desbloqueos'
import { tipos, type IdNivel, type Nivel, type TipoColocable } from './types'
import { normalizarFavoritos, type Favoritos } from './favoritos'
export const mezclaInicial = { musica: 40, mesa: 85, ambiente: 25, interfaz: 65 }
export type Familia = keyof typeof mezclaInicial
export const familias = Object.keys(mezclaInicial) as Familia[]
export interface Preferencias {
  version: 1
  completados: IdNivel[]
  audio: boolean
  volumenes: Record<Familia, number>
  movimiento: 'sistema' | 'reducido' | 'completo'
  apariencia: 'claro' | 'oscuro' | 'sistema'
  visuales: 'actual' | 'fotorealista'
  calidadFotorealista: 'alta' | 'equilibrada'
  favoritosTaller?: Favoritos
}
import { prefijo } from './claves'
export { prefijo } from './claves'
const instantaneas = new WeakMap<Preferencias, Map<string, string>>()
const campos = (p: Preferencias) => new Map<string, string>([
  ['audio', JSON.stringify(p.audio)], ['movimiento', JSON.stringify(p.movimiento)], ['apariencia', JSON.stringify(p.apariencia)],
  ['visuales', JSON.stringify(p.visuales)], ['calidadFotorealista', JSON.stringify(p.calidadFotorealista)],
  ...familias.map(f => ['volumen.' + f, JSON.stringify(p.volumenes[f])] as [string, string]),
  ...normalizarFavoritos(p.favoritosTaller).map((t, i) => ['favorito.' + i, JSON.stringify(t)] as [string, string]),
])
export function leer(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage): Preferencias {
  const inicial: Preferencias = { version: 1, completados: [], audio: true, movimiento: 'sistema', apariencia: 'claro', visuales:'actual', calidadFotorealista:'alta', volumenes: { ...mezclaInicial }, favoritosTaller: normalizarFavoritos(undefined) }
  const valor = (campo: string): unknown => {
    try { return JSON.parse(storage().getItem(prefijo + 'preferencias.' + campo) ?? 'null') } catch { return null }
  }
  const audio = valor('audio'), movimiento = valor('movimiento'), apariencia = valor('apariencia')
  if (typeof audio === 'boolean') inicial.audio = audio
  if (['sistema', 'reducido', 'completo'].includes(String(movimiento))) inicial.movimiento = movimiento as Preferencias['movimiento']
  if (['claro', 'oscuro', 'sistema'].includes(String(apariencia))) inicial.apariencia = apariencia as Preferencias['apariencia']
  if(valor('visuales')==='fotorealista') inicial.visuales='fotorealista'
  if(valor('calidadFotorealista')==='equilibrada') inicial.calidadFotorealista='equilibrada'
  for (const f of familias) {
    const v = valor('volumen.' + f)
    if (typeof v === 'number' && Number.isFinite(v)) inicial.volumenes[f] = Math.max(0, Math.min(100, Math.round(v)))
  }
  const favoritos = inicial.favoritosTaller!
  for (let i = 0; i < favoritos.length; i++) {
    try {
      if (storage().getItem(prefijo + 'preferencias.favorito.' + i) !== null) favoritos[i] = valor('favorito.' + i) as TipoColocable | null
    } catch { /* Preferences remain available in memory when storage is blocked. */ }
  }
  inicial.favoritosTaller = normalizarFavoritos(favoritos)
  try { inicial.completados = niveles.filter(n => storage().getItem(prefijo + 'campana.' + n.id) === 'true').map(n => n.id) } catch { /* Session only. */ }
  instantaneas.set(inicial, campos(inicial))
  return inicial
}
/** Only fields edited since this snapshot was read are written. Victories are independent, monotonic keys. */
export function guardar(p: Preferencias, storage: () => Pick<Storage, 'setItem'> = () => localStorage) {
  const anteriores = instantaneas.get(p) ?? new Map<string, string>(), actuales = campos(p)
  try {
    for (const [campo, valor] of actuales) if (anteriores.get(campo) !== valor) {
      storage().setItem(prefijo + 'preferencias.' + campo, valor)
      anteriores.set(campo, valor)
    }
    for (const id of p.completados) storage().setItem(prefijo + 'campana.' + id, 'true')
    instantaneas.set(p, anteriores)
    return true
  } catch { instantaneas.set(p, anteriores); return false }
}
export function sincronizar(p: Preferencias) {
  const anterior = instantaneas.get(p) ?? new Map<string, string>(), actual = campos(p)
  const remoto = leer(), baseRemota = campos(remoto), cambios = [...actual].filter(([k, v]) => anterior.get(k) !== v)
  // Keep unsaved local edits; importing remote changes must never mark them saved.
  const respaldo = structuredClone(p)
  Object.assign(p, remoto, { completados: [...new Set([...remoto.completados, ...p.completados])] })
  for (const [k] of cambios) {
    if (k === 'audio') p.audio = respaldo.audio
    else if (k === 'movimiento') p.movimiento = respaldo.movimiento
    else if (k === 'apariencia') p.apariencia = respaldo.apariencia
    else if (k === 'visuales') p.visuales = respaldo.visuales
    else if (k === 'calidadFotorealista') p.calidadFotorealista = respaldo.calidadFotorealista
    else if (k.startsWith('volumen.')) { const f = k.slice(8) as Familia; p.volumenes[f] = respaldo.volumenes[f] }
    else { const i = Number(k.slice(9)); p.favoritosTaller![i] = respaldo.favoritosTaller![i] }
  }
  instantaneas.set(p, baseRemota)
}

export function disponible(n: { id: IdNivel; requiere: IdNivel | null }, p: Preferencias) {
  return !n.requiere || p.completados.includes(n.id) || p.completados.includes(n.requiere)
}

export interface Victoria {
  nombre: string
  taller: boolean
  primera: boolean
  desafios: string[]
  abreTaller: boolean
  piezas: TipoColocable[]
}

export function acreditarVictoria(nivel: Nivel, p: Preferencias): Victoria {
  const taller = nivel.id === 'taller'
  const primera = !taller && !p.completados.includes(nivel.id)
  const victoria: Victoria = { nombre: nivel.nombre, taller, primera, desafios: [], abreTaller: false, piezas: [] }
  if (!primera) return victoria
  const despues = { ...p, completados: [...p.completados, nivel.id] }
  victoria.desafios = niveles.filter(n => n.id !== nivel.id && !disponible(n, p) && disponible(n, despues)).map(n => n.nombre)
  victoria.abreTaller = nivel.id === 'recta'
  victoria.piezas = tipos.filter(t => !permiteTipo(t, p.completados) && permiteTipo(t, despues.completados))
  p.completados = despues.completados
  return victoria
}
