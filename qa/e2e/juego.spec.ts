import { test, expect, type Page } from '@playwright/test'
import s from '../fixtures/s.json' with { type: 'json' }
type State = {
  fase: string
  resultado: string | null
  cargado: boolean
  historia: number
  seleccion: string | null
  armado: typeof s.armado
  eventos: { tipo: string }[]
}
type QA = {
  estado(): State
  proyectar(pos: number[]): { x: number; y: number }
  cargar(nombre: string, rota?: boolean): Promise<void>
}
declare global {
  interface Window {
    tukiQA: QA
  }
}
const estado = (p: Page) => p.evaluate(() => window.tukiQA.estado())
const punto = (p: Page, pos: number[]) => p.evaluate((v) => window.tukiQA.proyectar(v), pos)
const abrir = async (p: Page) => {
  await p.goto('./?revision')
  await p.getByRole('button', { name: 'Jugar La curva', exact: true }).click()
  await expect(p.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}
async function arrastrar(p: Page, muestras: number[][]) {
  const coords = await p.evaluate((ps) => ps.map((pos) => window.tukiQA.proyectar(pos)), muestras)
  await p.mouse.move(coords[0].x, coords[0].y)
  await p.mouse.down()
  for (const q of coords.slice(1)) await p.mouse.move(q.x, q.y, { steps: 3 })
  await p.mouse.up()
}
test('recorrido con el mouse, reparación y progreso en una sesión limpia', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await page.getByRole('button', { name: 'Trazar fila' }).click()
  const path = s.armado.piezas.map((p) => p.posicion)
  const nivelFinal = path.at(-1)!
  await arrastrar(page, [...path, [nivelFinal[0] + 0.01, 0, nivelFinal[2] - 0.005]])
  let st = await estado(page)
  expect(st.armado.piezas).toHaveLength(8)
  expect(st.armado.saldo.domino).toBe(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  expect((await estado(page)).armado.saldo.domino).toBe(8)
  await page.getByRole('button', { name: 'Trazar fila' }).click()
  await arrastrar(page, [...path, [nivelFinal[0] + 0.01, 0, nivelFinal[2] - 0.005]])
  st = await estado(page)
  await page.getByRole('button', { name: 'Empujar' }).dblclick()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  expect((await estado(page)).eventos.filter((e) => e.tipo === 'empujon')).toHaveLength(1)
  await page.getByRole('button', { name: 'Cámara lenta' }).click()
  await page.getByRole('button', { name: 'Repetir', exact: true }).click()
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  expect((await estado(page)).armado).toEqual(st.armado)
  const pieza = st.armado.piezas[3],
    moved = [pieza.posicion[0], 0, 0.075]
  await arrastrar(page, [pieza.posicion, moved])
  const cambiado = (await estado(page)).armado
  expect(
    cambiado.piezas.filter((p, i) => JSON.stringify(p) !== JSON.stringify(st.armado.piezas[i])),
  ).toHaveLength(1)
  await page.getByRole('button', { name: 'Empujar' }).click()
  await page.getByRole('heading', { name: 'Cadena detenida' }).waitFor()
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  expect((await estado(page)).armado).toEqual(cambiado)
  await arrastrar(page, [moved, pieza.posicion])
  await page.getByRole('button', { name: 'Empujar' }).click()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { name: 'Del libro a la mesa' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Jugar Del libro a la mesa' })).toBeEnabled()
})
test('selección, apoyo inválido, cancelar y cámara', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await page.getByRole('button', { name: /Dominó.*8/ }).click()
  const pos = [0, 0, 0.08],
    point = await punto(page, pos)
  await page.mouse.click(point.x, point.y)
  const antes = await estado(page)
  expect(antes.armado.saldo.domino).toBe(7)
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  await page.mouse.wheel(0, -80)
  expect((await estado(page)).seleccion).toBe(antes.seleccion)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const q = await punto(page, pos)
  await page.mouse.move(q.x, q.y)
  await page.mouse.down()
  await page.mouse.move(q.x + 35, q.y)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect((await estado(page)).armado).toEqual(antes.armado)
  await page.getByRole('button', { name: 'Empujar' }).click()
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  expect((await estado(page)).armado).toEqual(antes.armado)
})
test('reintenta un recurso esencial y diagnostica WebGL 2', async ({ page }) => {
  await page.route('**/models/domino.glb', (r) => r.abort())
  await page.goto('./')
  await page.getByRole('button', { name: 'Jugar La curva' }).click()
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  await page.unroute('**/models/domino.glb')
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('button', { name: 'Empujar' })).toBeEnabled()
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      id: string,
      ...args: unknown[]
    ) {
      return id === 'webgl2' ? null : Reflect.apply(orig, this, [id, ...args])
    } as typeof orig
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'Jugar La curva' }).click()
  await expect(page.getByText(/WebGL\s?2/i)).toBeVisible()
})

test('victoria y fallo se reconocen en silencio y con movimiento reducido', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Sonido', { exact: true }).uncheck()
  await page.getByLabel('Movimiento de la interfaz').selectOption('reducido')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.evaluate(() => window.tukiQA.cargar('s'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' })).toBeVisible()
  expect(
    await page
      .locator('.remate svg>g')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  await page.evaluate(() => window.tukiQA.cargar('s', true))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cadena detenida' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible()
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await expect(page.getByLabel('Movimiento de la interfaz')).toHaveValue('reducido')
})
