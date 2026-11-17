import { conApoyos, surfaceRect } from './levels'
import { bases, escenario } from './shapes'
import { esMesaLibre, pieceAsset, type Nivel, type PiezaColocada } from './types'

export type Punto = [number, number]
export interface Contacto { apoyo: string; poligono: Punto[] }
export const admiteVoladizo = (n: Nivel, p: PiezaColocada) => (esMesaLibre(n) || !!n.objetos) && !!escenario[pieceAsset(p.tipo, p.configuracion)]
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

// Subtract a convex patch, keeping disjoint polygons outside each of its edges.
// Unlike adding contact areas, this cannot count overlapping supports twice.
function restar(base: Punto[], tapa: Punto[]): Punto[][] {
  const fuera: Punto[][] = []
  let dentro = base
  for (let i = 0; i < tapa.length && dentro.length; i++) {
    const a = tapa[i], b = tapa[(i + 1) % tapa.length]
    const lados: [Punto[], Punto[]] = [[], []]
    let anterior = dentro.at(-1)!, da = cruz(a, b, anterior)
    for (const actual of dentro) {
      const d = cruz(a, b, actual)
      if ((d >= 0) !== (da >= 0)) {
        const t = da / (da - d)
        const corte: Punto = [anterior[0] + t * (actual[0] - anterior[0]), anterior[1] + t * (actual[1] - anterior[1])]
        lados[0].push(corte); lados[1].push(corte)
      }
      lados[d >= 0 ? 0 : 1].push(actual)
      anterior = actual; da = d
    }
    if (area(lados[1]) > 1e-12) fuera.push(lados[1])
    dentro = lados[0]
  }
  return fuera
}

function area(poligono: Punto[]) {
  let doble = 0
  for (let i = 2; i < poligono.length; i++) doble += cruz(poligono[0], poligono[i - 1], poligono[i])
  return Math.abs(doble) / 2
}

/** Cover every foot (or one specified foot), including its interior and seams. */
export function baseCubierta(p: PiezaColocada, contactos: Contacto[], indice?: number) {
  const [x, , z] = p.posicion, ang = p.giroY * Math.PI / 180
  const pies = bases(pieceAsset(p.tipo, p.configuracion)).filter((_, i) => indice === undefined || indice === i)
  return pies.length > 0 && pies.every(pie => {
    let resto = [transformar(pie, x, z, ang)]
    for (const contacto of contactos) resto = resto.flatMap(poligono => restar(poligono, contacto.poligono))
    return resto.every(poligono => area(poligono) <= 1e-12)
  })
}
export function parches(n: Nivel, p: PiezaColocada): Contacto[] {
  const [x, y, z] = p.posicion, ang = p.giroY * Math.PI / 180
  const pies = bases(pieceAsset(p.tipo, p.configuracion)).map(pie => transformar(pie, x, z, ang))
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
