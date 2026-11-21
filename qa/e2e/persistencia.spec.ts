import { expect, test } from './entorno'
import type { Creacion } from '../../src/taller'
import type { Biblioteca } from '../../src/biblioteca'
import type { BibliotecaDesafios } from '../../src/biblioteca-desafios'
import type { Almacen } from '../../src/almacen'
import type { DocumentoDesafio } from '../../src/desafios'
import { inventario, perfil, type Armado } from '../../src/types'
import recta from '../../src/data/recta.json' with { type: 'json' }
import solucion from '../fixtures/recta.json' with { type: 'json' }
import type { PiezaColocada } from '../../src/types'

declare global {
  interface Window {
    tukiRevision: { almacen: Almacen; mesas(): Biblioteca; desafios(): BibliotecaDesafios }
    pruebaMesa: { biblioteca: Biblioteca; entrada: Creacion }
  }
}
const mesa = () => ({ esquema: 'tuki' as const, tipo: 'mesa' as const, version: 1 as const, formatoMesa: 'clasica' as const, ordenFisico: 'geometria' as const, nombre: 'Guardado', perfilFisico: perfil.id, conexiones: [], piezas: [
  { id: 'libro', tipo: 'libro' as const, apoyo: 'tablero', posicion: [0, 0, 0] as [number, number, number], giroY: 0 },
] })

test('dos pestañas conservan ambas ediciones y rechazan un borrado desactualizado', async ({ page, context }) => {
  await page.goto('./?revision')
  const id = await page.evaluate(async doc => {
    const biblioteca = window.tukiRevision.mesas(), entrada = await biblioteca.guardar(doc)
    window.pruebaMesa = { biblioteca, entrada }; return entrada.id
  }, mesa())
  const otra = await context.newPage(); await otra.goto('./?revision')
  await otra.evaluate(async id => {
    const biblioteca = window.tukiRevision.mesas(), entrada = await biblioteca.cargar(id)
    window.pruebaMesa = { biblioteca, entrada }
  }, id)
  await page.evaluate(async () => {
    const { biblioteca, entrada } = window.pruebaMesa
    await biblioteca.guardar({ ...entrada.mesa, nombre: 'Primera pestaña' }, entrada.id, entrada.revisionGuardado)
  })
  const copia = await otra.evaluate(async () => {
    const { biblioteca, entrada } = window.pruebaMesa
    const copia = await biblioteca.guardar({ ...entrada.mesa, nombre: 'Segunda pestaña' }, entrada.id, entrada.revisionGuardado)
    await biblioteca.guardar({ ...copia.mesa, nombre: 'Segunda pestaña corregida' }, copia.id, copia.revisionGuardado)
    return copia
  })
  expect(copia.id).not.toBe(id); expect(copia.recuperada).toBe(true)
  const estado = await page.evaluate(async () => {
    const { biblioteca, entrada } = window.pruebaMesa
    let error = ''
    try { await biblioteca.borrar(entrada) } catch (e) { error = (e as Error).message }
    return { error, indice: await window.tukiRevision.almacen.listar() }
  })
  expect(estado.error).toContain('otra pestaña')
  expect(estado.indice.map(r => r.nombre).sort()).toEqual(['Primera pestaña', 'Segunda pestaña corregida'])
})

test('un fallo de IndexedDB rechaza el guardado y conserva el documento durable', async ({ page }) => {
  await page.goto('./?revision')
  const resultado = await page.evaluate(async doc => {
    const biblioteca = window.tukiRevision.mesas(), entrada = await biblioteca.guardar(doc)
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'documentos') throw new DOMException('Sin espacio', 'QuotaExceededError')
      return put.apply(this, args)
    }
    let error = ''
    try { await biblioteca.guardar({ ...doc, nombre: 'No confirmado' }, entrada.id, entrada.revisionGuardado) }
    catch (e) { error = (e as Error).name }
    finally { IDBObjectStore.prototype.put = put }
    const original = await biblioteca.cargar(entrada.id)
    const guardada = await biblioteca.guardar({ ...doc, nombre: 'Reintentado' }, entrada.id, entrada.revisionGuardado)
    return { error, original, guardada }
  }, mesa())
  expect(resultado.error).toBe('QuotaExceededError')
  expect(resultado.original.mesa.nombre).toBe('Guardado')
  expect(resultado.original.revisionGuardado).toBe(1)
  expect(resultado.guardada.mesa.nombre).toBe('Reintentado')
})

test('una mesa sigue listada después de un fallo temporal del worker y se puede reintentar', async ({ page }) => {
  await page.goto('./?revision')
  const resultado = await page.evaluate(async doc => {
    const { almacen } = window.tukiRevision, biblioteca = window.tukiRevision.mesas()
    const entrada = await almacen.guardar(crypto.randomUUID(), 0, doc, { clase: 'mesa', nombre: doc.nombre, objetos: 1 })
    const WorkerOriginal = window.Worker
    window.Worker = class { constructor() { throw new Error('Fallo temporal del worker') } } as unknown as typeof Worker
    let error = ''
    try { await biblioteca.cargar(entrada.id) } catch (e) { error = (e as Error).message }
    finally { window.Worker = WorkerOriginal }
    await biblioteca.abrir()
    const visible = biblioteca.listado.has(entrada.id), reintentada = await biblioteca.cargar(entrada.id)
    return { error, visible, reintentada }
  }, { ...mesa(), nombre: 'Reintento del worker' })
  expect(resultado.error).toContain('Fallo temporal')
  expect(resultado.visible).toBe(true)
  expect(resultado.reintentada.mesa.piezas).toHaveLength(1)
})

test('guardar un intento nunca restaura el nombre anterior; otra revisión se recupera separadamente', async ({ page }) => {
  await page.goto('./?revision')
  const doc: DocumentoDesafio = { esquema: 'tuki', tipo: 'desafio', version: 1, id: crypto.randomUUID(), revision: 1,
    estado: 'borrador', nombre: 'Original', motivo: '', formatoMesa: 'compacta', perfilFisico: perfil.id, catalogo: 'escenario-1',
    ordenFisico: 'geometria', empujon: { pieza: 'inicio', impulsoLocal: [0,0,.003], puntoLocal: [0,.04,0] },
    instalados: recta.objetos as PiezaColocada[], inventario: inventario({domino:solucion.armado.piezas.length}), permiteCableado: false,
    conexionesInstaladas: [], secuencias: [], solucion: { piezas: solucion.armado.piezas as PiezaColocada[], conexiones: [] } }
  const armado: Armado = { nivel: 'taller', revision: doc.revision, perfilFisico: perfil.id, piezas: doc.solucion.piezas, conexiones: [], saldo: inventario() }
  const resultado = await page.evaluate(async ({ doc, armado }) => {
    const autor = window.tukiRevision.desafios(), jugador = window.tukiRevision.desafios()
    const original = await autor.guardar(doc), partida = await jugador.cargar(original.id)
    const renombrado = await autor.guardar({ ...doc, nombre: 'Renombrado' }, true, original.id, original.revisionGuardado)
    const intento = await jugador.guardarIntento(partida.id, partida.referencia, armado)
    const lectura = await autor.cargar(original.id)
    const cambiado = { ...renombrado.documento, revision: doc.revision + 1, inventario: { ...doc.inventario, domino: doc.inventario.domino + 1 } }
    await autor.guardar(cambiado, true, renombrado.id, renombrado.revisionGuardado)
    const recuperado = await jugador.guardarIntento(intento.id, intento.referencia, armado)
    return { nombre: lectura.documento.nombre, mismo: intento.id === original.id, copia: recuperado.id !== original.id,
      revisionCopia: recuperado.documento.revision, original: (await autor.cargar(original.id)).documento }
  }, { doc, armado })
  expect(resultado.nombre).toBe('Renombrado'); expect(resultado.mismo).toBe(true)
  expect(resultado.copia).toBe(true); expect(resultado.revisionCopia).toBe(1)
  expect(resultado.original.revision).toBe(2)
})

test('un registro ilegible permanece visible y puede descargarse', async ({ page }) => {
  await page.addInitScript(() => window.tukiPrueba.sembrar({ completados: ['recta'], audio: false, movimiento: 'reducido' }))
  await page.goto('./?revision')
  await page.evaluate(async () => {
    await window.tukiRevision.almacen.guardar(crypto.randomUUID(), 0, { nombre: 'Archivo dañado' }, { clase: 'mesa', nombre: 'Archivo dañado', objetos: 0 })
  })
  await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Archivo dañado', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar archivo guardado', exact: true }).click()
  expect((await descarga).suggestedFilename()).toBe('Archivo-dañado.json')
  await page.getByRole('button', { name: 'Borrar mesa', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar mesa', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Archivo dañado', exact: true })).toHaveCount(0)
  expect(await page.evaluate(async () => (await window.tukiRevision.almacen.listar()).length)).toBe(0)
})


test('cambiar preferencias desde otra pestaña conserva una victoria recién obtenida', async ({ page }) => {
  await page.goto('./?revision')
  const otra = await page.context().newPage()
  try {
    await otra.goto('./?revision')
    await otra.getByRole('button', { name: 'Preferencias', exact: true }).click()
    await page.bringToFront()
    await page.evaluate(() => window.tukiQA.cargar('recta'))
    await page.getByRole('button', { name: 'Empujar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Completaste La recta', exact: true })).toBeVisible()
    await otra.bringToFront()
    await otra.getByLabel('Apariencia').selectOption('oscuro')
    await otra.reload()
    await expect(otra.getByRole('button', { name: 'Taller libre', exact: true })).toBeEnabled()
    expect(await otra.evaluate(() => document.documentElement.dataset.apariencia)).toBe('oscuro')
    expect(await page.evaluate(() => window.tukiPrueba.progreso())).toContain('recta')
  } finally { await otra.close() }
})
