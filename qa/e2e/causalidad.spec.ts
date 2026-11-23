import { test, expect, type Page } from './entorno'

declare global {
  interface Window { rematesCausalidad(): number[] }
}

const explicacion = 'La meta cayó, pero no se detectó una cadena desde el inicio. Conectá el recorrido desde la primera ficha hasta la meta.'
async function abrir(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('tuki.v1.campana.bajada')) window.tukiPrueba.sembrar({
      completados: ['recta', 'curva', 'libro', 'taza', 'vuelta', 'bajada'], audio: true, movimiento: 'reducido',
    })
    const frases: number[] = [], start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (cuando, desde, duracion) {
      if (this.buffer && [1.2, 6.9435].some(segundos => Math.abs(this.buffer!.duration - segundos) < .001)) frases.push(desde ?? 0)
      start.call(this, cuando, desde, duracion)
    }
    window.rematesCausalidad = () => frases
  })
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Jugar El subibaja', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}

test('el contacto simultáneo acredita Subibaja, toca una guitarra y conserva el siguiente desafío', async ({ page }) => {
  test.slow()
  await abrir(page)
  await page.evaluate(() => window.tukiQA.cargar('subibaja-contacto-simultaneo'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Completaste El subibaja', exact: true })).toBeVisible()
  const r = await page.evaluate(() => ({ estado: window.tukiQA.estado(), frases: window.rematesCausalidad(), progreso: window.tukiPrueba.progreso() }))
  expect(r.estado.eventos.filter(e => e.tipo === 'victoria')).toHaveLength(1)
  expect(r.estado.motivoDetencion).toBeNull()
  expect(r.frases).toEqual([0])
  expect(r.progreso).toContain('subibaja')
  await expect(page.getByText(explicacion, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.getByRole('heading', { name: '08 · La bandera arriba', exact: true })).toBeVisible()
  await page.reload()
  expect(await page.evaluate(() => window.tukiPrueba.progreso())).toContain('subibaja')
  await expect(page.getByRole('button', { name: 'Jugar La bandera arriba', exact: true })).toBeEnabled()
})

test('una caída ajena a la cadena explica el fallo sin guitarra ni desbloqueo y limpia el mensaje al reintentar', async ({ page }) => {
  test.slow()
  await abrir(page)
  await page.evaluate(async () => {
    await window.tukiQA.cargar('subibaja')
    // Controlled physical failure: drop an unrelated ball beside the goal. This
    // bypasses placement validation only in QA, not the simulation or result UI.
    const a = window.tukiQA.estado().armado
    a.piezas = a.piezas.filter(p => p.id === 'bola')
    a.piezas[0].posicion = [.158, .18, -.006]
  })
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cadena detenida', exact: true })).toBeVisible()
  await expect(page.getByText(explicacion, { exact: true })).toBeVisible()
  const r = await page.evaluate(() => ({ estado: window.tukiQA.estado(), frases: window.rematesCausalidad(), progreso: window.tukiPrueba.progreso() }))
  expect(r.estado.motivoDetencion).toBe('meta-sin-cadena')
  expect(r.estado.eventos.filter(e => e.tipo === 'victoria')).toEqual([])
  expect(r.frases).toEqual([])
  expect(r.progreso).not.toContain('subibaja')
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar armado', exact: true }).click()
  await expect(page.getByText(explicacion, { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.tukiQA.cargar('subibaja-contacto-simultaneo'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  expect(await page.evaluate(() => window.tukiQA.estado().motivoDetencion)).toBeNull()
  await expect(page.getByText(explicacion, { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Completaste El subibaja', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.rematesCausalidad())).toEqual([0])
})
