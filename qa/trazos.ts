import type { Vec3 } from '../src/types'

export const trazoRecta: Vec3[] = [[-.054, 0, 0], [.055, 0, 0]]
export const trazoS: Vec3[] = Array.from({ length: 51 }, (_, i) => {
  const t = i / 55
  return [-.078 + .172 * t, 0, -.033 * Math.sin(2 * Math.PI * (t - .02))]
})
