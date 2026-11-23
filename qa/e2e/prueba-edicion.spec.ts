import { expect, type Page, type Locator } from './entorno'
import { test } from './reloj-partida'

const estado = (page: Page) => page.evaluate(() => window.tukiQA.estado())
const recordatorio = (page: Page) => page.locator('#recordatorio-edicion')
async function cargar(page: Page) {
  await page.addInitScript(() => window.tukiPrueba.sembrar({ audio: false, movimiento: 'reducido' }))
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}
async function terminar(page: Page) {
  for (let i = 0; i < 60 && (await estado(page)).fase === 'prueba'; i++) await page.clock.fastForward(1000)
  expect((await estado(page)).fase).toBe('resultado')
}
async function orbitar(page: Page, ctrl = false) {
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width * .45, height * .4)
  if (ctrl) await page.keyboard.down('Control')
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(width * .55, height * .43, { steps: 4 })
  await page.mouse.up({ button: 'right' })
  if (ctrl) await page.keyboard.up('Control')
}
async function mismaPosicion(boton: Locator, original: NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>) {
  await expect(boton).toBeInViewport({ ratio: 1 })
  const actual = (await boton.boundingBox())!
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(actual[key]).toBeCloseTo(original[key], 1)
}

for (const [width, height, proyeccion, apariencia] of [
  [1366, 768, 'ortografica', 'claro'], [390, 844, 'perspectiva', 'oscuro'],
  [844, 390, 'perspectiva', 'claro'], [320, 640, 'ortografica', 'oscuro'],
] as const) test(`acción estable y cámara continua al ganar, repetir y editar a ${width}×${height}`, async ({ page, pausarPartida }, info) => {
  await page.setViewportSize({ width, height })
  await cargar(page)
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Cámara', { exact: true }).selectOption(proyeccion)
  await page.getByLabel('Apariencia').selectOption(apariencia)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  const original = await estado(page)
  const empujar = page.getByRole('button', { name: 'Empujar', exact: true })
  const lugar = (await empujar.boundingBox())!
  await pausarPartida()
  await empujar.click()
  const detener = page.getByRole('button', { name: 'Detener y editar', exact: true })
  await mismaPosicion(detener, lugar)
  await expect(page.locator('.test-state .tray-label')).toContainText('Prueba en curso · Edición bloqueada')
  expect((await estado(page)).vista).toEqual(original.vista)
  await page.screenshot({ path: info.outputPath('prueba.png') })
  await orbitar(page)
  const alto = (await estado(page)).vista.alto
  await page.mouse.wheel(0, -160)
  await expect.poll(async () => (await estado(page)).vista.alto).toBeLessThan(alto)
  await orbitar(page, true)
  const vistaPrueba = (await estado(page)).vista
  await expect(recordatorio(page)).toBeHidden()
  await terminar(page)
  const editar = page.getByRole('button', { name: 'Editar armado', exact: true })
  await mismaPosicion(editar, lugar)
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeVisible()
  await expect(page.locator('.test-state .tray-label')).toContainText('Resultado · Edición bloqueada')
  expect((await estado(page)).vista).toEqual(vistaPrueba)
  await page.screenshot({ path: info.outputPath('resultado.png') })
  await page.getByRole('button', { name: 'Repetir', exact: true }).click()
  expect((await estado(page)).vista).toEqual(vistaPrueba)
  await mismaPosicion(detener, lugar)
  await orbitar(page)
  const vistaRepeticion = (await estado(page)).vista
  await detener.click()
  expect(await estado(page)).toMatchObject({ fase: 'edicion', vista: vistaRepeticion,
    armado: original.armado, historia: original.historia, futuro: original.futuro })
  await mismaPosicion(empujar, lugar)
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  expect((await estado(page)).vista).toEqual(original.vista)
})

test('un clic orienta al usuario sin editar ni mover la cámara; el resultado permite volver con el último encuadre', async ({ page, pausarPartida }) => {
  await cargar(page)
  await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
  await page.getByRole('button', { name: 'Retirar todas', exact: true }).click()
  await expect.poll(async () => (await estado(page)).armado.piezas.length).toBe(0)
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  const original = await estado(page)
  await pausarPartida()
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.mouse.click(650, 300)
  await expect(recordatorio(page)).toContainText('Detener y editar')
  await expect(page.getByRole('button', { name: 'Detener y editar', exact: true })).toHaveClass(/edit-reminder/)
  expect(await estado(page)).toMatchObject({ fase: 'prueba', armado: original.armado, vista: original.vista, historia: original.historia })
  await terminar(page)
  await expect(page.getByRole('heading', { name: 'Cadena detenida', exact: true })).toBeVisible()
  await expect(recordatorio(page)).toContainText('Editar armado')
  await page.getByRole('button', { name: 'Repetir', exact: true }).click()
  await expect(recordatorio(page)).toBeHidden()
  await terminar(page)
  await page.mouse.click(650, 300)
  await expect(recordatorio(page)).toContainText('Editar armado')
  // A resized viewport may constrain the current view, but editing must never
  // bring back the snapshot from before the attempt.
  await page.setViewportSize({ width: 1100, height: 720 })
  await page.clock.runFor(32)
  await orbitar(page)
  const vistaResultado = (await estado(page)).vista
  await page.getByRole('button', { name: 'Editar armado', exact: true }).click()
  expect(await estado(page)).toMatchObject({ fase: 'edicion', vista: vistaResultado, armado: original.armado, historia: original.historia })
  await expect(recordatorio(page)).toHaveCount(0)
})

test.describe('toques durante la prueba', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('un toque avisa al soltar; órbita, pinza, arrastre y cancelación no producen avisos', async ({ page, browserName, pausarPartida }, info) => {
    test.skip(browserName !== 'chromium', 'La inyección multipuntero usa CDP de Chromium.')
    await cargar(page)
    const original = await estado(page)
    await pausarPartida()
    await page.getByRole('button', { name: 'Empujar', exact: true }).tap()
    const sesion = await page.context().newCDPSession(page)
    const tocar = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { x: number; y: number; id: number }[]) => {
      await sesion.send('Input.dispatchTouchEvent', { type, touchPoints })
      await page.clock.runFor(32)
    }
    const a = { x: 160, y: 380, id: 1 }, b = { x: 230, y: 380, id: 2 }
    await tocar('touchStart', [a])
    await expect(recordatorio(page)).toBeHidden()
    await tocar('touchStart', [a, b])
    await tocar('touchMove', [{ ...a, x: 180 }, { ...b, x: 250 }])
    await tocar('touchEnd', [])
    expect((await estado(page)).vista.azimut).not.toBe(original.vista.azimut)
    await expect(recordatorio(page)).toBeHidden()
    const antesPinza = (await estado(page)).vista
    await page.getByRole('button', { name: 'Desplazar vista', exact: true }).tap()
    await tocar('touchStart', [a])
    await tocar('touchStart', [a, b])
    await tocar('touchMove', [{ ...a, x: 130, y: 390 }, { ...b, x: 270, y: 390 }])
    await tocar('touchEnd', [{ ...a, x: 130, y: 390 }])
    await tocar('touchEnd', [])
    expect((await estado(page)).vista.alto).toBeLessThan(antesPinza.alto)
    await expect(recordatorio(page)).toBeHidden()
    await tocar('touchStart', [a])
    await tocar('touchMove', [{ ...a, x: 200 }])
    await tocar('touchMove', [a])
    await tocar('touchEnd', [])
    await expect(recordatorio(page)).toBeHidden()
    await tocar('touchStart', [a])
    await tocar('touchCancel', [])
    await expect(recordatorio(page)).toBeHidden()
    await tocar('touchStart', [a])
    await expect(recordatorio(page)).toBeHidden()
    await tocar('touchEnd', [])
    await expect(recordatorio(page)).toContainText('Detener y editar')
    const actual = await estado(page)
    expect(actual).toMatchObject({ fase: 'prueba', armado: original.armado, historia: original.historia, seleccion: original.seleccion })
    await page.screenshot({ path: info.outputPath('aviso-tactil.png') })
    await page.getByRole('button', { name: 'Detener y editar', exact: true }).tap()
    expect(await estado(page)).toMatchObject({ fase: 'edicion', vista: actual.vista, modoCamara: actual.modoCamara, armado: original.armado })
  })
})
