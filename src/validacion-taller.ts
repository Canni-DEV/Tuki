import type { FalloEquilibrio } from './equilibrio'
import type { PiezaColocada } from './types'

let worker: Worker | undefined, secuencia = 0
const pendientes = new Map<number, { resolver: (fallo: FalloEquilibrio | null) => void; rechazar: (e: Error) => void }>()
export function comprobarEnWorker(piezas: PiezaColocada[]): Promise<FalloEquilibrio | null> {
  if (!piezas.length) return Promise.resolve(null)
  if (!worker) {
    worker = new Worker(new URL('./equilibrio.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      const tarea = pendientes.get(data.id)
      if (data.error) tarea?.rechazar(new Error(data.error))
      else tarea?.resolver(data.fallo)
      pendientes.delete(data.id)
    }
    worker.onerror = () => {
      for (const t of pendientes.values()) t.rechazar(new Error('No se pudo comprobar el apoyo. Volvé a intentar.'))
      pendientes.clear(); worker?.terminate(); worker = undefined
    }
  }
  const id = ++secuencia
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar })
    worker!.postMessage({ id, piezas })
  })
}
