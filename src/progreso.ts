import type { IdNivel } from './types'
export interface Preferencias {
  version: 1
  completados: IdNivel[]
  audio: boolean
  movimiento: 'sistema' | 'reducido' | 'completo'
}
export const clave = 'tuki.progreso.v1'
export function leer(storage: () => Pick<Storage, 'getItem'> = () => localStorage): Preferencias {
  const inicial: Preferencias = { version: 1, completados: [], audio: true, movimiento: 'sistema' }
  try {
    const p = JSON.parse(storage().getItem(clave) ?? 'null')
    if (
      p?.version !== 1 ||
      !Array.isArray(p.completados) ||
      typeof p.audio !== 'boolean' ||
      !['sistema', 'reducido', 'completo'].includes(p.movimiento)
    )
      return inicial
    return {
      ...inicial,
      audio: p.audio,
      movimiento: p.movimiento,
      completados: [
        ...new Set<IdNivel>(
          p.completados.filter((s: string) => ['curva', 'libro', 'taza', 'taza-llave'].includes(s)),
        ),
      ],
    }
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
