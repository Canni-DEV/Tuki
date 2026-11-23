// Visual/UV regression: actual UI table formats, paired themes, unchanged WebGL canvas.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const folder = process.env.TUKI_WALNUT_OUTPUT ?? '.qa-local/fotorealista/nogal-formatos'
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.TUKI_CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
const report = { formats: [], errors: [], requests: [] }
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', e => report.errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()) })
  page.on('request', r => { if (r.url().includes('/fotorealista/recursos/nogal-')) report.requests.push(r.url()) })
  await page.addInitScript(() => {
    localStorage.setItem('tuki.v1.preferencias.audio', 'false')
    localStorage.setItem('tuki.v1.preferencias.movimiento', '"reducido"')
    localStorage.setItem('tuki.v1.campana.recta', 'true')
  })
  await page.goto(process.env.TUKI_BASE_URL ?? 'http://127.0.0.1:4176/?revision')
  await page.waitForFunction(() => !!window.tukiQA)
  await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
  assert.equal(report.requests.length, 0, 'Actual debe seguir sin descargar el nogal')
  const theme = async value => {
    await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
    await page.getByLabel('Apariencia').selectOption(value)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.waitForTimeout(150)
  }
  for (const format of ['compacta', 'mediana', 'amplia', 'cuadrada', 'clasica']) {
    await page.getByRole('button', { name: 'Nueva mesa', exact: true }).click()
    await page.getByLabel('Nombre de la mesa').fill('Nogal ' + format)
    await page.locator('#formato-mesa').selectOption(format)
    await page.getByRole('button', { name: 'Crear mesa', exact: true }).click()
    await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
    await theme('claro')
    const canvas = page.locator('canvas').first()
    const before = await canvas.screenshot()
    await writeFile(`${folder}/${format}-actual-antes.png`, before)
    const state = await page.evaluate(() => window.tukiQA.estado())
    await page.evaluate(() => window.tukiQA.render.seleccionar('webgpu', 'alta', 'contacto'))
    for (const appearance of ['claro', 'oscuro']) {
      await theme(appearance)
      await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
      await page.waitForTimeout(150)
      await page.screenshot({ path: `${folder}/${format}-${appearance}.png` })
      await page.getByRole('button', { name: 'Vista superior', exact: true }).click()
      await page.waitForTimeout(150)
      await page.screenshot({ path: `${folder}/${format}-${appearance}-superior.png` })
    }
    await page.evaluate(() => window.tukiQA.render.seleccionar('actual'))
    await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
    await theme('claro')
    const after = await canvas.screenshot()
    await writeFile(`${folder}/${format}-actual-despues.png`, after)
    const restored = await page.evaluate(() => window.tukiQA.estado())
    assert.deepEqual(restored.armado, state.armado)
    assert.deepEqual(restored.vista, state.vista)
    assert(before.equals(after), `El canvas Actual cambió en ${format}`)
    report.formats.push({ format, originalCanvasIdentical: true })
    await page.getByRole('button', { name: 'Volver a mis mesas', exact: true }).click()
  }
  assert.equal(new Set(report.requests.map(u => new URL(u).pathname)).size, 3)
  assert.deepEqual(report.errors, [])
  console.log('Cinco formatos, ambos temas, vista orbital/superior y retorno idéntico a Actual: OK')
} finally {
  await writeFile(`${folder}/informe.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
