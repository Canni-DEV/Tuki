import { expect, it } from 'vitest'
import { asignarFavorito, favoritosIniciales, normalizarFavoritos } from '../src/favoritos'
import { guardar, leer } from '../src/progreso'

it('conserva nueve lugares, incluso vacíos, bloqueados o con datos antiguos', () => {
  expect(normalizarFavoritos(undefined)).toEqual(favoritosIniciales)
  expect(normalizarFavoritos(['puente', null, 'puente', 'inexistente', 'domino']))
    .toEqual(['puente', null, null, null, 'domino', null, null, null, null])
  const movidos = asignarFavorito([...favoritosIniciales], 8, 'domino')
  expect(movidos[0]).toBeNull()
  expect(movidos[8]).toBe('domino')
  expect(asignarFavorito(movidos, 8, null)[8]).toBeNull()
})

it('guarda favoritos sin alterar progreso y usa favoritos iniciales cuando no se guardaron', () => {
  const datos = new Map([['tuki.v1.campana.recta', 'true'], ['tuki.v1.preferencias.audio', 'false'], ['tuki.v1.preferencias.movimiento', '"reducido"']])
  const storage = () => ({ getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v) } })
  const p = leer(storage)
  expect(p.favoritosTaller).toEqual(favoritosIniciales)
  p.favoritosTaller = asignarFavorito(p.favoritosTaller!, 3, 'atlasGrande')
  guardar(p, storage)
  expect(leer(storage)).toEqual(p)
  expect(p.completados).toEqual(['recta'])
})
