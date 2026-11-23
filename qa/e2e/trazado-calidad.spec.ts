import { expect, test } from './entorno'

test('la referencia inicial y la fila se ven en Calidad con ambos temas', async ({ page, browserName }, info) => {
  test.skip(process.env.TUKI_PERF !== '1' || browserName !== 'chromium', 'Requiere Chromium con GPU real y WebGPU: TUKI_PERF=1.')
  const errores: string[] = []
  page.on('pageerror', e => errores.push(e.message))
  await page.addInitScript(() => window.tukiPrueba.sembrar({ audio: false, movimiento: 'reducido' }))
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Visuales', { exact: true }).selectOption('fotorealista')
  await expect.poll(() => page.evaluate(() => (window.tukiQA as unknown as {
    render: { fotorealista(): { active: boolean } }
  }).render.fotorealista().active), { timeout: 120000 }).toBe(true)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  for (const tema of ['claro', 'oscuro']) {
    await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
    await page.getByLabel('Apariencia').selectOption(tema)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
    const inicio = await page.evaluate(() => window.tukiQA.proyectar([-.054, 0, 0]))
    await page.mouse.move(inicio.x, inicio.y)
    await expect(page.locator('#inicio-trazo')).toBeVisible()
    await expect(page.locator('#indicador')).toHaveText('Arrastrá para definir la dirección')
    await page.screenshot({ path: info.outputPath('inicio-calidad-' + tema + '.png') })
    await page.mouse.down()
    const fin = await page.evaluate(() => window.tukiQA.proyectar([.055, 0, 0]))
    await page.mouse.move(fin.x, fin.y, { steps: 8 })
    await expect.poll(() => page.evaluate(() => window.tukiQA.estado().previas.length)).toBeGreaterThan(3)
    await page.screenshot({ path: info.outputPath('fila-calidad-' + tema + '.png') })
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBeGreaterThan(3)
    await expect(page.locator('#inicio-trazo')).toBeHidden()
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  }
  expect(errores).toEqual([])
})
