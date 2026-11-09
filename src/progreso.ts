import { niveles } from './levels'
import { permiteTipo } from './taller'
import { esClasica, tipos, type IdNivel, type Nivel, type TipoColocable } from './types'
export const mezclaInicial = { musica: 40, mesa: 85, ambiente: 25, interfaz: 65 }
export type Familia = keyof typeof mezclaInicial
export const familias = Object.keys(mezclaInicial) as Familia[]
export interface Preferencias {
  version: 1
  campana?: 2
  puenteAnterior?: boolean
  completados: IdNivel[]
  audio: boolean
  volumenes: Record<Familia, number>
  movimiento: 'sistema' | 'reducido' | 'completo'
}
export const clave = 'tuki.progreso.v1'
export function leer(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage): Preferencias {
  const inicial: Preferencias = { version: 1, campana: 2, puenteAnterior: false, completados: [], audio: true, movimiento: 'sistema', volumenes: { ...mezclaInicial } }
  try {
    const p = JSON.parse(storage().getItem(clave) ?? 'null')
    if (
      p?.version !== 1 ||
      !Array.isArray(p.completados) ||
      typeof p.audio !== 'boolean' ||
      !['sistema', 'reducido', 'completo'].includes(p.movimiento)
    )
      return inicial
    const completados = niveles.map((n) => n.id).filter((id) => p.completados.includes(id))
    for (const familia of familias) {
      const valor = p.volumenes?.[familia]
      if (Number.isFinite(valor)) inicial.volumenes[familia] = Math.max(0, Math.min(100, Math.round(valor)))
    }
    const preferencias: Preferencias = {
      ...inicial,
      audio: p.audio,
      movimiento: p.movimiento,
      completados,
      puenteAnterior: p.campana === 2 ? p.puenteAnterior === true : completados.includes('subibaja'),
    }
    const faltaRecta = completados.includes('curva') && !completados.includes('recta')
    if (faltaRecta) completados.unshift('recta')
    if (faltaRecta || p.campana !== 2) guardar(preferencias, storage)
    return preferencias
  } catch {
    return inicial
  }
}
export function guardar(p: Preferencias, storage: () => Pick<Storage, 'setItem'> = () => localStorage) {
  try {
    storage().setItem(clave, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}

export function disponible(n: { id: IdNivel; requiere: IdNivel | null }, p: Preferencias) {
  return !n.requiere || p.completados.includes(n.id) || p.completados.includes(n.requiere) ||
    (n.id === 'puente' && p.puenteAnterior === true)
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
  victoria.piezas = tipos.filter(t => !esClasica(t) && !permiteTipo(t, p.completados) && permiteTipo(t, despues.completados))
  p.completados = despues.completados
  return victoria
}
