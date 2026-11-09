import { conApoyos, surfaceRect } from './levels'
import { bases, escenario } from './shapes'
import { pieceAsset, type Nivel, type PiezaColocada } from './types'

export type Punto = [number, number]
export interface Contacto { apoyo: string; poligono: Punto[] }
export const admiteVoladizo = (n: Nivel, p: PiezaColocada) => n.id === 'taller' && !!escenario[pieceAsset(p.tipo)]
const cruz = (a: Punto, b: Punto, c: Punto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

// Sutherland–Hodgman clipping of convex contact patches, in world XZ.
function recortar(base: Punto[], tapa: Punto[]) {
  let salida = base
  for (let i = 0; i < tapa.length && salida.length; i++) {
    const a = tapa[i], b = tapa[(i + 1) % tapa.length], entrada = salida
    salida = []
    let anterior = entrada.at(-1)!, distancia = cruz(a, b, anterior)
    for (const actual of entrada) {
      const d = cruz(a, b, actual)
      if ((d >= 0) !== (distancia >= 0)) {
        const t = distancia / (distancia - d)
        salida.push([anterior[0] + t * (actual[0] - anterior[0]), anterior[1] + t * (actual[1] - anterior[1])])
      }
      if (d >= 0) salida.push(actual)
      anterior = actual; distancia = d
    }
  }
  let area = 0
  for (let i = 2; i < salida.length; i++) area += cruz(salida[0], salida[i - 1], salida[i])
  return area > 1e-12 ? salida : []
}

function transformar(puntos: Punto[], x: number, z: number, ang: number): Punto[] {
  const c = Math.cos(ang), s = Math.sin(ang)
  return puntos.map(([u, v]) => [x + u * c + v * s, z - u * s + v * c])
}
export function parches(n: Nivel, p: PiezaColocada): Contacto[] {
  const [x, y, z] = p.posicion, ang = p.giroY * Math.PI / 180
  const pies = bases(pieceAsset(p.tipo)).map(pie => transformar(pie, x, z, ang))
  const radio = Math.max(0, ...pies.flat().map(([u, v]) => Math.hypot(u - x, v - z)))
  const contactos: Contacto[] = []
  for (const superficie of n.superficies) {
    if (superficie.zona !== 'tapa' || superficie.objeto === p.id || !superficie.admite.includes(p.tipo)) continue
    const r = surfaceRect(n, superficie.id)
    if (Math.abs(r.y - y) > .00012 || Math.hypot(r.x - x, r.z - z) > radio + Math.hypot(r.w, r.d) / 2) continue
    const w = r.w / 2, d = r.d / 2
    const borde: Punto[] = superficie.circular ? Array.from({ length: 64 }, (_, i) =>
      [w * Math.cos(i * Math.PI / 32), d * Math.sin(i * Math.PI / 32)]) : [[-w, -d], [w, -d], [w, d], [-w, d]]
    const tapa = transformar(borde, r.x, r.z, r.ang)
    for (const pie of pies) {
      const poligono = recortar(pie, tapa)
      if (poligono.length) contactos.push({ apoyo: superficie.id, poligono })
    }
  }
  return contactos
}
export const contactosDePieza = (n: Nivel, p: PiezaColocada, otras: PiezaColocada[]) =>
  parches(conApoyos(n, otras.filter(o => o.id !== p.id)), p)
