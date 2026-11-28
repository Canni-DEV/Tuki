import type { MeshPhysicalNodeMaterial, Node } from 'three/webgpu'
import { bitangentViewFrame, float, mix, normalViewGeometry, positionViewDirection, smoothstep, tangentViewFrame, uv } from 'three/tsl'
import type { Geometria } from '../../../src/render/contrato'

// The GLB exports a separate ivory primitive per visible pip set. UV seams and
// the tiny original bevel split its vertices, so weld the 2D footprint per face.
const cache = new WeakMap<Geometria, Geometria>()
export function aperturas(source: Geometria): Geometria {
  const cached = cache.get(source)
  if (cached) return cached
  const p = source.attributes.position.array, indices = source.index?.array
  const count = p.length / 3, parent = Array.from({ length: count }, (_, i) => i)
  function root(i: number): number {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  const corners = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    const key = [Math.round(p[i*3]*1e7), Math.round(p[i*3+1]*1e7), Math.sign(p[i*3+2])].join('/')
    const previous = corners.get(key)
    if (previous !== undefined) parent[i] = previous
    else corners.set(key, i)
  }
  for (let i = 0; i < (indices?.length ?? count); i += 3) {
    const a = root(indices?.[i] ?? i)
    parent[root(indices?.[i+1] ?? i+1)] = a
    parent[root(indices?.[i+2] ?? i+2)] = a
  }
  const apertures = new Map<number, {xmin:number; xmax:number; ymin:number; ymax:number; z:number}>()
  for (let i = 0; i < count; i++) {
    const key = root(i), x = p[i*3], y = p[i*3+1], z = p[i*3+2]
    const b = apertures.get(key) ?? {xmin:x,xmax:x,ymin:y,ymax:y,z}
    b.xmin = Math.min(b.xmin,x); b.xmax = Math.max(b.xmax,x)
    b.ymin = Math.min(b.ymin,y); b.ymax = Math.max(b.ymax,y)
    if (Math.abs(z) > Math.abs(b.z)) b.z = z
    apertures.set(key,b)
  }
  const pos:number[] = [], normal:number[] = [], tex:number[] = [], triangles:number[] = []
  const segments = 32
  for (const {xmin,xmax,ymin,ymax,z} of apertures.values()) {
    const start = pos.length / 3, cx = (xmin+xmax)/2, cy = (ymin+ymax)/2, sign = Math.sign(z)
    pos.push(cx,cy,z); normal.push(0,0,sign); tex.push(0,0)
    for (let j=0; j<segments; j++) {
      const angle = sign * j * 2*Math.PI/segments, u = Math.cos(angle), v = Math.sin(angle)
      pos.push(cx+u*(xmax-xmin)/2,cy+v*(ymax-ymin)/2,z); normal.push(0,0,sign); tex.push(u,v)
      triangles.push(start,start+1+j,start+1+(j+1)%segments)
    }
  }
  const attr = (v:number[],itemSize:number) => ({array:new Float32Array(v),itemSize,normalized:false})
  const result:Geometria = {id:source.id+'/cavidades',attributes:{position:attr(pos,3),normal:attr(normal,3),uv:attr(tex,2)},
    index:{array:new Uint16Array(triangles),itemSize:1,normalized:false},groups:[],drawRange:{start:0,count:triangles.length}}
  cache.set(source,result)
  return result
}

export function grabarPuntos(material: MeshPhysicalNodeMaterial) {
  // All vectors are in view space. Derivatives of the aperture include the
  // instance matrix, which differs for every falling tile in the same draw.
  const st = uv(), n = normalViewGeometry
  // The r187 declarations omit the vec3 output type of the derivative frame.
  const tangent = tangentViewFrame as Node<'vec3'>, bitangent = bitangentViewFrame as Node<'vec3'>
  const origin = tangent.normalize().mul(st.x).add(bitangent.normalize().mul(st.y)).sub(n.mul(.32))
  const ray = positionViewDirection.negate(), along = origin.dot(ray)
  const distance = along.negate().add(along.mul(along).add(1+.32*.32).sub(origin.dot(origin)).max(0).sqrt())
  const inward = origin.add(ray.mul(distance)).normalize().negate()
  const detail = smoothstep(.7, 3, float(1).div(st.fwidth().length().max(.001)))
  material.normalNode = mix(n, inward, detail).normalize()
  material.aoNode = mix(float(.83), float(1).sub(inward.dot(n).max(0).mul(.38)), detail)
}
