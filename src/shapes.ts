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

export const assetIds = Object.keys(catalog)
export function shapes(asset: string): Shape[] {
  if (!Object.hasOwn(catalog, asset)) throw new Error('Activo desconocido: ' + asset)
  return catalog[asset]
}
