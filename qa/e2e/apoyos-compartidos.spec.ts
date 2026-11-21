import { piezaInventario, cerrarInventario } from './inventario'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { alturaApoyos, mesaApoyosCompartidos } from '../apoyos-compartidos'
import type { Armado } from '../../src/types'

for (const tipo of ['rampa', 'canal', 'curva90', 'embudo'] as const)
  test(`${tipo} se coloca sobre tres libros y conserva los apoyos al exportar, deshacer e importar`, async ({ page }, info) => {
    await page.addInitScript(() => localStorage.setItem('tuki.progreso.v2', JSON.stringify({
      version: 1, completados: ['recta', 'curva', 'libro', 'taza', 'vuelta'], audio: false, movimiento: 'reducido',
    })))
    await page.goto('./?revision')
    await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
    const doc = mesaApoyosCompartidos(3)
    await page.locator('#archivo-mesa').setInputFiles({ name: 'apoyos.tuki.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)) })
    await expect((await piezaInventario(page, tipo))).toBeEnabled()
    await cerrarInventario(page)
    const estado = async () => {
      await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
      return page.evaluate(() => window.tukiQA.estado().armado as unknown as Armado)
    }
    await expect.poll(async () => (await estado()).piezas.length).toBe(3)
    const antes = await estado()
    await (await piezaInventario(page, tipo)).click()
    const punto = await page.evaluate(p => window.tukiQA.proyectar(p), [0, alturaApoyos, 0])
    await page.mouse.move(punto.x, punto.y)
    await expect.poll(() => page.evaluate(() => window.tukiQA.estado().previas.length)).toBe(1)
    expect(await page.evaluate(() => window.tukiQA.estado().motivo)).toBeNull()
    await page.screenshot({ path: info.outputPath('contactos-compartidos.png') })
    await page.mouse.click(punto.x, punto.y)
    await expect.poll(async () => (await estado()).piezas.length).toBe(4)
    const colocada = (await estado()).piezas.at(-1)!
    expect(colocada).toMatchObject({ tipo, posicion: [expect.any(Number), alturaApoyos, expect.any(Number)],
      apoyos: ['libro-0/apoyo', 'libro-1/apoyo', 'libro-2/apoyo'] })
    const descarga = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
    await page.getByRole('button', { name: 'Exportar mesa', exact: true }).click()
    const ruta = await (await descarga).path()
    const exportada = JSON.parse(await readFile(ruta!, 'utf8'))
    expect(exportada.piezas.at(-1)).toEqual(colocada)
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
    expect(await estado()).toEqual(antes)
    await page.getByRole('button', { name: 'Volver a mis mesas', exact: true }).click()
    await page.locator('#archivo-mesa').setInputFiles(ruta!)
    await expect((await piezaInventario(page, tipo))).toBeEnabled()
    await cerrarInventario(page)
    await expect.poll(async () => (await estado()).piezas.length).toBe(4)
    expect((await estado()).piezas.at(-1)).toEqual(colocada)
  })
