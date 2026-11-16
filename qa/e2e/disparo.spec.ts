import { expect } from '@playwright/test'
import { test } from './reloj-partida'
import nivel from '../../src/data/disparo.json' with { type: 'json' }

for (const [width, height] of [[1366, 768], [390, 844]]) for (const apariencia of ['claro', 'oscuro']) {
  test(`disparo: dos zonas visibles a ${width} × ${height}, ${apariencia}`, async ({ page }, info) => {
    const errores: string[] = []
    page.on('pageerror', e => errores.push(e.message))
    await page.setViewportSize({ width, height })
    await page.addInitScript(apariencia => {
      if (location.protocol === 'http:') localStorage.setItem('tuki.progreso.v2', JSON.stringify({
        version: 1, completados: [], audio: false, movimiento: 'reducido', apariencia,
      }))
    }, apariencia)
    await page.goto('./?revision')
    await page.evaluate(() => window.tukiQA.cargar('disparo'))
    await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
    const puntos = nivel.objetos.filter(p => ['inicio', 'meta', 'mando', 'lanzador'].includes(p.id))
      .flatMap(p => [p.posicion, [p.posicion[0], p.posicion[1] + (p.id === 'meta' ? .074 : .05), p.posicion[2]]])
    puntos.push([-.365, .072, -.21], [-.365, .072, -.07], [.1725, .09, .07])
    const proyectados = await page.evaluate(puntos => puntos.map(p => window.tukiQA.proyectar(p)), puntos)
    const cabecera = await page.locator('.game-head').boundingBox()
    for (const p of proyectados) {
      expect(p.x).toBeGreaterThan(8)
      expect(p.x).toBeLessThan(width - 8)
      expect(p.y).toBeGreaterThan(cabecera!.y + cabecera!.height)
      expect(p.y).toBeLessThan(height - 74)
    }
    await page.screenshot({ path: info.outputPath('perspectiva.png') })
    await page.getByRole('button', { name: 'Vista superior' }).click()
    await page.screenshot({ path: info.outputPath('superior.png') })
    expect(errores).toEqual([])
  })
}

for (const nombre of ['disparo-atajo', 'disparo-rodeo']) {
  test(`${nombre}: el atajo termina sin disparo ni victoria`, async ({ page, pausarPartida }) => {
    await page.goto('./?revision')
    await page.evaluate(n => window.tukiQA.cargar(n), nombre)
    await pausarPartida()
    await page.getByRole('button', { name: 'Empujar', exact: true }).click()
    for (let i = 0; i < 40; i++) {
      await page.clock.fastForward(500)
      if ((await page.evaluate(() => window.tukiQA.estado())).fase === 'resultado') break
    }
    const estado = await page.evaluate(() => window.tukiQA.estado())
    expect(estado.fase).toBe('resultado')
    expect(estado.resultado).toBe('detenida')
    expect(estado.eventos.some(e => e.tipo === 'disparo' || e.tipo === 'victoria')).toBe(false)
  })
}
