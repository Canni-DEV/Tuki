import { expect, type Page } from './entorno'
import { test } from './reloj-partida'
import { observarVictoria } from './observar-victoria'

test.use({ trace: { mode: 'retain-on-failure', screenshots: false } })

const registro = (page: Page) => page.evaluate(() => window.efectoVictoria())
async function abrir(page: Page) {
  await observarVictoria(page)
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Jugar La recta', exact: true }).click()
  await page.evaluate(() => window.tukiQA.cargar('recta'))
}
async function caer(page: Page) {
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  for (let i = 0; i < 120; i++) {
    await page.clock.runFor(32)
    if (await page.evaluate(() => window.tukiQA.estado().eventos.some(e => e.tipo === 'victoria'))) return
  }
  throw new Error('La meta no cayó')
}

test('diez motas acompañan el primer remate, terminan en resultado y no vuelven al repetir ni recargar', async ({ page, pausarPartida }, info) => {
  const errores: string[] = []
  page.on('pageerror', e => errores.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })
  await abrir(page)
  await pausarPartida()
  await caer(page)
  const inicio = await registro(page)
  expect(inicio.dibujos[0]).toMatchObject({ tiempo: 0, cantidad: 10, fase: 'prueba' })
  expect(inicio.frases).toHaveLength(1)
  expect(inicio.frases[0]).toMatchObject({ desde: 0, duracion: 6.9435 })
  expect(inicio.inicio! - inicio.frases[0].instante).toBeLessThan(32)
  await page.clock.runFor(400)
  await page.screenshot({ path: info.outputPath('victoria-motas.png') })
  await page.clock.runFor(1800)
  await expect(page.getByRole('heading', { name: 'Completaste La recta', exact: true })).toBeVisible()
  const fin = await registro(page)
  expect(fin.dibujos.some(d => d.fase === 'resultado')).toBe(true)
  expect(fin.dibujos.at(-1)!.tiempo).toBeGreaterThan(1.9)
  expect(fin.dibujos.at(-1)!.tiempo).toBeLessThan(2)
  await page.clock.runFor(200)
  expect((await registro(page)).dibujos).toHaveLength(fin.dibujos.length)
  await page.getByRole('button', { name: 'Repetir', exact: true }).click()
  await page.clock.runFor(3200)
  const repetida = await registro(page)
  expect(repetida.dibujos).toHaveLength(fin.dibujos.length)
  expect(repetida.frases.map(f => f.desde)).toEqual([0, .48])
  await page.clock.resume()
  await page.reload()
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Completaste La recta', exact: true })).toBeVisible()
  expect((await registro(page)).dibujos).toHaveLength(0)
  expect((await registro(page)).frases.map(f => f.desde)).toEqual([.48])
  expect(errores).toEqual([])
})

test('con movimiento reducido y audio apagado la primera victoria deja una luz fija que se desvanece', async ({ page, pausarPartida }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Sonido', { exact: true }).uncheck()
  await page.getByLabel('Movimiento de la interfaz').selectOption('reducido')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reducido', 'true')
  await pausarPartida()
  await caer(page)
  const inicio = await registro(page)
  expect(inicio.fuerza).toBeGreaterThan(.95)
  await page.clock.runFor(800)
  const medio = await registro(page)
  expect(medio.fuerza).toBeLessThan(inicio.fuerza)
  expect(medio.fuerza).toBeGreaterThan(0)
  expect(medio.dibujos).toHaveLength(0)
  expect(medio.frases).toHaveLength(0)
  await page.clock.runFor(1600)
  expect((await registro(page)).fuerza).toBe(1)
  await expect(page.getByRole('heading', { name: 'Completaste La recta', exact: true })).toBeVisible()
})

test('las motas se pausan con la pestaña y se eliminan al editar durante el remate', async ({ page, pausarPartida }, info) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Apariencia').selectOption('oscuro')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await pausarPartida()
  await caer(page)
  await page.clock.runFor(200)
  await page.screenshot({ path: info.outputPath('victoria-oscura.png') })
  const antes = await registro(page)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(5000)
  expect((await registro(page)).dibujos).toHaveLength(antes.dibujos.length)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.runFor(64)
  const despues = await registro(page)
  // The hide/show events can land between animation frames (16 ms in this clock).
  const avance = despues.dibujos.at(-1)!.tiempo - antes.dibujos.at(-1)!.tiempo
  expect(Math.abs(avance - .064)).toBeLessThanOrEqual(.017)
  await page.getByRole('button', { name: /^(Detener y editar|Editar armado)$/, exact: true }).click()
  const cortada = await registro(page)
  await page.clock.runFor(2200)
  expect((await registro(page)).dibujos).toHaveLength(cortada.dibujos.length)
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
})
