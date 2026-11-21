import { tipos, type TipoColocable } from './types'

export type Favoritos = (TipoColocable | null)[]
export const favoritosIniciales: readonly TipoColocable[] = [
  'domino', 'bolita', 'taco', 'rampa', 'canal', 'embudo', 'libro', 'inicio', 'meta',
]

export function normalizarFavoritos(valor: unknown): Favoritos {
  if (!Array.isArray(valor)) return [...favoritosIniciales]
  const usados = new Set<TipoColocable>()
  return Array.from({ length: 9 }, (_, i) => {
    const tipo = valor[i]
    if (!tipos.includes(tipo) || usados.has(tipo)) return null
    usados.add(tipo)
    return tipo as TipoColocable
  })
}

export function asignarFavorito(actual: Favoritos, lugar: number, tipo: TipoColocable | null): Favoritos {
  const siguiente = normalizarFavoritos(actual)
  if (!Number.isInteger(lugar) || lugar < 0 || lugar > 8) return siguiente
  if (tipo) siguiente.forEach((t, i) => { if (t === tipo) siguiente[i] = null })
  siguiente[lugar] = tipo
  return siguiente
}
