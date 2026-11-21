import { expect, it, vi } from 'vitest'
import { Guardados } from '../src/guardado'
import { guardar, leer } from '../src/progreso'

function memoria() {
  const datos = new Map<string, string>()
  return { datos, storage: () => ({ getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v) } }) }
}
it('una preferencia de otra pestaña no elimina una victoria ni otro ajuste', () => {
  const { storage } = memoria(), a = leer(storage), b = leer(storage)
  a.completados.push('recta'); a.volumenes.mesa = 32; expect(guardar(a, storage)).toBe(true)
  b.apariencia = 'oscuro'; expect(guardar(b, storage)).toBe(true)
  expect(leer(storage)).toMatchObject({ completados: ['recta'], apariencia: 'oscuro', volumenes: { mesa: 32 } })
})
it('dos victorias y dos favoritos de pestañas antiguas se conservan independientemente', () => {
  const { storage } = memoria(), a = leer(storage), b = leer(storage)
  a.completados.push('recta'); b.completados.push('curva')
  a.favoritosTaller![0] = 'atlas'; b.favoritosTaller![1] = 'cuaderno'
  guardar(a, storage); guardar(b, storage)
  const p = leer(storage)
  expect(p.completados).toEqual(['recta', 'curva'])
  expect(p.favoritosTaller!.slice(0, 2)).toEqual(['atlas', 'cuaderno'])
})
it('una escritura fallida queda pendiente y exportable hasta confirmarse', async () => {
  let fallar = true, exportadas = 0, guardadas = 0
  const cola = new Guardados(() => {})
  cola.agregar({}, async () => { if (fallar) throw new Error('Sin espacio'); guardadas++ }, () => exportadas++)
  await expect(cola.esperar()).rejects.toThrow('Sin espacio')
  expect(cola.pendiente).toBe(true)
  cola.exportar(); expect(exportadas).toBe(1)
  fallar = false; cola.reintentar(); await cola.esperar()
  expect(guardadas).toBe(1); expect(cola.pendiente).toBe(false)
})
it('serializa la escritura en curso y conserva el último cambio recibido mientras guarda', async () => {
  let terminar!: () => void
  const espera = new Promise<void>(resolve => { terminar = resolve }), orden: number[] = [], clave = {}
  const cola = new Guardados(() => {})
  cola.agregar(clave, async () => { await espera; orden.push(1) }, () => {})
  cola.agregar(clave, async () => { orden.push(2) }, () => {})
  cola.agregar(clave, async () => { orden.push(3) }, () => {})
  terminar(); await cola.esperar()
  expect(orden).toEqual([1, 3]); expect(cola.pendiente).toBe(false)
})


it('deshacer mientras se guarda vuelve a persistir el estado original después del cambio pendiente', async () => {
  const { GuardadoCreaciones } = await import('../src/guardado-creaciones')
  const { Biblioteca } = await import('../src/biblioteca')
  const { BibliotecaDesafios } = await import('../src/biblioteca-desafios')
  const { Editor } = await import('../src/editor')
  const { baseMesa } = await import('../src/mesas')
  const { mesaNueva } = await import('../src/taller')
  const { actualizarSolucion, mesaDeAutor } = await import('../src/desafios')
  const biblioteca = new Biblioteca(), cola = new Guardados(() => {})
  const gestor = new GuardadoCreaciones(biblioteca, new BibliotecaDesafios(), cola)
  const editor = new Editor(baseMesa('Deshacer')), original = editor.armado
  const entry = { id: 'mesa', revisionGuardado: 1, mesa: mesaNueva('Deshacer') }
  const escritos: number[] = []
  let liberar!: () => void
  const pendiente = new Promise<void>(resolve => { liberar = resolve })
  const guardar = vi.spyOn(biblioteca, 'guardar').mockImplementation(async (doc, id, revision) => {
    if (!escritos.length) await pendiente
    escritos.push(doc.piezas.length)
    return { id: id!, revisionGuardado: revision! + 1, mesa: structuredClone(doc) }
  })
  try {
    gestor.comenzar(editor)
    editor.armado = { ...original, piezas: [{ id: 'pieza', tipo: 'domino', apoyo: 'tablero', giroY: 0, posicion: [0, 0, 0] }] }
    const guardarEdicion = () => gestor.edicion({ editor, mesa: entry, soloLectura: false, actualizarSolucion, mesaDeAutor, confirmado: () => {} })
    guardarEdicion()
    editor.armado = original
    guardarEdicion()
    liberar(); await cola.esperar()
    expect(escritos).toEqual([1, 0])
    expect(entry.mesa.piezas).toEqual([])
    expect(entry.revisionGuardado).toBe(3)
  } finally { guardar.mockRestore() }
})
