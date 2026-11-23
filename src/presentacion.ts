import { Quaternion } from 'three'
import type { BodyPose } from './simulation'

/** This map is a presentation buffer. Never store it as a physics/history snapshot. */
export class Interpolacion {
  private poses = new Map<string, BodyPose>()
  private a = new Quaternion()
  private b = new Quaternion()
  actualizar(antes: ReadonlyMap<string, BodyPose>, ahora: ReadonlyMap<string, BodyPose>, t: number) {
    for (const id of this.poses.keys()) if (!ahora.has(id)) this.poses.delete(id)
    for (const [id, b] of ahora) {
      const a = antes.get(id) ?? b, q = this.a.fromArray(a.q).slerp(this.b.fromArray(b.q), t)
      let pose = this.poses.get(id)
      if (!pose) { pose = { p: [0, 0, 0], q: [0, 0, 0, 1] }; this.poses.set(id, pose) }
      for (let i = 0; i < 3; i++) pose.p[i] = a.p[i] + (b.p[i] - a.p[i]) * t
      pose.q[0] = q.x; pose.q[1] = q.y; pose.q[2] = q.z; pose.q[3] = q.w
    }
    return this.poses
  }
}

export class PresentacionPrevia {
  private cuadro?: number
  private ultima?: () => void
  programar(actualizar: () => void) {
    this.ultima = actualizar
    this.cuadro ??= requestAnimationFrame(() => { this.cuadro = undefined; const ultima = this.ultima; this.ultima = undefined; ultima?.() })
  }
  cancelar() {
    if (this.cuadro !== undefined) cancelAnimationFrame(this.cuadro)
    this.cuadro = undefined; this.ultima = undefined
  }
}

/** Batch input, not geometry: every sample reaches the same gesture in order. */
export class EntradaPorCuadro<T> {
  private cuadro?: number
  private muestras: T[] = []
  private actualizar?: (muestras: T[]) => void
  agregar(muestras: T[], actualizar: (muestras: T[]) => void) {
    this.muestras.push(...muestras)
    this.actualizar = actualizar
    this.cuadro ??= requestAnimationFrame(() => this.consumir())
  }
  consumir() {
    if (this.cuadro !== undefined) cancelAnimationFrame(this.cuadro)
    this.cuadro = undefined
    const muestras = this.muestras, actualizar = this.actualizar
    this.muestras = []; this.actualizar = undefined
    if (muestras.length) actualizar?.(muestras)
  }
  cancelar() {
    if (this.cuadro !== undefined) cancelAnimationFrame(this.cuadro)
    this.cuadro = undefined; this.muestras = []; this.actualizar = undefined
  }
}
