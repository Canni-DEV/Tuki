import type { Geometria } from '../../../src/render/contrato'

/** UVs in metres for the one-metre walnut scan. Only the photo presentation owns them. */
export class MapeadoMesa {
  private cache = new WeakMap<Geometria, Map<string, Geometria>>()

  map(source: Geometria, matrix: number[]): Geometria {
    const position = source.attributes.position, normal = source.attributes.normal
    if (!position || !normal) return source
    // Column lengths retain object scale, independent of camera, translation and rotation.
    const scale = [0, 4, 8].map(i => Math.round(Math.hypot(...matrix.slice(i, i + 3)) * 1e6) / 1e6)
    const key = scale.join('/')
    let variants = this.cache.get(source)
    const saved = variants?.get(key)
    if (saved) return saved

    const p = position.array, n = normal.array, count = p.length / position.itemSize
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < count; i++) for (let axis = 0; axis < 3; axis++) {
      const value = p[i * position.itemSize + axis]
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
    }
    // The board's local long axis remains its grain axis even on the square table.
    // For the joinery this selects vertical grain on legs, longitudinal grain on rails.
    const axes = [0, 1, 2].sort((a, b) => (max[b] - min[b]) - (max[a] - min[a]))
    const uv = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      const facing = [0, 1, 2].sort((a, b) => Math.abs(n[i * normal.itemSize + b]) - Math.abs(n[i * normal.itemSize + a]))[0]
      const uAxis = axes.find(axis => axis !== facing)!
      const vAxis = axes.find(axis => axis !== facing && axis !== uAxis)!
      // Veneer on the ends follows the edge band, rather than stretching top grain.
      // U is the scan's horizontal fibre; V is the perpendicular direction.
      uv[i * 2] = .5 + p[i * position.itemSize + uAxis] * scale[uAxis]
      uv[i * 2 + 1] = .5 + p[i * position.itemSize + vAxis] * scale[vAxis] * (facing === 1 ? -1 : 1)
    }
    const { tangent: _oldTangent, ...attributes } = source.attributes
    const result: Geometria = { ...source, id: `${source.id}/nogal/${key}`,
      attributes: { ...attributes, uv: { array: uv, itemSize: 2, normalized: false } } }
    if (!variants) { variants = new Map(); this.cache.set(source, variants) }
    variants.set(key, result)
    return result
  }
}
