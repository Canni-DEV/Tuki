import { test, expect } from '@playwright/test'
import type { Scene } from 'three'

for (const apariencia of ['claro', 'oscuro']) {
  test('la portada reproduce la caída y conserva su pose al volver, en ' + apariencia, async ({ page }, testInfo) => {
    const errores: string[] = []
    page.on('pageerror', e => errores.push(e.message))
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'))
    await page.addInitScript(apariencia => {
      if (['http:', 'https:'].includes(location.protocol)) localStorage.setItem('tuki.progreso.v1', JSON.stringify({
        version: 1, campana: 2, completados: [], audio: false, movimiento: 'completo', apariencia,
      }))
      const hook = new EventTarget()
      hook.addEventListener('observe', event => {
        const scene = (event as CustomEvent).detail as Scene
        if (!scene.isScene) return
        window.escenasPortada.push(scene)
        scene.onBeforeRender = () => {
          if (document.querySelector('#app')?.getAttribute('data-destino') !== 'inicio') return
          const piezas = Array.from({ length: 8 }, (_, i) => scene.getObjectByName('domino-portada-' + i))
          if (piezas.some(p => !p)) return
          window.framesPortada.push(piezas.map(p => [...p!.position.toArray(), ...p!.quaternion.toArray()]))
        }
      })
      Object.assign(window, { __THREE_DEVTOOLS__: hook, framesPortada: [], escenasPortada: [] })
    }, apariencia)
    await page.goto('./?revision')
    await expect.poll(() => page.evaluate(() => window.escenasPortada.some(s => !!s.getObjectByName('domino-portada-7')))).toBe(true)
    await page.clock.runFor(32)
    const canvas = await page.locator('#mesa').elementHandle()
    await page.screenshot({ path: testInfo.outputPath('inicio-' + apariencia + '.png') })
    for (const [avance, nombre] of [[400, 'primer-contacto'], [180, 'cadena'], [180, 'ultimo-contacto'], [900, 'reposo']] as const) {
      await page.clock.runFor(avance)
      await page.screenshot({ path: testInfo.outputPath(nombre + '-' + apariencia + '.png') })
    }
    const frames = await page.evaluate(() => window.framesPortada)
    const vertical = (p: number[]) => 1 - 2 * (p[3] ** 2 + p[5] ** 2)
    expect(frames[0].every(p => vertical(p) > .999)).toBe(true)
    expect(frames.some(f => f.some(p => vertical(p) < .8) && f.some(p => vertical(p) > .999))).toBe(true)
    expect(frames.at(-1)!.every(p => vertical(p) < .5)).toBe(true)
    const final = frames.at(-1)
    await page.clock.resume()
    await page.getByRole('button', { name: 'Desafíos', exact: true }).click()
    await page.getByRole('button', { name: 'Volver al inicio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Jugar La recta' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.framesPortada.at(-1))).toEqual(final)
    expect(await canvas!.evaluate(c => c === document.querySelector('#mesa'))).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('movil-' + apariencia + '.png') })
    expect(errores).toEqual([])
  })
}

test('con movimiento reducido la portada aparece directamente en reposo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const hook = new EventTarget()
    hook.addEventListener('observe', event => {
      const scene = (event as CustomEvent).detail as Scene
      if (!scene.isScene) return
      scene.onBeforeRender = () => {
        const ultima = scene.getObjectByName('domino-portada-7')
        if (ultima) window.verticalUltima = 1 - 2 * (ultima.quaternion.x ** 2 + ultima.quaternion.z ** 2)
      }
    })
    Object.assign(window, { __THREE_DEVTOOLS__: hook })
  })
  await page.goto('./?revision')
  await expect.poll(() => page.evaluate(() => window.verticalUltima)).toBeLessThan(.01)
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
})

declare global {
  interface Window {
    escenasPortada: Scene[]
    framesPortada: number[][][]
    verticalUltima?: number
  }
}
