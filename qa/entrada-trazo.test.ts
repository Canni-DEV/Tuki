import { afterEach, expect, it, vi } from 'vitest'
import { EntradaPorCuadro } from '../src/presentacion'

afterEach(() => vi.unstubAllGlobals())
function reloj() {
  const pendientes = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { pendientes.set(++id, fn); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pendientes.delete(id))
  return () => { const callbacks = [...pendientes.values()]; pendientes.clear(); callbacks.forEach(fn => fn(0)) }
}

it('agrupa sin perder muestras y vacía la cola al soltar antes del fotograma', () => {
  const cuadro = reloj(), entrada = new EntradaPorCuadro<number>(), consumir = vi.fn()
  entrada.agregar([1, 2], consumir)
  entrada.agregar([3, 4, 5], consumir)
  expect(consumir).not.toHaveBeenCalled()
  entrada.consumir()
  expect(consumir).toHaveBeenCalledExactlyOnceWith([1, 2, 3, 4, 5])
  cuadro()
  expect(consumir).toHaveBeenCalledTimes(1)
  entrada.agregar([6], consumir)
  cuadro()
  expect(consumir).toHaveBeenLastCalledWith([6])
})

it('una cancelación descarta las muestras y no contamina el próximo gesto', () => {
  const cuadro = reloj(), entrada = new EntradaPorCuadro<number>(), consumir = vi.fn()
  entrada.agregar([1, 2], consumir)
  entrada.cancelar()
  cuadro(); entrada.consumir()
  expect(consumir).not.toHaveBeenCalled()
  entrada.agregar([3], consumir)
  cuadro()
  expect(consumir).toHaveBeenCalledExactlyOnceWith([3])
})
