import { test, expect } from './entorno'
import type { Scene } from 'three'
import os from 'node:os'

declare global {
  interface Window {
    cuadroTrazo?: () => void
  }
}

for (const objetos of [0, 100, 150, 190]) test(`rendimiento real del trazado con ${objetos} objetos`, async ({ page, browser }, info) => {
  test.skip(process.env.TUKI_PERF !== '1', 'Medir con GPU real y sin otras pruebas simultáneas: TUKI_PERF=1.')
  const errores: string[] = []
  page.on('pageerror', e => errores.push(e.message))
  await page.addInitScript(() => {
    window.tukiPrueba.sembrar({ completados: ['recta'], audio: false, movimiento: 'reducido' })
    const hook = new EventTarget()
    hook.addEventListener('observe', ev => {
      const scene = (ev as CustomEvent).detail as Scene
      if (scene.isScene) scene.onAfterRender = () => window.cuadroTrazo?.()
    })
    Object.assign(window, { __THREE_DEVTOOLS__: hook })
  })
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Taller libre', exact: true }).click()
  const mesa = { esquema: 'tuki', tipo: 'mesa', version: 1, formatoMesa: 'clasica', ordenFisico: 'geometria',
    nombre: 'Rendimiento de trazo', perfilFisico: 'dispositivos-1', conexiones: [],
    piezas: Array.from({ length: objetos }, (_, k) => ({ id: 'obstaculo-' + k, tipo: 'domino', apoyo: 'tablero',
      giroY: 0, posicion: [-.39 + k % 30 * .026, 0, -.23 + Math.floor(k / 30) * .018] })) }
  await page.locator('#archivo-mesa').setInputFiles({ name: 'rendimiento.tuki.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mesa)) })
  await expect(page.getByRole('button', { name: 'Trazar fila', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Vista superior', exact: true }).click()
  const recorridos = []
  for (const curva of [false, true]) {
    await page.getByRole('button', { name: 'Trazar fila', exact: true }).click()
    const p = await page.evaluate(() => window.tukiQA.proyectar([-.36, 0, .10]))
    await page.mouse.move(p.x, p.y)
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
      canvas.addEventListener('pointerdown', ev => { canvas.dataset.qaPointer = String(ev.pointerId) }, { once: true })
    })
    await page.mouse.down()
    const medidas = await page.evaluate(async curva => {
      const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!, muestras: number[] = []
      for (let lote = 1; lote <= 60; lote++) {
        const anterior = window.tukiQA.estado().previas, inicio = performance.now()
        const listo = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('No se presentó la fila')), 3000)
          window.cuadroTrazo = () => {
            if (window.tukiQA.estado().previas === anterior) return
            muestras.push(performance.now() - inicio)
            clearTimeout(timeout); window.cuadroTrazo = undefined; resolve()
          }
        })
        for (let j = 0; j < 4; j++) {
          const k = (lote - 1) * 4 + j + 1, t = k / 240
          const p = window.tukiQA.proyectar([-.36 + .72 * t, 0, .10 + (curva ? .055 * Math.sin(t * Math.PI * 2) : 0)])
          canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: Number(canvas.dataset.qaPointer), pointerType: 'mouse',
            buttons: 1, clientX: p.x, clientY: p.y }))
        }
        await listo
      }
      const ms = muestras.slice(5).sort((a, b) => a - b)
      return { muestras, p95Ms: ms[Math.floor(ms.length * .95)], maxMs: ms.at(-1) }
    }, curva)
    recorridos.push({ curva, ...medidas })
    await page.keyboard.press('Escape'); await page.mouse.up()
  }
  const gpu = (await page.evaluate(() => window.tukiQA.estado()) as unknown as { gpu: string }).gpu
  expect(gpu).not.toMatch(/swiftshader|llvmpipe|software|basic render/i)
  const informe = { objetos, recorridos, gpu, navegador: info.project.name, version: browser.version(), cpu: os.cpus()[0].model,
    sistema: os.version(), viewport: page.viewportSize(), metodo: 'Entrada hasta onAfterRender de Three.js; envío del cuadro con GPU real, sin medir el scanout de la pantalla.' }
  await info.attach('latencia-trazado', { body: JSON.stringify(informe, null, 2), contentType: 'application/json' })
  console.log(JSON.stringify({ ...informe, recorridos: recorridos.map(({ muestras: _muestras, ...r }) => r) }))
  expect(errores).toEqual([])
  for (const r of recorridos) expect(r.p95Ms).toBeLessThanOrEqual(33)
})
