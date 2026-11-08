import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const codigoMedidor = readFileSync(new URL('./medidor.worklet.js', import.meta.url), 'utf8')

// Observe the browser's real transport and gain nodes, including in the production build.
declare global {
  interface Window {
    transporte: HTMLMediaElement
    gananciasMusica: () => number[]
    volumenesAudio: () => number[]
    activarCanales: () => void
    medirMesa: () => Promise<number>
  }
}
async function observar(page: Page) {
  await page.addInitScript((codigo: string) => {
    const conexiones = new WeakMap<AudioNode, AudioNode>()
    const familias: GainNode[] = []
    window.volumenesAudio = () => familias.map(nodo => Math.round(nodo.gain.value * 100))
    // Idle buses can skip rendering their AudioParams until the next sound arrives.
    window.activarCanales = () => {
      const referencia = familias[0].context.createConstantSource()
      referencia.offset.value = .000001
      for (const familia of familias) referencia.connect(familia)
      referencia.start()
    }
    let medidor: AudioWorkletNode
    window.medirMesa = async () => {
      if (!medidor) {
        const ctx = familias[1].context
        const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }))
        try { await ctx.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
        medidor = new AudioWorkletNode(ctx, 'medidor-mesa')
        familias[1].connect(medidor).connect(ctx.destination)
      }
      return new Promise<number>(resolve => {
        medidor.port.onmessage = event => resolve(event.data)
        medidor.port.postMessage('leer')
      })
    }
    const conectar = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioNode) {
        if (this instanceof GainNode && conexiones.get(args[0]) instanceof DynamicsCompressorNode) familias.push(this)
        conexiones.set(this, args[0])
      }
      return Reflect.apply(conectar, this, args)
    } as typeof conectar
    const crear = AudioContext.prototype.createMediaElementSource
    AudioContext.prototype.createMediaElementSource = function (elemento) {
      window.transporte = elemento
      const fuente = crear.call(this, elemento)
      window.gananciasMusica = () => {
        const valores: number[] = []
        let nodo = conexiones.get(fuente)
        while (nodo instanceof GainNode) { valores.push(nodo.gain.value); nodo = conexiones.get(nodo) }
        return valores
      }
      return fuente
    }
  }, codigoMedidor)
  await page.goto('./?revision')
}

test('cuatro volúmenes independientes se aplican con el teclado y sobreviven al silencio y la recarga', async ({ page }) => {
  await observar(page)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.evaluate(() => window.activarCanales())
  const sliders = page.getByRole('slider')
  const mezcla = [40, 85, 25, 65]
  await expect(sliders).toHaveCount(4)
  for (const [i, nombre] of ['Música', 'Mesa', 'Ambiente', 'Interfaz'].entries()) {
    const slider = page.getByRole('slider', { name: nombre, exact: true })
    await expect(slider).toHaveValue(String(mezcla[i]))
    await slider.press('Home')
    for (let j = 0; j < 4; j++) await expect(sliders.nth(j)).toHaveValue(String(j === i ? 0 : mezcla[j]))
    await expect.poll(() => page.evaluate(() => window.volumenesAudio())).toEqual(mezcla.map((v, j) => j === i ? 0 : v))
    await slider.press('ArrowRight')
    mezcla[i] = 1
    await expect(slider).toHaveAttribute('aria-valuetext', '1 %')
  }
  await page.getByRole('checkbox', { name: 'Sonido' }).uncheck()
  await expect.poll(() => page.evaluate(() => window.gananciasMusica()[3])).toBeCloseTo(0, 3)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible()
  await page.getByRole('button', { name: 'Activar sonido' }).click()
  await page.getByRole('button', { name: 'Preferencias' }).click()
  for (let i = 0; i < 4; i++) await expect(sliders.nth(i)).toHaveValue('1')
  await expect.poll(() => page.evaluate(() => window.volumenesAudio())).toEqual(mezcla)
})

test('la lista alterna los dos MP3 y mantiene posición, tempo y mezcla al navegar', async ({ page }) => {
  await observar(page)
  expect(await page.evaluate(() => !!window.transporte)).toBe(false)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  const pista = () => page.evaluate(() => decodeURI(window.transporte.currentSrc))
  await expect.poll(() => page.evaluate(() => window.transporte.currentTime)).toBeGreaterThan(0)
  expect(await pista()).toMatch(/\/Tuki\/music\/Pregunta y Respuesta\.mp3$/)
  for (const nombre of ['Una ficha mas.mp3', 'Pregunta y Respuesta.mp3']) {
    await page.evaluate(() => { window.transporte.currentTime = window.transporte.duration - .18 })
    await expect.poll(pista).toContain(nombre)
    await expect.poll(() => page.evaluate(() => window.transporte.currentTime)).toBeGreaterThan(0)
  }
  await page.evaluate(() => { window.transporte.currentTime = 25 })
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await page.evaluate(() => window.tukiQA.cargar('subibaja'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.gananciasMusica()[1])).toBeCloseTo(10 ** (-12 / 20), 3)
  await page.getByRole('button', { name: 'Cámara lenta' }).click()
  expect(await page.evaluate(() => window.transporte.playbackRate)).toBe(1)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.getByRole('slider', { name: 'Música' }).press('End')
  await expect.poll(() => page.evaluate(() => window.gananciasMusica()[2])).toBeCloseTo(1, 3)
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await expect.poll(() => page.evaluate(() => window.gananciasMusica()[1])).toBeCloseTo(1, 3)
  expect(await page.evaluate(() => window.transporte.currentTime)).toBeGreaterThanOrEqual(25)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(await page.evaluate(() => window.transporte.paused)).toBe(true)
  const posicion = await page.evaluate(() => window.transporte.currentTime)
  await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => page.evaluate(() => window.transporte.currentTime)).toBeGreaterThan(posicion)
})

test('una pista que falta da paso a la otra', async ({ page }) => {
  await page.route('**/music/Pregunta*', route => route.fulfill({ status: 404, body: '' }))
  await observar(page)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await expect.poll(() => page.evaluate(() => decodeURI(window.transporte.currentSrc))).toContain('Una ficha mas.mp3')
  await expect.poll(() => page.evaluate(() => window.transporte.currentTime)).toBeGreaterThan(0)
})

test('si faltan los dos MP3, el juego continúa y evita reintentos en bucle', async ({ page }) => {
  const errores: string[] = [], archivos = new Set<string>()
  let solicitudes = 0
  page.on('pageerror', error => errores.push(error.message))
  await page.route('**/music/*.mp3', route => {
    solicitudes++
    archivos.add(route.request().url())
    return route.fulfill({ status: 404, body: '' })
  })
  await observar(page)
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await expect.poll(() => archivos.size).toBe(2)
  await expect.poll(() => page.evaluate(() => !!window.transporte.error)).toBe(true)
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cadena detenida' })).toBeVisible()
  expect(solicitudes).toBe(2)
  expect(errores).toEqual([])
})

test('la mesa genera señal en los recorridos de referencia y queda en silencio al editar', async ({ page }) => {
  test.slow()
  await observar(page)
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  for (const montaje of ['recta', 'taza-mixta', 'llave-abierta', 'vuelta', 'subibaja', 'puente', 'taller100']) {
    await test.step(montaje, async () => {
      if (montaje !== 'recta') await page.evaluate(id => window.tukiQA.cargar(id), montaje)
      await page.evaluate(() => window.medirMesa())
      await page.getByRole('button', { name: 'Empujar', exact: true }).click()
      await expect(page.getByRole('heading', { name: /Cadena detenida|Meta alcanzada/ })).toBeVisible({ timeout: 120_000 })
      const pico = await page.evaluate(() => window.medirMesa())
      expect(pico).toBeGreaterThan(.005)
      await page.getByRole('button', { name: 'Volver a editar' }).click()
      await expect.poll(() => page.evaluate(() => window.medirMesa())).toBeLessThan(.0001)
    })
  }
})
