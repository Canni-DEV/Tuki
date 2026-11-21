import { expect, test } from './entorno'

test('la portada difiere física y La recta no carga mecanismos ajenos ni espera un WAV pendiente', async ({ page }) => {
  const pedidos: string[] = []
  page.on('request', req => pedidos.push(req.url()))
  await page.route('**/music/*.wav', () => {})
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Jugar La recta', exact: true })).toBeVisible()
  expect(pedidos.some(url => /\/assets\/(simulation|editor)-/.test(url))).toBe(false)
  await page.getByRole('button', { name: 'Jugar La recta', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  expect(pedidos.filter(url => /\.glb(?:\?|$)/.test(url)).some(url => /(launcher|springplate|holder|lift)/.test(url))).toBe(false)
})

test('doble clic en copiar crea una sola mesa y una respuesta tardía no cambia el destino', async ({ page }) => {
  await page.addInitScript(() => window.tukiPrueba.sembrar({ completados: ['recta'], audio: false, movimiento: 'reducido' }))
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
  await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>('[data-action=copiar-campana]')!
    b.click(); b.click()
  })
  await expect(page.getByRole('button', { name: 'Volver a mis mesas', exact: true })).toBeVisible()
  expect(await page.evaluate(async () => (await window.tukiRevision.almacen.listar()).length)).toBe(1)
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await page.getByRole('button', { name: 'Más acciones', exact: true }).click()
  await page.evaluate(() => {
    const almacen = window.tukiRevision.almacen, abrir = almacen.abrir.bind(almacen)
    almacen.abrir = async () => { await new Promise(resolve => setTimeout(resolve, 150)); return abrir() }
    document.querySelector<HTMLButtonElement>('[data-action=copiar-campana]')!.click()
    document.querySelector<HTMLButtonElement>('[data-action=selector]')!.click()
  })
  await expect(page.getByRole('heading', { name: 'Desafíos', exact: true })).toBeVisible()
  expect(await page.evaluate(async () => (await window.tukiRevision.almacen.listar()).length)).toBe(1)
  await expect(page.getByRole('heading', { name: 'Desafíos', exact: true })).toBeVisible()
})

test('recuperar WebGL vuelve a dibujar la misma mesa sin modificar su armado', async ({ page }) => {
  await page.addInitScript(() => window.tukiPrueba.sembrar({ audio: false, movimiento: 'reducido' }))
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  const antes = await page.evaluate(() => ({ armado: window.tukiQA.estado().armado, vista: window.tukiQA.estado().vista }))
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!, gl = canvas.getContext('webgl2')!
    const extension = gl.getExtension('WEBGL_lose_context')
    if (!extension) { reject(new Error('El navegador no permite comprobar la recuperación de WebGL')); return }
    canvas.addEventListener('webglcontextrestored', () => {
      const original = gl.drawElements.bind(gl)
      const timeout = setTimeout(() => reject(new Error('No se volvió a dibujar la mesa')), 5000)
      gl.drawElements = (...args) => { original(...args); clearTimeout(timeout); gl.drawElements = original; resolve() }
    }, { once: true })
    canvas.addEventListener('webglcontextlost', () => setTimeout(() => extension.restoreContext(), 50), { once: true })
    extension.loseContext()
  }))
  const despues = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#mesa')!.getContext('webgl2')!
    return { armado: window.tukiQA.estado().armado, vista: window.tukiQA.estado().vista, contexto: gl.isContextLost() }
  })
  expect(despues.armado).toEqual(antes.armado); expect(despues.vista).toEqual(antes.vista)
  expect(despues.contexto).toBe(false)
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
})
