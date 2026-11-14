import { Quaternion, type Object3D } from 'three'
import clip from './data/portada.json'

// Real contacts are baked offline. This player has no physics world or gameplay state.
const espera = 240, ritmo = .55
export const cantidadPortada = clip.count
export const duracionPortada = espera + (clip.frames.length - 1) / clip.fps / ritmo * 1000
const desde = new Quaternion(), hasta = new Quaternion()

export function dibujarPortada(piezas: readonly Object3D[], tiempo: number) {
  const frame = Math.max(0, Math.min(clip.frames.length - 1, (tiempo - espera) / 1000 * ritmo * clip.fps))
  const indice = Math.floor(frame), t = frame - indice
  const a = clip.frames[indice], b = clip.frames[Math.min(indice + 1, clip.frames.length - 1)]
  piezas.forEach((pieza, i) => {
    const offset = i * 7
    pieza.position.set(...[0, 1, 2].map(k => a[offset + k] + (b[offset + k] - a[offset + k]) * t) as [number, number, number])
    desde.fromArray(a, offset + 3).normalize()
    hasta.fromArray(b, offset + 3).normalize()
    pieza.quaternion.copy(desde).slerp(hasta, t)
  })
}
