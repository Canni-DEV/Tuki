import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { aperturas } from '../render/fotorealista/src/puntos'
import { PresentacionRender } from '../src/render/presentacion'

const bytes = readFileSync(new URL('../public/models/domino.glb', import.meta.url))
const jsonBytes = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonBytes)) as {
  nodes: { name?: string; mesh?: number }[]
  meshes: { primitives: { attributes: { POSITION: number }; indices: number; material: number }[] }[]
  materials: { name?: string }[]
  accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number; type: string }[]
  bufferViews: { byteOffset?: number }[]
}
const data = bytes.subarray(20 + jsonBytes + 8)

function component(index: number) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView]
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  if (accessor.componentType === 5126) {
    const values = new Float32Array(accessor.count * 3)
    for (let i = 0; i < values.length; i++) values[i] = data.readFloatLE(offset + i * 4)
    return values
  }
  const values = new Uint16Array(accessor.count)
  for (let i = 0; i < values.length; i++) values[i] = data.readUInt16LE(offset + i * 2)
  return values
}

function materialGeometry(name: string) {
  const node = gltf.nodes.find(n => n.name === name)!
  const primitive = gltf.meshes[node.mesh!].primitives.find(p => gltf.materials[p.material].name === 'Marfil de los puntos')!
  return {
    id: name,
    attributes: { position: { array: component(primitive.attributes.POSITION), itemSize: 3, normalized: false } },
    index: { array: component(primitive.indices), itemSize: 1, normalized: false },
    groups: [], drawRange: { start: 0, count: 0 },
  }
}

const variants = [
  ['pipset_0', [[-.0049,.0418],[.0049,.0324],[0,.0124]]],
  ['pipset_1', [[.0049,.0418],[-.0049,.0324],[-.0049,.0171],[.0049,.0077]]],
  ['pipset_2', [[0,.0371],[.0049,.0171],[-.0049,.0077]]],
] as const

it.each(variants)('%s hunde 6/8/6 puntos centrados en ambas caras', (name, expected) => {
  const source = materialGeometry(name), result = aperturas(source)
  const positions = result.attributes.position.array, normals = result.attributes.normal.array
  const apertureCount = expected.length * 2
  expect(result.index!.array.length).toBe(apertureCount * 32 * 3)
  for (const [side, sign] of [[0,-1],[1,1]] as const) {
    const centers = Array.from({ length: expected.length }, (_, i) => {
      const vertex = (side * expected.length + i) * 33
      return [positions[vertex*3], positions[vertex*3+1], positions[vertex*3+2], normals[vertex*3+2]]
    }).sort((a,b) => b[1] - a[1] || a[0] - b[0])
    expect(centers.map(([x,y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])).toEqual(
      [...expected].sort((a,b) => b[1] - a[1] || a[0] - b[0]))
    expect(centers.every(([, , z, nz]) => Math.sign(z) === sign && nz === sign)).toBe(true)
  }
  expect(source.attributes.position.array).not.toBe(positions)
})

it('solo identifica las mallas pipset: excluye la línea central color marfil', () => {
  vi.stubGlobal('devicePixelRatio',1)
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,10)
  camera.position.z = 2; camera.lookAt(0,0,0)
  const material = new THREE.MeshStandardMaterial(); material.name = 'Marfil de los puntos'
  const pipScene = new THREE.Scene(), pipset = new THREE.Group(); pipset.name = 'pipset_1'
  pipset.add(new THREE.Mesh(new THREE.BoxGeometry(.002,.002,.0002),material)); pipScene.add(pipset)
  const positive = new PresentacionRender().capture(pipScene,camera,800,600,false).objects[0]
  expect(positive.grupoPuntos).toBe('pipset_1')

  const dominoScene = new THREE.Scene(), domino = new THREE.Group(); domino.name = 'domino'
  const line = new THREE.Mesh(new THREE.BoxGeometry(.028,.0005,.0005),material); line.name='linea-central'
  domino.add(line); dominoScene.add(domino)
  const central = new PresentacionRender().capture(dominoScene,camera,800,600,false).objects[0]
  expect(central.materials[0].name).toBe('Marfil de los puntos')
  expect(central.grupoPuntos).toBeUndefined()
})
