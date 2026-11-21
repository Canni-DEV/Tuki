import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const folder = '.qa-local/fotorealista'
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.TUKI_CHROME ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } })
  await page.addInitScript(() => { localStorage.setItem('tuki.v1.preferencias.audio', 'false'); localStorage.setItem('tuki.v1.preferencias.movimiento', '"reducido"') })
  await page.goto(process.env.TUKI_BASE_URL ?? 'http://127.0.0.1:4176/?revision')
  const gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    return { available: !!adapter, info: adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null, userAgent: navigator.userAgent }
  })
  await page.waitForFunction(() => !!window.tukiQA)
  await page.evaluate(() => window.tukiQA.cargar('vuelta'))
  for (const theme of ['claro', 'oscuro']) {
    await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
    await page.getByLabel('Apariencia').selectOption(theme)
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.screenshot({ path: `${folder}/actual-${theme}.png` })
  }
  await writeFile(`${folder}/baseline.json`, JSON.stringify({ ...gpu, actual: await page.evaluate(() => window.tukiQA.estado()) }, null, 2))
  console.log(JSON.stringify(gpu))
} finally { await browser.close() }
