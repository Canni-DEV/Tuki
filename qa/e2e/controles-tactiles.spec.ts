import { test, expect, type Page } from '@playwright/test'

const estado = (page: Page) => page.evaluate(() => window.tukiQA.estado())
const punto = (page: Page, posicion: number[]) => page.evaluate(p => window.tukiQA.proyectar(p), posicion)
async function cargar(page: Page, nombre: string) {
  await page.goto('./?revision')
  await page.evaluate(n => window.tukiQA.cargar(n), nombre)
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
test('la cuadrícula cabe en ambas orientaciones y el panel permite ajustes por toque', async ({ page, browserName }, testInfo) => {
  test.skip(browserName === 'firefox' && testInfo.project.use.channel === 'moz-firefox',
    'El transporte BiDi de Firefox de escritorio no implementa tap. Se ejecuta con Firefox empaquetado en CI.')
  await cargar(page, 'taza-fichas')
  for (const [width, height] of [[390, 844], [844, 390], [320, 640]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: 'Piezas', exact: true }).tap()
    const menu = page.getByRole('dialog', { name: 'Piezas disponibles' })
    await expect(menu).toHaveClass(/grid-menu/)
    await expect(menu).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath('inventario-' + width + '.png') })
    await menu.locator('[data-tool=bolita]').tap()
    await expect(menu).toHaveCount(0)
    await expect(page.locator('#bandeja [data-tool=bolita]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Seleccionar', exact: true }).tap()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await page.getByRole('button', { name: 'Vista superior' }).tap()
  const centro = await punto(page, [0, 0, 0])
  await page.touchscreen.tap(centro.x, centro.y)
  await page.getByRole('button', { name: 'Ajustar', exact: true }).tap()
  await expect(page.getByRole('group', { name: 'Ajuste fino' })).toBeInViewport({ ratio: 1 })
  await page.getByRole('button', { name: 'Fino', exact: true }).tap()
  const antes = await estado(page)
  await page.getByRole('button', { name: 'Mover arriba' }).tap()
  const despues = await estado(page)
  const indice = antes.armado.piezas.findIndex(p => p.id === antes.seleccion)
  expect(despues.armado.piezas[indice].posicion[2]).toBeCloseTo(antes.armado.piezas[indice].posicion[2] - .0005, 7)
  await page.screenshot({ path: testInfo.outputPath('ajuste-tactil.png') })
})
