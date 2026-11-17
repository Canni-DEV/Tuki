import { expect, test, type Page } from '@playwright/test'
import { mesaLibrosTrazo } from '../libros-trazo'

async function abrir(page: Page, desnivel = false) {
  await page.addInitScript(() => localStorage.setItem('tuki.progreso.v2', JSON.stringify({
    version: 1, completados: ['recta'], audio: false, movimiento: 'reducido',
  })))
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
  await page.locator('#archivo-mesa').setInputFiles({ name: 'libros.tuki.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(mesaLibrosTrazo(desnivel))) })
  await expect(page.getByRole('button', { name: 'Trazar fila', exact: true })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBe(3)
}

async function mover(page: Page, x: number, y = .018, z = 0) {
  const punto = await page.evaluate(p => window.tukiQA.proyectar(p), [x, y, z])
  await page.mouse.move(punto.x, punto.y)
}

for (const desnivel of [false, true]) test(`traza entre tres libros con ${desnivel ? '2 mm de diferencia' : 'tapas a la misma altura'}`, async ({ page }, info) => {
  await abrir(page, desnivel)
  const antes = await page.evaluate(() => window.tukiQA.estado().armado)
  // Exercise both oblique projection and the overhead view with a real mouse gesture.
  if (!desnivel) await page.getByRole('button', { name: 'Vista superior', exact: true }).click()
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  const extremo = desnivel ? .193 : .178
  await mover(page, -extremo)
  await page.mouse.down()
  for (const x of [-.10, -.04, .04, .10, extremo]) await mover(page, x, desnivel && Math.abs(x) < .085 ? .020 : .018)
  const previa = await page.evaluate(() => ({ piezas: window.tukiQA.estado().previas, motivo: window.tukiQA.estado().motivo }))
  expect(previa.motivo).toBeNull()
  expect(new Set(previa.piezas.map(p => p.apoyo)).size).toBe(3)
  expect(previa.piezas.at(-1)!.posicion[0]).toBeGreaterThan(.15)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
  const despues = await page.evaluate(() => window.tukiQA.estado().armado)
  expect(despues.piezas.filter(p => p.tipo === 'domino').map(({ posicion, apoyo, giroY }) => ({ posicion, apoyo, giroY })))
    .toEqual(previa.piezas.map(({ posicion, apoyo, giroY }) => ({ posicion, apoyo, giroY })))
  await page.screenshot({ path: info.outputPath('fila-entre-libros.png') })
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  expect(await page.evaluate(() => window.tukiQA.estado().armado)).toEqual(antes)
})

test('puede corregir un cruce hacia la mesa sin soltar el gesto y sin quedar bloqueado', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Vista superior', exact: true }).click()
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  await mover(page, -.178)
  await page.mouse.down()
  await mover(page, -.13)
  await mover(page, -.10, 0, .08)
  expect(await page.evaluate(() => window.tukiQA.estado().motivo)).toBe('El desnivel supera los 2 mm')
  await mover(page, -.08)
  await mover(page, .178)
  expect(await page.evaluate(() => window.tukiQA.estado().motivo)).toBeNull()
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
  const fila = await page.evaluate(() => window.tukiQA.estado().armado.piezas.filter(p => p.tipo === 'domino'))
  expect(new Set(fila.map(p => p.apoyo)).size).toBe(3)
  expect(fila.at(-1)!.posicion[0]).toBeGreaterThan(.15)
})
