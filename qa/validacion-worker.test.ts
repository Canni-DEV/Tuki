import { expect, it, vi } from 'vitest'
import type { PiezaColocada } from '../src/types'

it('cancelar un gesto no rechaza la validación de un guardado concurrente', async () => {
  const pedidos: { id: number }[] = []
  let activo!: WorkerSimulado
  class WorkerSimulado {
    onmessage?: (evento: { data: { id: number; fallo: null } }) => void
    onerror?: () => void
    terminate = vi.fn()
    constructor() { activo = this }
    postMessage(pedido: { id: number }) { pedidos.push(pedido) }
  }
  vi.resetModules(); vi.stubGlobal('Worker', WorkerSimulado)
  try {
    const { comprobarEnWorker } = await import('../src/validacion-taller')
    const pieza: PiezaColocada = { id: 'uno', tipo: 'domino', apoyo: 'tablero', giroY: 0, posicion: [0, 0, 0] }
    const controller = new AbortController()
    const gesto = comprobarEnWorker([pieza], [.84, .52], controller.signal)
    const cancelado = expect(gesto).rejects.toMatchObject({ name: 'AbortError' })
    const guardado = comprobarEnWorker([pieza])
    controller.abort(); await cancelado
    expect(activo.terminate).not.toHaveBeenCalled()
    activo.onmessage!({ data: { id: pedidos[1].id, fallo: null } })
    await expect(guardado).resolves.toBeNull()
    activo.onmessage!({ data: { id: pedidos[0].id, fallo: null } })
  } finally { vi.unstubAllGlobals(); vi.resetModules() }
})
