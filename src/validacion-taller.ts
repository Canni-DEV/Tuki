import type { FalloEquilibrio } from './equilibrio'
import type { PiezaColocada } from './types'

let worker: Worker | undefined, secuencia = 0
const pendientes = new Map<number, { resolver: (fallo: FalloEquilibrio | null) => void; rechazar: (e: Error) => void }>()
function reiniciar(error: Error) {
  worker?.terminate(); worker = undefined
  for (const tarea of pendientes.values()) tarea.rechazar(error)
  pendientes.clear()
}
export function comprobarEnWorker(piezas: PiezaColocada[], mesa: [number, number] = [.84, .52], signal?: AbortSignal): Promise<FalloEquilibrio | null> {
  if (signal?.aborted) return Promise.reject(new DOMException('Comprobación cancelada.', 'AbortError'))
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
      reiniciar(new Error('No se pudo comprobar el apoyo. Volvé a intentar.'))
    }
  }
  const id = ++secuencia
  return new Promise((resolver, rechazar) => {
    const cancelar = () => {
      pendientes.get(id)?.rechazar(new DOMException('Comprobación cancelada.', 'AbortError'))
      pendientes.delete(id)
      if (!pendientes.size) { worker?.terminate(); worker = undefined }
    }
    const espera = setTimeout(() => reiniciar(new Error('La comprobación no respondió. Volvé a intentar.')), 60000)
    const limpiar = () => { clearTimeout(espera); signal?.removeEventListener('abort', cancelar) }
    pendientes.set(id, { resolver: fallo => { limpiar(); resolver(fallo) }, rechazar: error => { limpiar(); rechazar(error) } })
    signal?.addEventListener('abort', cancelar, { once: true })
    try { worker!.postMessage({ id, piezas, mesa }) } catch (error) { reiniciar(error as Error) }
  })
}
