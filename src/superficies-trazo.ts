import { surfaceRect } from './levels'
import type { Nivel, Vec3 } from './types'

// Gesture tolerance only; physical contacts keep their much smaller epsilon.
export const toleranciaAlturaTrazo = .002
export const alturasCompatibles = (a: number, b: number) => Math.abs(a - b) <= toleranciaAlturaTrazo + 1e-9

export class SuperficiesTrazo {
  readonly tapas
  constructor(n: Nivel) {
    this.tapas = n.superficies.filter(s => s.zona === 'tapa' && s.admite.includes('domino'))
      .map(s => ({ ...s, ...surfaceRect(n, s.id) })).sort((a, b) => b.y - a.y)
  }

  private local(p: Vec3, s: typeof this.tapas[number]) {
    const dx = p[0] - s.x, dz = p[2] - s.z
    return [dx * Math.cos(s.ang) - dz * Math.sin(s.ang), dx * Math.sin(s.ang) + dz * Math.cos(s.ang)]
  }

  en(p: Vec3) {
    let alternativa: typeof this.tapas[number] | undefined
    for (const s of this.tapas) {
      const [x, z] = this.local(p, s)
      const dentro = s.circular ? (x / (s.w / 2)) ** 2 + (z / (s.d / 2)) ** 2 <= 1 + 1e-9 :
        Math.abs(x) <= s.w / 2 + 1e-9 && Math.abs(z) <= s.d / 2 + 1e-9
      if (!dentro) continue
      // Stay on the current layer under a roof. Collision checks still reject
      // an obstruction, and the fallback preserves the step error at an edge.
      if (alturasCompatibles(s.y, p[1])) return s
      alternativa ??= s
    }
    return alternativa
  }

  /** Probe both boundaries and their interiors so even a thin gap stops a fast drag. */
  cortes(a: Vec3, b: Vec3) {
    const cortes = [0, 1]
    for (const s of this.tapas) {
      const inicio = this.local(a, s), fin = this.local(b, s)
      const delta = fin.map((v, i) => v - inicio[i])
      let desde = 0, hasta = 1
      if (s.circular) {
        const x = inicio[0] / (s.w / 2), z = inicio[1] / (s.d / 2)
        const dx = delta[0] / (s.w / 2), dz = delta[1] / (s.d / 2)
        const A = dx * dx + dz * dz, B = 2 * (x * dx + z * dz), C = x * x + z * z - 1
        const discriminante = B * B - 4 * A * C
        if (!A || discriminante < 0) continue
        desde = Math.max(0, (-B - Math.sqrt(discriminante)) / (2 * A))
        hasta = Math.min(1, (-B + Math.sqrt(discriminante)) / (2 * A))
      } else {
        for (let k = 0; k < 2; k++) {
          const mitad = (k ? s.d : s.w) / 2
          if (Math.abs(delta[k]) < 1e-12) {
            if (Math.abs(inicio[k]) > mitad) hasta = -1
          } else {
            const t1 = (-mitad - inicio[k]) / delta[k], t2 = (mitad - inicio[k]) / delta[k]
            desde = Math.max(desde, Math.min(t1, t2)); hasta = Math.min(hasta, Math.max(t1, t2))
          }
        }
      }
      if (desde <= hasta) cortes.push(desde, hasta)
    }
    const bordes = [...new Set(cortes)].sort((a, b) => a - b)
    return bordes.flatMap((t, i) => i ? [(bordes[i - 1] + t) / 2, t] : [t])
  }
}
