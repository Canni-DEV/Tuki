import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { cantidadPortada, dibujarPortada, duracionPortada } from '../src/portada'
import clip from '../src/data/portada.json'

// Use the exported art's complete bounds, including ink and every pip variant.
const bytes = readFileSync(new URL('../public/models/domino.glb', import.meta.url))
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  const accessor = gltf.accessors[primitive.attributes.POSITION]
  for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], accessor.min[i]); max[i] = Math.max(max[i], accessor.max[i]) }
}
const centro = new Vector3(...min.map((n, i) => (n + max[i]) / 2) as [number, number, number])
const mitad = min.map((n, i) => (max[i] - n) / 2)
const piezas = () => Array.from({ length: cantidadPortada }, () => new Object3D())
function caja(pieza: Object3D) {
  return {
    centro: centro.clone().applyQuaternion(pieza.quaternion).add(pieza.position),
    ejes: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map(v => v.applyQuaternion(pieza.quaternion)),
  }
}
function distancia(a: ReturnType<typeof caja>, b: ReturnType<typeof caja>) {
  const delta = b.centro.clone().sub(a.centro)
  const ejes = [...a.ejes, ...b.ejes, ...a.ejes.flatMap(u => b.ejes.map(v => u.clone().cross(v)))]
  return Math.max(...ejes.filter(n => n.lengthSq() > 1e-10).map(n => {
    n = n.clone().normalize()
    const radio = (c: typeof a) => c.ejes.reduce((sum, v, i) => sum + Math.abs(v.dot(n)) * mitad[i], 0)
    return Math.abs(delta.dot(n)) - radio(a) - radio(b)
  }))
}

it('la grabación corresponde al modelo exportado y termina con todas las fichas caídas', () => {
  expect(clip.modelSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  expect(clip.version).toBe(1)
  const fila = piezas()
  dibujarPortada(fila, 0)
  expect(fila.every(p => new Vector3(0, 1, 0).applyQuaternion(p.quaternion).y > .999)).toBe(true)
  dibujarPortada(fila, duracionPortada)
  expect(fila.every(p => new Vector3(0, 1, 0).applyQuaternion(p.quaternion).y < .5)).toBe(true)
  const final = fila.map(p => [...p.position.toArray(), ...p.quaternion.toArray()])
  dibujarPortada(fila, duracionPortada + 60000)
  expect(fila.map(p => [...p.position.toArray(), ...p.quaternion.toArray()])).toEqual(final)
})

it('los volúmenes que encierran los modelos no se cruzan ni penetran la mesa, también entre muestras', () => {
  const fila = piezas()
  let entrePiezas = Infinity, sobreMesa = Infinity
  // Subdivide the *playback* more finely than the offline physics, independently of Rapier.
  const pasos = clip.frames.length * 12
  for (let i = 0; i <= pasos; i++) {
    dibujarPortada(fila, duracionPortada * i / pasos)
    const cajas = fila.map(caja)
    for (let a = 0; a < cajas.length; a++) {
      const c = cajas[a]
      sobreMesa = Math.min(sobreMesa, c.centro.y - c.ejes.reduce((sum, v, k) => sum + Math.abs(v.y) * mitad[k], 0))
      for (let b = a + 1; b < cajas.length; b++) entrePiezas = Math.min(entrePiezas, distancia(c, cajas[b]))
    }
  }
  expect(entrePiezas, 'Separación mínima entre las cajas del arte, en metros').toBeGreaterThan(0)
  expect(sobreMesa, 'Separación mínima respecto al tablero, en metros').toBeGreaterThan(0)
})

it('la caída avanza en orden y la reproducción no depende de los fotogramas anteriores', () => {
  const fila = piezas(), caidas = Array<number>(cantidadPortada).fill(Infinity)
  for (let t = 0; t <= duracionPortada; t += 2) {
    dibujarPortada(fila, t)
    fila.forEach((p, i) => {
      if (new Vector3(0, 1, 0).applyQuaternion(p.quaternion).y < .8) caidas[i] = Math.min(caidas[i], t)
    })
  }
  expect(caidas.every(Number.isFinite)).toBe(true)
  expect(caidas.every((t, i) => i === 0 || t > caidas[i - 1])).toBe(true)
  const salto = piezas()
  dibujarPortada(salto, 593)
  dibujarPortada(fila, 593)
  expect(fila.map(p => p.position.toArray())).toEqual(salto.map(p => p.position.toArray()))
  expect(fila.map(p => p.quaternion.toArray())).toEqual(salto.map(p => p.quaternion.toArray()))
})
