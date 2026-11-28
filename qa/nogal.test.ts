import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MapeadoMesa } from '../render/fotorealista/src/nogal'
import type { Geometria } from '../src/render/contrato'

function box(w: number, h: number, d: number): Geometria {
  const g = new THREE.BoxGeometry(w, h, d)
  return { id: g.uuid, attributes: Object.fromEntries(Object.entries(g.attributes).map(([key, a]) =>
    [key, { array: a.array, itemSize: a.itemSize, normalized: a.normalized }])),
    index: { array: g.index!.array, itemSize: 1, normalized: false }, groups: g.groups,
    drawRange: { start: 0, count: Infinity } }
}
function span(g: Geometria, facing: number, uvAxis: number) {
  const n = g.attributes.normal.array, uv = g.attributes.uv.array, values = []
  for (let i = 0; i < n.length / 3; i++) if (n[i * 3 + facing] === 1) values.push(uv[i * 2 + uvAxis])
  return Math.max(...values) - Math.min(...values)
}

describe('nogal a escala física', () => {
  it('cubre cada mesa con un recorte métrico, sin repetir ni estirar el escaneo de un metro', () => {
    const mapping = new MapeadoMesa(), source = box(.42, .018, .26), originalUV = source.attributes.uv.array.slice()
    for (const [w, d] of [[.42,.26], [.6,.4], [.8,.5], [.9,.9], [.84,.52]]) {
      const matrix = new THREE.Matrix4().makeScale(w / .42, 1, d / .26).toArray()
      const mapped = mapping.map(source, matrix)
      expect(span(mapped, 1, 0)).toBeCloseTo(w, 5)
      expect(span(mapped, 1, 1)).toBeCloseTo(d, 5)
      expect(Math.min(...mapped.attributes.uv.array)).toBeGreaterThan(0)
      expect(Math.max(...mapped.attributes.uv.array)).toBeLessThan(1)
      expect(mapped.attributes.position).toBe(source.attributes.position)
      expect(mapped.index).toBe(source.index)
      expect(mapping.map(source, matrix)).toBe(mapped)
    }
    expect(source.attributes.uv.array).toEqual(originalUV)
  })

  it('orienta las fibras a lo largo de las patas y de ambos tipos de travesaño', () => {
    const mapping = new MapeadoMesa(), matrix = new THREE.Matrix4().toArray()
    const leg = mapping.map(box(.014,.134,.014), matrix)
    const railX = mapping.map(box(.8,.014,.007), matrix)
    const railZ = mapping.map(box(.007,.014,.5), matrix)
    expect(span(leg, 0, 0)).toBeCloseTo(.134)
    expect(span(railX, 2, 0)).toBeCloseTo(.8)
    expect(span(railZ, 0, 0)).toBeCloseTo(.5)
  })

  it('mantiene separados los recortes de arce y conserva la orientación y la geometría del canto', () => {
    const mapping = new MapeadoMesa(), source = box(.025,.05,.008), matrix = new THREE.Matrix4().toArray()
    const natural = mapping.map(source,matrix), domino = mapping.map(source,matrix,6)
    expect(span(domino,0,0)).toBeCloseTo(.05*6)
    expect(span(domino,0,1)).toBeCloseTo(.008*6)
    expect(span(natural,0,1)).toBeCloseTo(.008)
    expect(domino.id).not.toBe(natural.id)
    expect(mapping.map(source,matrix,6)).toBe(domino)
    expect(domino.attributes.position).toBe(source.attributes.position)
    expect(domino.index).toBe(source.index)
  })

  it('no desliza ni regenera la veta al rotar o trasladar una mesa', () => {
    const mapping = new MapeadoMesa(), source = box(.42,.018,.26)
    const initial = mapping.map(source, new THREE.Matrix4().makeScale(2,1,2).toArray())
    for (let angle = 0; angle < 360; angle += 15) {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(.1,0,-.3),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), angle * Math.PI / 180), new THREE.Vector3(2,1,2))
      expect(mapping.map(source, matrix.toArray())).toBe(initial)
    }
  })
})
