import R from '@dimforge/rapier3d-compat'
import { ensayarEquilibrio } from './equilibrio'
import type { PiezaColocada } from './types'

let listo: Promise<void> | undefined
self.onmessage = async (e: MessageEvent<{ id: number; piezas: PiezaColocada[]; mesa?: [number, number] }>) => {
  const { id, piezas, mesa } = e.data
  try {
    await (listo ??= R.init().catch(error => { listo = undefined; throw error }))
    self.postMessage({ id, fallo: ensayarEquilibrio(piezas, mesa) })
  } catch { self.postMessage({ id, error: 'No se pudo comprobar el apoyo. Volvé a intentar.' }) }
}
