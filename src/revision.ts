import type { Armado } from './types'
import { almacen } from './almacen'
import { Biblioteca } from './biblioteca'
import { BibliotecaDesafios } from './biblioteca-desafios'

const fixtures = import.meta.glob<{ default: { armado: Armado } }>('../qa/fixtures/*.json')
export async function fixture(nombre: string) {
  const cargar = fixtures['../qa/fixtures/' + nombre + '.json']
  if (!cargar) throw new Error('Montaje desconocido')
  return (await cargar()).default.armado
}
export function instalar(api: object) {
  Object.assign(window, { tukiQA: api, tukiRevision: {
    almacen, mesas: () => new Biblioteca(), desafios: () => new BibliotecaDesafios(),
  } })
}

/** Reuses the actual frame/physics path; synthetic timestamps are never FPS samples. */
export async function avanzarReloj(enPrueba: () => boolean, cuadro: (t: number) => void, t: number) {
  const limite = performance.now() + 90000
  while (enPrueba()) {
    if (document.hidden) throw new Error('La ventana de aceptación debe estar visible.')
    if (performance.now() > limite) throw new Error('La prueba no alcanzó un resultado.')
    t += 2000
    cuadro(t)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
