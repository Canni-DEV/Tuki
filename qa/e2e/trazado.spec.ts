import { expect, test, type Page } from './entorno'
import { mesaLibrosTrazo, mesaPuenteTrazo } from '../libros-trazo'
import type { PiezaColocada } from '../../src/types'

async function abrir(page: Page, mesa = mesaLibrosTrazo(), apariencia = 'claro') {
  await page.addInitScript(apariencia => window.tukiPrueba.sembrar({
    completados: ['recta'], audio: false, movimiento: 'reducido', apariencia,
  }), apariencia)
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
  await page.locator('#archivo-mesa').setInputFiles({ name: 'trazado.tuki.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(mesa)) })
  await expect(page.getByRole('button', { name: 'Trazar fila', exact: true })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBe(3)
}

async function mover(page: Page, x: number, y = .018, z = 0) {
  const punto = await page.evaluate(p => window.tukiQA.proyectar(p), [x, y, z])
  await page.mouse.move(punto.x, punto.y)
  await page.evaluate(() => new Promise(requestAnimationFrame))
}

for (const apariencia of ['claro', 'oscuro']) test(`muestra el inicio antes del clic sin colocarlo (${apariencia})`, async ({ page }, info) => {
  await abrir(page, mesaLibrosTrazo(), apariencia)
  const antes = await page.evaluate(() => window.tukiQA.estado().armado)
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  await mover(page, -.16)
  await expect(page.locator('#inicio-trazo')).toBeVisible()
  await expect(page.locator('#indicador')).toHaveText('Arrastrá para definir la dirección')
  const inicio = await page.evaluate(() => window.tukiQA.estado().previas[0] as PiezaColocada)
  expect(inicio.id).toBe('@inicio-fila')
  expect(inicio.posicion[0]).toBeCloseTo(-.16, 3)
  expect(await page.evaluate(() => window.tukiQA.estado().armado)).toEqual(antes)
  await page.screenshot({ path: info.outputPath('inicio-' + apariencia + '.png') })
  await page.mouse.down()
  await mover(page, .16)
  expect(await page.evaluate(() => window.tukiQA.estado().previas[0].posicion)).toEqual(inicio.posicion)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
  const despues = await page.evaluate(() => window.tukiQA.estado())
  expect(despues.armado.piezas.find(p => p.tipo === 'domino')!.posicion).toEqual(inicio.posicion)
  expect(despues.herramienta).toBeNull()
  await expect(page.locator('#inicio-trazo')).toBeHidden()
})

test('un clic sin arrastre no coloca la referencia y Escape descarta eventos pendientes', async ({ page }) => {
  await abrir(page)
  const antes = await page.evaluate(() => window.tukiQA.estado())
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  await mover(page, -.16)
  await page.mouse.down(); await page.mouse.up()
  expect(await page.evaluate(() => window.tukiQA.estado().armado)).toEqual(antes.armado)
  await page.keyboard.press('f')
  await expect(page.locator('#inicio-trazo')).toBeVisible()
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
    canvas.addEventListener('pointerdown', ev => { canvas.dataset.qaPointer = String(ev.pointerId) }, { once: true })
  })
  await page.mouse.down()
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
    const p = window.tukiQA.proyectar([.16, .018, 0])
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: Number(canvas.dataset.qaPointer), pointerType: 'mouse', buttons: 1, clientX: p.x, clientY: p.y }))
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  await page.mouse.up()
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const despues = await page.evaluate(() => window.tukiQA.estado())
  expect(despues.armado).toEqual(antes.armado)
  expect(despues.historia).toBe(antes.historia)
  expect(despues.previas).toEqual([])
  await expect(page.locator('#inicio-trazo')).toBeHidden()
})

test('una curva rápida conserva muestras agrupadas y el extremo de liberación', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Vista superior', exact: true }).click()
  const resultados = []
  for (const agrupado of [false, true]) {
    await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
    await mover(page, -.178)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
      canvas.addEventListener('pointerdown', ev => { canvas.dataset.qaPointer = String(ev.pointerId) }, { once: true })
    })
    await page.mouse.down()
    await page.evaluate(async agrupado => {
      const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
      const evento = (tipo: string, i: number) => {
        const p = window.tukiQA.proyectar([-.178 + .356 * i / 60, .018, .025 * Math.sin(i / 60 * Math.PI * 2)])
        return new PointerEvent(tipo, { pointerId: Number(canvas.dataset.qaPointer), pointerType: 'mouse',
          buttons: tipo === 'pointerup' ? 0 : 1, button: 0, clientX: p.x, clientY: p.y })
      }
      if (agrupado) {
        const ev = evento('pointermove', 59)
        Object.defineProperty(ev, 'getCoalescedEvents', { value: () => Array.from({ length: 59 }, (_, i) => evento('pointermove', i + 1)) })
        canvas.dispatchEvent(ev)
      } else for (let i = 1; i < 60; i++) {
        canvas.dispatchEvent(evento('pointermove', i))
        await new Promise(requestAnimationFrame)
      }
      // No animation frame between the grouped samples and release; the last point exists only here.
      canvas.dispatchEvent(evento('pointerup', 60))
    }, agrupado)
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
    const fila = await page.evaluate(() => window.tukiQA.estado().armado.piezas.filter(p => p.tipo === 'domino') as PiezaColocada[])
    expect(fila.at(-1)!.posicion[0]).toBeGreaterThan(.15)
    resultados.push(fila.map(({ posicion, giroY, apoyo, apoyos }) => ({ posicion, giroY, apoyo, apoyos })))
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  }
  expect(resultados[0]).toEqual(resultados[1])
})

for (const desnivel of [false, true]) test(`traza entre tres libros con ${desnivel ? '2 mm de diferencia' : 'tapas a la misma altura'}`, async ({ page }, info) => {
  await abrir(page, mesaLibrosTrazo(desnivel))
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

test('mantiene la fila recta bajo un puente desde la vista oblicua', async ({ page }) => {
  await abrir(page, mesaPuenteTrazo())
  await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
  await mover(page, 0, 0, -.22)
  await page.mouse.down()
  for (const z of [-.17, -.12, -.08, -.04, 0, .04, .08, .12, .17, .22]) {
    await mover(page, 0, 0, z)
    expect(await page.evaluate(() => window.tukiQA.estado().motivo)).toBeNull()
  }
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().validando)).toBe(false)
  const fila = await page.evaluate(() => window.tukiQA.estado().armado.piezas.filter(p => p.tipo === 'domino'))
  expect(fila[0]!.posicion[2]).toBeLessThan(-.20)
  expect(fila.at(-1)!.posicion[2]).toBeGreaterThan(.19)
  expect(fila.every(p => p.apoyo === 'tablero' && p.posicion[1] === 0 && Math.abs(p.posicion[0]) < .003)).toBe(true)
})
