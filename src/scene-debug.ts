import * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { bendSurface, shapes, type Shape } from './shapes'

/** Disponible en la revisión de activos mediante ?colisionadores. */
export function mostrarColisionadores(asset: string) {
  const group = new THREE.Group()
  const outline = new THREE.LineBasicMaterial({ color: 0x167d85, depthTest: false, transparent: true, opacity: .72 })
  function wire(geometry: THREE.BufferGeometry, shape?: Shape) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 7), outline)
    geometry.dispose()
    if (shape) edges.position.fromArray(shape.at)
    if (shape?.rot) edges.rotation.set(...shape.rot)
    edges.renderOrder = 5
    group.add(edges)
  }
  if (asset === 'bend') {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bendSurface.vertices, 3))
    geometry.setIndex(bendSurface.indices)
    wire(geometry)
  } else for (const shape of shapes(asset)) {
    const [width, height, depth] = shape.size
    let geometry: THREE.BufferGeometry
    switch (shape.kind) {
      case 'box': geometry = new THREE.BoxGeometry(width, height, depth); break
      case 'sphere': geometry = new THREE.SphereGeometry(width / 2, 12, 8); break
      case 'cylinder': geometry = new THREE.CylinderGeometry(width / 2, width / 2, height, 14); break
      case 'hull': {
        const points = []
        for (let i = 0; i < (shape.points?.length ?? 0); i += 3) {
          points.push(new THREE.Vector3(...shape.points!.slice(i, i + 3) as [number, number, number]))
        }
        geometry = new ConvexGeometry(points)
        break
      }
    }
    wire(geometry, shape)
  }
  const axes = new THREE.AxesHelper(.022)
  group.add(axes)
  group.userData.disposeOverlay = () => {
    outline.dispose()
    for (const item of group.children) if (item instanceof THREE.LineSegments && item !== axes) item.geometry.dispose()
    axes.dispose()
  }
  return group
}
