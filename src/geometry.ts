import R from '@dimforge/rapier3d-compat'
import { Euler, Quaternion, Vector3 } from 'three'
import { shapes } from './shapes'
import type { Pose, Vec3 } from './types'

export const vector = (v: Vec3) => new Vector3(...v)
export const yaw = (degrees: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (degrees * Math.PI) / 180)
export function colliders(asset: string, scale: Vec3 = [1, 1, 1]) {
  return shapes(asset).map((s) => {
    const [x, y, z] = s.size.map((n, i) => n * scale[i])
    let c: R.ColliderDesc
    if (s.kind === 'hull') {
      const points = Float32Array.from(s.points!, (n, i) => n * scale[i % 3])
      c = R.ColliderDesc.convexHull(points)!
      if (!c) throw new Error('Geometría convexa inválida en ' + asset)
    } else if (s.kind === 'sphere') c = R.ColliderDesc.ball(x / 2)
    else if (s.kind === 'cylinder') c = R.ColliderDesc.cylinder(y / 2, x / 2)
    else c = R.ColliderDesc.cuboid(x / 2, y / 2, z / 2)
    c.setTranslation(s.at[0] * scale[0], s.at[1] * scale[1], s.at[2] * scale[2])
    if (s.rot) c.setRotation(new Quaternion().setFromEuler(new Euler(...s.rot)))
    return c
  })
}
export function placedShapes(asset: string, pose: Pose, scale?: Vec3) {
  const q = yaw(pose.giroY)
  return colliders(asset, scale).map((c) => ({
    shape: c.shape,
    p: new Vector3().copy(c.translation).applyQuaternion(q).add(vector(pose.posicion)),
    q: q.clone().multiply(new Quaternion().copy(c.rotation)),
  }))
}
