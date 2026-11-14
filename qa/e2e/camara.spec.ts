import { test, expect, type Page } from '@playwright/test'

const estado = (page: Page) => page.evaluate(() => window.tukiQA.estado())
const cuadro = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
async function cargar(page: Page, nombre = 'recta') {
  await page.goto('./?revision')
  await page.evaluate(n => window.tukiQA.cargar(n), nombre)
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}
async function zoom(page: Page, delta: number, veces = 1) {
  for (let i = 0; i < veces; i++) { await page.mouse.wheel(0, delta); await cuadro(page) }
}
async function arrastrar(page: Page, ctrl = false, dx = 50, dy = 25, steps = 5) {
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width/2, height/2)
  if (ctrl) await page.keyboard.down('Control')
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(width/2+dx, height/2+dy, { steps })
  await page.mouse.up({ button: 'right' })
  if (ctrl) await page.keyboard.up('Control')
}

test('derecho orbita; Ctrl y selector desplazan sin editar, y Ver mesa recupera la vista', async ({ page }) => {
  await cargar(page)
  const inicial = await estado(page)
  await arrastrar(page)
  expect((await estado(page)).vista.azimut).not.toBe(inicial.vista.azimut)
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await page.mouse.move(683, 384)
  await zoom(page, -160, 10)
  const antes = await estado(page)
  expect(antes.vista.alto).toBeCloseTo(.12, 7)
  const origen = [antes.vista.centro.x, 0, antes.vista.centro.z]
  const proyectado = await page.evaluate(p => window.tukiQA.proyectar(p), origen)
  await arrastrar(page, true, 35, 25)
  const despues = await estado(page)
  expect(despues.vista.elevacion).toBe(Math.PI/2)
  expect(despues.vista.azimut).toBe(antes.vista.azimut)
  const movido = await page.evaluate(p => window.tukiQA.proyectar(p), origen)
  expect(movido.x-proyectado.x).toBeCloseTo(35, 4)
  expect(movido.y-proyectado.y).toBeCloseTo(25, 4)
  const selector = page.getByRole('button', { name: 'Desplazar vista', exact: true })
  await selector.focus(); await page.keyboard.press('Space')
  await expect(selector).toHaveAttribute('aria-pressed', 'true')
  await arrastrar(page)
  const final = await estado(page)
  expect(final.vista.azimut).toBe(antes.vista.azimut)
  expect(final.armado).toEqual(inicial.armado)
  expect(final.historia).toBe(inicial.historia)
  expect(final.seleccion).toBe(inicial.seleccion)
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  await expect(selector).toHaveAttribute('aria-pressed', 'false')
  const recuperada = (await estado(page)).vista
  for (const k of ['alto', 'azimut', 'elevacion'] as const) expect(recuperada[k]).toBeCloseTo(inicial.vista[k], 10)
  for (const k of ['x', 'y', 'z'] as const) expect(recuperada.centro[k]).toBeCloseTo(inicial.vista.centro[k], 10)
})

test('la rueda mantiene el punto bajo el cursor y los diálogos bloquean la cámara', async ({ page }) => {
  await cargar(page)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const ancla = [.04, 0, .04]
  const antes = await page.evaluate(p => window.tukiQA.proyectar(p), ancla)
  await page.mouse.move(antes.x, antes.y)
  await zoom(page, -80)
  const despues = await page.evaluate(p => window.tukiQA.proyectar(p), ancla)
  // Native wheel events round the mouse coordinates to CSS pixels.
  expect(Math.abs(despues.x-antes.x)).toBeLessThan(1)
  expect(Math.abs(despues.y-antes.y)).toBeLessThan(1)
  const vista = (await estado(page)).vista
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await arrastrar(page, true)
  await zoom(page, -160)
  expect((await estado(page)).vista).toEqual(vista)
})

test('navegar cancela un trazo provisional y una pérdida de foco no deja el arrastre activo', async ({ page }) => {
  await cargar(page)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const antes = await estado(page)
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  const p = await page.evaluate(() => window.tukiQA.proyectar([0, 0, .07]))
  await page.mouse.move(p.x, p.y); await page.mouse.down()
  await page.mouse.move(p.x+20, p.y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(p.x+35, p.y+12)
  await page.mouse.up({ button: 'right' }); await page.mouse.up()
  const despues = await estado(page)
  expect(despues.armado).toEqual(antes.armado)
  expect(despues.historia).toBe(antes.historia)
  await page.mouse.down({ button: 'right' })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.up({ button: 'right' })
  const quieta = (await estado(page)).vista
  await page.mouse.move(p.x+50, p.y+20)
  expect((await estado(page)).vista).toEqual(quieta)
})

for (const montaje of ['mate', 'bajada', 'taller100'])
  test(`${montaje}: bordes acotados, orientación y encuadre general`, async ({ page }, testInfo) => {
    await cargar(page, montaje)
    const inicial = await estado(page)
    for (const [width, height] of [[1366, 768], [390, 844], [844, 390], [320, 640]]) {
      await page.setViewportSize({ width, height }); await cuadro(page)
      await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
      await page.getByRole('button', { name: 'Vista superior' }).click()
      await page.mouse.move(width/2, height/2)
      await zoom(page, -160, 12)
      const cerca = (await estado(page)).vista
      expect(Math.min(cerca.alto, cerca.alto*width/height)).toBeCloseTo(.12, 6)
      // BiDi rejects coordinates outside the browser. Reach the same boundary
      // with repeated native drags that stay inside the viewport in both browsers.
      for (let i = 0; i < 16; i++) await arrastrar(page, true, width*.35, height*.25, 1)
      const extremo = (await estado(page)).vista
      await arrastrar(page, true, width*.35, height*.25, 1)
      const detenido = (await estado(page)).vista
      expect(detenido.centro.x).toBeCloseTo(extremo.centro.x, 9)
      expect(detenido.centro.z).toBeCloseTo(extremo.centro.z, 9)
      const dimensiones = montaje === 'mate' ? [.88, .88] : montaje === 'bajada' ? [.67, .58] : [.84, .52]
      expect(Math.abs(extremo.centro.x)).toBeLessThanOrEqual(dimensiones[0]/2+.02001)
      expect(Math.abs(extremo.centro.z)).toBeLessThanOrEqual(dimensiones[1]/2+.02001)
      await page.mouse.move(width/2, height/2)
      await zoom(page, 160, 18)
      await expect(page.getByRole('button', { name: 'Desplazar vista' })).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`${montaje}-${width}x${height}.png`) })
    }
    expect((await estado(page)).armado).toEqual(inicial.armado)
    expect((await estado(page)).historia).toBe(inicial.historia)
  })

test.describe('navegación multitáctil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('un segundo dedo cancela el cable pendiente; un toque individual lo confirma al soltar', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'La inyección multipuntero usa CDP de Chromium.')
    await page.addInitScript(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
      version: 1, campana: 2, completados: ['recta', 'curva', 'libro', 'taza', 'taza-llave', 'vuelta', 'subibaja', 'puerta', 'puente', 'mate'],
      audio: false, movimiento: 'reducido',
    })))
    await cargar(page, 'taller100')
    await page.getByRole('button', { name: 'Vista superior' }).tap()
    const ruta = (await page.evaluate(() => window.tukiQA.recorridosCable()))[0][0]
    const mando = await page.evaluate(p => window.tukiQA.proyectar(p), ruta[0])
    const receptor = await page.evaluate(p => window.tukiQA.proyectar(p), ruta.at(-1)!)
    await page.getByRole('button', { name: 'Conectar / desconectar', exact: true }).tap()
    await page.touchscreen.tap(mando.x, mando.y)
    await expect(page.getByRole('button', { name: 'Elegí el receptor', exact: true })).toBeVisible()
    const antes = await estado(page)
    const sesion = await page.context().newCDPSession(page)
    const a = { ...receptor, id: 1 }, b = { x: receptor.x+25, y: receptor.y+25, id: 2 }
    await sesion.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] })
    expect((await estado(page)).armado).toEqual(antes.armado)
    await sesion.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] })
    await sesion.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect((await estado(page)).armado).toEqual(antes.armado)
    expect((await estado(page)).historia).toBe(antes.historia)
    await expect(page.getByRole('button', { name: 'Elegí el receptor', exact: true })).toBeVisible()
    await page.touchscreen.tap(receptor.x, receptor.y)
    await expect.poll(async () => (await estado(page)).historia).toBe(antes.historia+1)
    expect((await estado(page)).armado).not.toEqual(antes.armado)
  })
  test('órbita predeterminada, pan con pinza y tres dedos conservan el armado y la selección', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'La inyección multipuntero usa CDP de Chromium.')
    await cargar(page)
    const sesion = await page.context().newCDPSession(page)
    const tocar = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { x: number; y: number; id: number }[]) => {
      await sesion.send('Input.dispatchTouchEvent', { type, touchPoints }); await cuadro(page)
    }
    const antes = await estado(page)
    const a = { x: 160, y: 400, id: 1 }, b = { x: 230, y: 400, id: 2 }
    await tocar('touchStart', [a]); await tocar('touchStart', [a, b])
    await tocar('touchMove', [{ ...a, x: 175 }, { ...b, x: 245 }])
    await tocar('touchEnd', [])
    expect((await estado(page)).vista.azimut).not.toBe(antes.vista.azimut)
    await page.getByRole('button', { name: 'Desplazar vista' }).tap()
    const previa = (await estado(page)).vista
    await tocar('touchStart', [a]); await tocar('touchStart', [a, b])
    const c = { x: 190, y: 460, id: 3 }
    await tocar('touchStart', [a, b, c])
    await tocar('touchMove', [{ ...a, x: 150 }, b, c])
    expect((await estado(page)).vista).toEqual(previa)
    await tocar('touchEnd', [c])
    await tocar('touchMove', [{ ...a, x: 130, y: 410 }, { ...b, x: 270, y: 410 }])
    const movida = (await estado(page)).vista
    expect(movida.azimut).toBe(previa.azimut)
    expect(movida.elevacion).toBe(previa.elevacion)
    expect(movida.alto).toBeLessThan(previa.alto)
    expect(movida.centro).not.toEqual(previa.centro)
    await tocar('touchEnd', [{ ...b, x: 270, y: 410 }])
    await tocar('touchMove', [{ ...a, x: 180, y: 440 }])
    expect((await estado(page)).vista).toEqual(movida)
    await tocar('touchCancel', [])
    const final = await estado(page)
    expect(final.armado).toEqual(antes.armado)
    expect(final.historia).toBe(antes.historia)
    expect(final.seleccion).toBe(antes.seleccion)
    // A modal releases capture. Fingers may then finish over its DOM controls;
    // the next gesture must work instead of remaining quarantined indefinitely.
    await tocar('touchStart', [a]); await tocar('touchStart', [a, b])
    await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
    const bloqueada = (await estado(page)).vista
    await tocar('touchMove', [{ ...a, x: 170 }, { ...b, x: 240 }])
    await tocar('touchEnd', [])
    expect((await estado(page)).vista).toEqual(bloqueada)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await tocar('touchStart', [a]); await tocar('touchStart', [a, b])
    await tocar('touchMove', [{ ...a, x: 180 }, { ...b, x: 250 }])
    await tocar('touchEnd', [])
    expect((await estado(page)).vista.centro).not.toEqual(bloqueada.centro)
    expect((await estado(page)).armado).toEqual(antes.armado)
  })
})
