import { test, expect, type Page } from '@playwright/test'

async function abrir(page: Page, montaje: string) {
  await page.addInitScript(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
    version: 1, campana: 2, completados: ['recta', 'curva', 'libro', 'taza', 'taza-llave', 'vuelta', 'subibaja', 'puerta', 'puente', 'mate'],
    audio: false, movimiento: 'reducido',
  })))
  await page.goto('./?revision')
  await page.evaluate(nombre => window.tukiQA.cargar(nombre), montaje)
}

async function comprobarCaida(page: Page) {
  const observacion = page.evaluate(async () => {
    const qa = window.tukiQA, ruta = JSON.stringify(qa.recorridosCable())
    let cambios = 0, cuadros = 0
    while (qa.estado().fase !== 'prueba') await new Promise(requestAnimationFrame)
    while (qa.estado().fase === 'prueba') {
      await new Promise(requestAnimationFrame)
      cuadros++
      if (JSON.stringify(qa.recorridosCable()) !== ruta) cambios++
    }
    return { cambios, cuadros, resultado: qa.estado().resultado }
  })
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  const resultado = await observacion
  expect(resultado.cuadros).toBeGreaterThan(0)
  expect(resultado.cambios).toBe(0)
  expect(resultado.resultado).toBe('victoria')
}

for (const montaje of ['puerta', 'puente', 'llave-abierta', 'mate', 'taller100']) {
  test(montaje + ' conserva el cable al previsualizar fichas y en cada fotograma de la caída', async ({ page }) => {
    await abrir(page, montaje)
    await page.getByRole('button', { name: 'Vista superior' }).click()
    const rutas = await page.evaluate(() => window.tukiQA.recorridosCable())
    expect(rutas.length).toBeGreaterThan(0)
    for (const ruta of rutas) expect(ruta).toHaveLength(1)
    await page.locator('[data-tool=domino]').click()
    for (const ruta of rutas) {
      const puntos = ruta[0]
      const segmentos = puntos.slice(1).map((b, i) => ({ a: puntos[i], b }))
        .sort((u, v) => Math.hypot(...v.a.map((x, i) => x - v.b[i])) - Math.hypot(...u.a.map((x, i) => x - u.b[i])))
      const { a, b } = segmentos[0]
      for (const t of [.25, .5, .75]) {
        const punto = await page.evaluate(pos => window.tukiQA.proyectar(pos), a.map((x, i) => x + (b[i] - x) * t))
        await page.mouse.move(punto.x, punto.y)
        expect(await page.evaluate(() => window.tukiQA.estado().previas.length)).toBeGreaterThan(0)
        expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
      }
    }
    await page.keyboard.press('Escape')
    await comprobarCaida(page)
    expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
    if (montaje === 'taller100') await page.locator('[data-action=opciones-resultado]').click()
    await page.getByRole('button', { name: 'Volver a editar' }).click()
    expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
  })
}

test('el taller deja pisar el cable, deshacer y recargar con el mismo tendido', async ({ page }) => {
  await abrir(page, 'taller100')
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const rutas = await page.evaluate(() => window.tukiQA.recorridosCable())
  const cantidad = await page.evaluate(() => window.tukiQA.estado().armado.piezas.length)
  await page.locator('[data-tool=domino]').click()
  let colocada = false
  for (const ruta of rutas) {
    const puntos = ruta[0]
    for (let i = 1; i < puntos.length && !colocada; i++) {
      if (puntos[i][1] > .002 || puntos[i - 1][1] > .002) continue
      const pos = puntos[i].map((x, k) => (x + puntos[i - 1][k]) / 2)
      pos[1] = 0
      const punto = await page.evaluate(p => window.tukiQA.proyectar(p), pos)
      await page.mouse.move(punto.x, punto.y)
      const previa = await page.evaluate(() => window.tukiQA.estado())
      if (!previa.previas.length || previa.motivo) continue
      await page.mouse.click(punto.x, punto.y)
      await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBe(cantidad + 1)
      colocada = true
    }
    if (colocada) break
  }
  expect(colocada).toBe(true)
  expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  expect(await page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBe(cantidad)
  expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
  await page.evaluate(() => window.tukiQA.cargar('taller100'))
  expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(rutas)
})
