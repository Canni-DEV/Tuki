import R from '@dimforge/rapier3d-compat'
import { ensayarEquilibrio } from './equilibrio'
import type { PiezaColocada } from './types'

let listo: Promise<void> | undefined
self.onmessage = async (e: MessageEvent<{ id: number; piezas: PiezaColocada[] }>) => {
  const { id, piezas } = e.data
  try {
    await (listo ??= R.init().catch(error => { listo = undefined; throw error }))
    self.postMessage({ id, fallo: ensayarEquilibrio(piezas) })
  } catch { self.postMessage({ id, error: 'No se pudo comprobar el apoyo. Volvé a intentar.' }) }
}
