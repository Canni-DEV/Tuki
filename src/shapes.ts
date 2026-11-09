import { Euler, Quaternion, Vector3 } from 'three'
/** Metres in game space. The same shapes also feed the Blender asset generator. */
export type Triple = [number, number, number]
export type Shape = {
  kind: 'box' | 'sphere' | 'cylinder' | 'hull'
  at: Triple
  size: Triple
  rot?: Triple
  points?: number[]
}

const box = (at: Triple, size: Triple): Shape => ({ kind: 'box', at, size })
const cylinder = (at: Triple, diameter: number, height: number): Shape =>
  ({ kind: 'cylinder', at, size: [diameter, height, diameter] })

function hull(points: Triple[]): Shape {
  const size = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])) - Math.min(...points.map(p => p[i])))
  return { kind: 'hull', points: points.flat(), at: [0, 0, 0], size: size as Triple }
}

function slope(x: number, width: number, length: number, high: number, low: number, thickness?: number): Shape {
  const vertices: Triple[] = []
  for (const xx of [x - width / 2, x + width / 2]) {
    for (const [z, top] of [[-length / 2, high], [length / 2, low]]) {
      vertices.push([xx, top, z], [xx, thickness ? top - thickness : 0, z])
    }
  }
  return hull(vertices)
}

/** Individual sectors leave the centre and the neck clear for a real ball. */
function shell(bottom: number[], top: number[], segments: number): Shape[] {
  return Array.from({ length: segments }, (_, i) => {
    const vertices: Triple[] = []
    for (const n of [i, i + 1]) {
      const theta = 2 * Math.PI * n / segments
      for (const [inside, outside, y] of [bottom, top]) {
        for (const r of [inside, outside]) vertices.push([r * Math.cos(theta), y, r * Math.sin(theta)])
      }
    }
    return hull(vertices)
  })
}

const catalog: Record<string, Shape[]> = {
  table: [box([0, -.009, 0], [.42, .018, .26])],
  book: [box([0, .009, 0], [.14, .018, .085])],
  block: [box([0, .006, 0], [.036, .012, .025])],
  domino: [box([0, .025, 0], [.025, .05, .008])],
  ball: [{ kind: 'sphere', at: [0, 0, 0], size: [.016, .016, .016] }],
  ramp: [
    slope(0, .032, .095, .0265, .001),
    ...[-.015, .015].map(x => slope(x, .002, .095, .029, .0035, .0025)),
  ],
  cradle: [
    box([-.009, .003, 0], [.003, .006, .021]),
    box([.009, .003, 0], [.003, .006, .021]),
    box([0, .001, .0075], [.016, .002, .002]),
  ],
  funnel: [
    ...shell([.011, .012, .030], [.011, .012, .035], 16),
    ...shell([.011, .012, .035], [.026, .027, .048], 16),
    ...[-.023, .023].map(x => box([x, .022, 0], [.0035, .044, .004])),
  ],
  channel: [
    slope(0, .026, .09, .0135, .003, .002),
    ...[-.01175, .01175].map(x => slope(x, .0025, .09, .018, .0075, .0045)),
    ...[-.034, .034].map(z => {
      const height = .0135 - .0105 * (z + .045) / .09 - .002
      return box([0, height / 2, z], [.021, height, .004])
    }),
  ],
  cup: [
    cylinder([0, .003, 0], .063, .006),
    ...shell([.026, .032, .005], [.0345, .0375, .064], 16),
  ],
  paddle: [box([0, .010, 0], [.016, .020, .003])],
  gate: [box([0, .007, 0], [.028, .014, .003])],
  diverter: [
    box([0, .00075, 0], [.026, .0015, .040]),
    ...[-.012, .012].map(x => box([x, .003, 0], [.002, .006, .040])),
  ],
  tray: [
    box([0, .0005, 0], [.048, .001, .042]),
    ...[-.023, .023].map(x => box([x, .006, 0], [.002, .012, .042])),
    box([0, .006, .020], [.044, .012, .002]),
  ],
  tumbler: [cylinder([0, .0225, 0], .052, .045)],
}

// Handle centreline is a half ellipse in the X/Y plane with both ends set into the cup.
for (let i = 0; i < 10; i++) {
  const point = (a: number) => [.034 + .023 * Math.sin(a), .034 + .018 * Math.cos(a)]
  const a = point(Math.PI * i / 10)
  const b = point(Math.PI * (i + 1) / 10)
  const segment = cylinder([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], .0065, Math.hypot(b[0] - a[0], b[1] - a[1]) + .001)
  segment.rot = [0, 0, -Math.atan2(b[0] - a[0], b[1] - a[1])]
  catalog.cup.push(segment)
}

// The channel centreline enters along +Z and leaves along +X.
const bendRadius = .047
const bendSectors = 16
const innerEdge = bendRadius - .014, innerGuide = bendRadius - .012
const outerGuide = bendRadius + .012, outerEdge = bendRadius + .014
const bendFloor = .001, bendRim = .010
function bendPoint(sector: number, radius: number, y: number): Triple {
  const theta = sector * Math.PI / (2 * bendSectors)
  return [bendRadius / 2 - radius * Math.cos(theta), y, -bendRadius / 2 + radius * Math.sin(theta)]
}

// Sweep an open-ended channel. Adjacent spans share vertices, including at the
// floor-to-guide edges. There are no transverse faces for a rolling ball to hit.
const bendSection = [[innerEdge, 0], [innerEdge, bendRim], [innerGuide, bendRim], [innerGuide, bendFloor],
  [outerGuide, bendFloor], [outerGuide, bendRim], [outerEdge, bendRim], [outerEdge, 0]]
export const bendSurface = { vertices: [] as number[], indices: [] as number[] }
for (let sector = 0; sector <= bendSectors; sector++) {
  for (const [radius, height] of bendSection) bendSurface.vertices.push(...bendPoint(sector, radius, height))
  if (sector === bendSectors) break
  const count = bendSection.length
  for (let j = 0; j < count; j++) {
    const a = sector * count + j, b = sector * count + (j + 1) % count
    bendSurface.indices.push(a, b, b + count, a, b + count, a + count)
  }
}

// Closed volumes describe the model, support footprint and editor overlaps.
catalog.bend = []
for (let i = 0; i < bendSectors; i++) {
  for (const [inner, outer, floor, top] of [
    [innerEdge, outerEdge, 0, bendFloor], [innerEdge, innerGuide, bendFloor, bendRim],
    [outerGuide, outerEdge, bendFloor, bendRim],
  ]) {
    const corners: Triple[] = []
    for (const a of [i, i + 1]) for (const r of [inner, outer]) for (const y of [floor, top]) {
      corners.push(bendPoint(a, r, y))
    }
    catalog.bend.push(hull(corners))
  }
}

catalog.stand = [
  box([-.022, .002, 0], [.008, .004, .028]), box([.022, .002, 0], [.008, .004, .028]),
  ...[-.022, .022].map(x => box([x, .034, 0], [.003, .064, .005])),
  box([0, .066, 0], [.046, .003, .004]),
]
catalog.bob = [box([0, -.021, 0], [.002, .042, .002]),
{ kind: 'sphere', at: [0, -.046, 0], size: [.019, .019, .019] }]
catalog.fulcrum = [box([0, .002, 0], [.038, .004, .024]),
...[-.017, .017].map(x => box([x, .019, 0], [.003, .038, .010]))]
catalog.lever = [box([0, 0, .006], [.029, .003, .094])]
for (const z of [-.033, .045]) {
  for (const x of [-.014, .014]) catalog.lever.push(box([x, .003, z], [.002, .006, .020]))
  for (const dz of [-.009, .009]) catalog.lever.push(box([0, .0037, z + dz], [.027, .0074, .002]))
}
catalog.hinge = [box([0, .003, -.005], [.039, .006, .012])]
catalog.leaf = [box([0, 0, .032], [.032, .003, .064]),
...[-.015, .015].map(x => box([x, .003, .032], [.002, .006, .064]))]
catalog.latch = [box([0, .013, 0], [.012, .026, .003])]
catalog.stamp = [cylinder([0, .00012, 0], .026, .00024)]

catalog.oldcradle = catalog.cradle
catalog.cradle = catalog.oldcradle.map(s => box([s.at[0], s.at[1] / 2, s.at[2]], [s.size[0], s.size[1] / 2, s.size[2]]))
catalog.spacer = [box([0, .009, 0], [.024, .018, .026])]
catalog.pencilcase = [box([0, .006, 0], [.037, .012, .080])]
catalog.casebox = [box([0, .009, 0], [.14, .018, .085])]
catalog.press = [cylinder([0, .002, 0], .031, .004)]
catalog.socket = [box([0, .003, 0], [.019, .006, .016])]
catalog.motor = [box([0, .006, 0], [.015, .012, .017])]
catalog.doorleaf = [box([.023, .013, 0], [.046, .026, .003])]
catalog.slider = [box([0, .007, 0], [.028, .014, .003])]
catalog.housing = [
  box([.030, .008, -.0035], [.032, .016, .002]),
  box([.030, .008, .0035], [.032, .016, .002]),
  box([.030, .017, 0], [.032, .002, .009]),
]
export interface Part {
  key: string
  asset: string
  at: Triple
  yaw?: number
  pitch?: number
  slide?: 'x' | 'y'
  hinge?: 'x' | 'y'
  limits?: [number, number]
  mass?: number
}
export const assemblies: Record<string, Part[]> = {
  switch: [{ key: 'base', asset: 'socket', at: [0, 0, -.008] }, { key: 'paddle', asset: 'paddle', at: [0, .003, 0] }],
  button: [{ key: 'base', asset: 'socket', at: [0, 0, 0] }, { key: 'press', asset: 'press', at: [0, .010, 0], slide: 'y', limits: [-.004, 0], mass: .002 }],
  door: [{ key: 'motor', asset: 'motor', at: [-.009, 0, -.009] }, { key: 'doorleaf', asset: 'doorleaf', at: [0, .002, 0], hinge: 'y', limits: [0, 1.48], mass: .005 }],
  shutter: [{ key: 'housing', asset: 'housing', at: [0, 0, 0], yaw: Math.PI }, { key: 'motor', asset: 'motor', at: [-.039, 0, .013] },
  { key: 'slider', asset: 'slider', at: [0, .0004, 0], slide: 'x', limits: [-.031, 0], mass: .003 },
  { key: 'diverter', asset: 'diverter', at: [.040, 0, -.016], yaw: Math.PI / 2 },
  { key: 'tray', asset: 'tray', at: [.079, 0, -.016], yaw: Math.PI / 2 }],
  drawbridge: [{ key: 'base', asset: 'hinge', at: [0, 0, -.004] }, { key: 'motor', asset: 'motor', at: [.011, 0, -.017] },
  { key: 'leaf', asset: 'leaf', at: [0, .005, 0], pitch: -1.14, hinge: 'x', limits: [-1.14, 0], mass: .006 }],
  pendulum: [{ key: 'base', asset: 'stand', at: [0, 0, 0] },
  { key: 'bob', asset: 'bob', at: [0, .058, 0], hinge: 'x', limits: [-1.35, 1.35], mass: .004 }],
  seesaw: [{ key: 'base', asset: 'fulcrum', at: [0, 0, 0] },
  { key: 'lever', asset: 'lever', at: [0, .039, 0], pitch: .63, hinge: 'x', limits: [.22, .63], mass: .0011 }],
  bridge: [{ key: 'base', asset: 'hinge', at: [0, 0, 0] },
  { key: 'leaf', asset: 'leaf', at: [0, .005, 0], pitch: -1.14, hinge: 'x', limits: [-1.14, 0], mass: .006 },
  { key: 'latch', asset: 'latch', at: [-.027, .002, -.004], hinge: 'y', limits: [-.9, .9], mass: .001 }],
  valve: [{ key: 'canal', asset: 'channel', at: [0, 0, 0] }, { key: 'paddle', asset: 'paddle', at: [-.03, 0, -.018] },
  { key: 'gate', asset: 'gate', at: [0, 0, .018], yaw: -.72 }, { key: 'diverter', asset: 'diverter', at: [.017, 0, .041], yaw: .84 },
  { key: 'tray', asset: 'tray', at: [.05, 0, .065], yaw: .84 }],
}
export function partRotation(p: Part) {
  return new Quaternion().setFromEuler(new Euler(p.pitch ?? 0, p.yaw ?? 0, 0, 'YXZ'))
}
for (const [name, parts] of Object.entries(assemblies)) {
  catalog[name] = parts.flatMap(part => catalog[part.asset].map(s => {
    const q = partRotation(part)
    const at = new Vector3(...s.at).applyQuaternion(q).add(new Vector3(...part.at)).toArray() as Triple
    const rot = new Euler().setFromQuaternion(q.multiply(new Quaternion().setFromEuler(new Euler(...(s.rot ?? [0, 0, 0])))))
    return { ...s, at, rot: [rot.x, rot.y, rot.z] as Triple }
  }))
}
export const leverSeat = new Vector3(0, .0095, .045).applyQuaternion(partRotation(assemblies.seesaw[1]))
  .add(new Vector3(...assemblies.seesaw[1].at))
export const assetIds = Object.keys(catalog)
export const modelIds = assetIds.filter(id => !assemblies[id])
export function shapes(asset: string): Shape[] {
  if (!Object.hasOwn(catalog, asset)) throw new Error('Activo desconocido: ' + asset)
  return catalog[asset]
}

type PuntoBase = [number, number]
const apoyosDelActivo = new Map<string, PuntoBase[][]>()

/** Horizontal contact patches in the assembled rest pose, measured from the asset pivot. */
export function bases(asset: string): PuntoBase[][] {
  const cached = apoyosDelActivo.get(asset)
  if (cached) return cached
  const pads: PuntoBase[][] = []
  for (const shape of shapes(asset)) {
    const vertices: Triple[] = []
    const [w, h, d] = shape.size
    if (shape.kind === 'box') {
      for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-d / 2, d / 2]) vertices.push([x, y, z])
    } else if (shape.kind === 'hull') {
      const points = shape.points!
      for (let i = 0; i < points.length; i += 3) vertices.push([points[i], points[i + 1], points[i + 2]])
    } else if (shape.kind === 'cylinder') {
      for (let i = 0; i < 64; i++) {
        const t = i * Math.PI / 32
        vertices.push([w / 2 * Math.cos(t), -h / 2, d / 2 * Math.sin(t)])
      }
    }
    const rot = new Euler(...(shape.rot ?? [0, 0, 0]))
    const pad: PuntoBase[] = []
    for (const v of vertices) {
      const p = new Vector3(...v).applyEuler(rot).add(new Vector3(...shape.at))
      if (Math.abs(p.y) < 1e-7) pad.push([p.x, p.z])
    }
    if (pad.length < 3) continue
    const cx = pad.reduce((sum, p) => sum + p[0], 0) / pad.length
    const cz = pad.reduce((sum, p) => sum + p[1], 0) / pad.length
    pad.sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx))
    pads.push(pad)
  }
  apoyosDelActivo.set(asset, pads)
  return pads
}
