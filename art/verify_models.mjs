/** Check the exported art against the physical catalogue without Blender or a GPU. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Box3, Euler, Ray, Vector3 } from 'three'
import { escenario, modelIds, shapes } from '../src/shapes.ts'

function readAsset(id) {
  const bytes = readFileSync(new URL('../public/models/' + id + '.glb', import.meta.url))
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonEnd = 20 + bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, jsonEnd))
  assert.equal(gltf.scenes.length, 1)
  assert(gltf.nodes.some(n => n.name === id))
  assert(gltf.nodes.every(n => n.name === id || (id === 'domino' && /^pipset_[0-2]$/.test(n.name))))
  assert(gltf.nodes.every(n => !n.matrix && !n.translation && !n.rotation && !n.scale))
  assert(!gltf.buffers[0].uri && (gltf.images ?? []).every(image => Number.isInteger(image.bufferView)))

  const binary = bytes.subarray(jsonEnd + 8)
  function accessor(i, n) {
    const a = gltf.accessors[i]
    const view = gltf.bufferViews[a.bufferView]
    const elementBytes = {5121:1, 5123:2, 5125:4, 5126:4}[a.componentType]
    const count = a.type === 'VEC3' ? 3 : 1
    const pos = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + n*(view.byteStride ?? elementBytes*count)
    return count === 3
      ? new Vector3(binary.readFloatLE(pos),binary.readFloatLE(pos+4),binary.readFloatLE(pos+8))
      : binary.readUIntLE(pos, elementBytes)
  }

  const bounds = new Box3()
  const triangles = []
  for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
    const positions = gltf.accessors[prim.attributes.POSITION]
    bounds.expandByPoint(new Vector3(...positions.min))
    bounds.expandByPoint(new Vector3(...positions.max))
    if (id === 'funnel' || id === 'ramp' || escenario[id]?.tapa) {
      const count = gltf.accessors[prim.indices].count
      for (let n=0; n<count; n+=3) {
        const points = [0,1,2].map(k => accessor(prim.attributes.POSITION, accessor(prim.indices,n+k)))
        triangles.push({points, material: gltf.materials[prim.material].name})
      }
    }
  }
  return {bounds, triangles}
}

function colliderBounds(id) {
  const bounds = new Box3()
  for (const shape of shapes(id)) {
    const center = new Vector3(...shape.at)
    const euler = new Euler(...(shape.rot ?? [0,0,0]))
    const add = (x,y,z) => bounds.expandByPoint(new Vector3(x,y,z).applyEuler(euler).add(center))
    const [x,y,z] = shape.size.map(d => d/2)
    if (shape.points) {
      for (let i=0;i<shape.points.length;i+=3) add(...shape.points.slice(i,i+3))
    } else if (shape.kind === 'cylinder') {
      for (let i=0;i<64;i++) for (const yy of [-y,y]) add(x*Math.cos(i*Math.PI/32), yy, z*Math.sin(i*Math.PI/32))
    } else {
      for (const xx of [-x,x]) for (const yy of [-y,y]) for (const zz of [-z,z]) add(xx, yy, zz)
    }
  }
  return bounds
}

function heights(asset,x,z,material) {
  const ray = new Ray(new Vector3(x,.2,z),new Vector3(0,-1,0))
  return asset.triangles.flatMap(triangle => {
    if (material && triangle.material !== material) return []
    const hit = ray.intersectTriangle(...triangle.points,false,new Vector3())
    return hit ? [hit.y] : []
  })
}

const assets = new Map()
for (const id of modelIds) {
  const asset=readAsset(id)
  assets.set(id,asset)
  const physical=colliderBounds(id)
  for (const corner of ['min','max']) for (const axis of ['x','y','z']) {
    assert(Math.abs(asset.bounds[corner][axis]-physical[corner][axis]) < .0012,
      `${id}: visual and physical ${corner} ${axis} differ by over 1.2 mm`)
  }
}
for (const [id, asset] of assets) {
  const lid = escenario[id]?.tapa
  if (!lid) continue
  for (const x of [-.29,.13,.32]) for (const z of [-.24,.06,.28]) {
    const y = Math.max(...heights(asset,x*lid.ancho,z*lid.fondo))
    assert(Math.abs(y-lid.altura) < .00006, id+' lid differs from the construction plane at '+[x,z])
  }
}
const funnel=assets.get('funnel')
// Compare the actual exported silhouettes with the 50 mm domino on the table.
for (const [id, axis, mm] of [
  ['domino', 'y', 50], ['mate', 'y', 143], ['kettle', 'y', 181],
  ['coaster', 'x', 100], ['coaster', 'y', 6], ['tin', 'x', 90], ['tin', 'y', 130],
  ['napkins', 'x', 145], ['napkins', 'y', 105], ['napkins', 'z', 55],
]) {
  const size = assets.get(id).bounds.getSize(new Vector3())
  assert(Math.abs(size[axis] * 1000 - mm) < 1.2, id + ' has the wrong household scale on ' + axis)
}
for (let i=0;i<24;i++) {
  const angle = i*Math.PI/12
  assert.equal(heights(funnel,.008*Math.sin(angle),.008*Math.cos(angle)).length,0,'Ball blocked in funnel throat')
}
assert.equal(heights(funnel,0,0).length,0)
const ramp=assets.get('ramp')
for (const z of [-.04,0,.04]) {
  const expected=.0265 + (z+.0475)*(.001-.0265)/.095
  assert(Math.abs(Math.max(...heights(ramp,.001,z))-expected) < .0003,'Ramp slope differs from its collider')
}
const zapatos = assets.get('shoebox'), alturaTapa = escenario.shoebox.tapa.altura
assert.equal(heights(zapatos,.031,.009).filter(y => Math.abs(y-alturaTapa)<1e-7).length,1,
  'A second surface coincides with the shoebox lid')
const casebox = assets.get('casebox'), lid = colliderBounds('casebox').max.y
assert(Math.abs(casebox.bounds.max.y - lid) < 1e-7, 'The casebox model protrudes above its support plane')
// Sample either side of both label edges, away from triangle seams.
for (const [x,z,paper] of [[.023,.005,true],[-.013,-.012,true],[.025,.005,false],[-.013,-.013,false]]) {
  const onLid = y => Math.abs(y - lid) < 1e-7
  assert.equal(heights(casebox,x,z).filter(onLid).length,1,'The lid must have one visible surface')
  assert.equal(heights(casebox,x,z,'Marfil de los puntos').some(onLid),paper,'The paper must be flush with the lid')
}
console.log(`${assets.size} GLBs verified: local textures, metre scale, pivots, ramp slope, casebox lid and 16 mm funnel clearance.`)
