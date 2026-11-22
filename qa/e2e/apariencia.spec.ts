import { test, expect, type Page } from './entorno'
import type { Light, Scene, SpotLight } from 'three'
import { fondos, type FondoVisual } from '../../src/fondo'

async function elegir(page: Page, valor: 'claro' | 'oscuro' | 'sistema') {
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Apariencia').selectOption(valor)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
}

test('Claro, Oscuro y Según el sistema se guardan y respetan los cambios del sistema', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('./?revision')
  const raiz = page.locator('html')
  // Existing players and fresh profiles keep the original appearance until opting in.
  await expect(raiz).toHaveAttribute('data-apariencia', 'claro')
  await elegir(page, 'sistema')
  await expect(raiz).toHaveAttribute('data-apariencia', 'oscuro')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(raiz).toHaveAttribute('data-apariencia', 'claro')
  await elegir(page, 'oscuro')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(raiz).toHaveAttribute('data-apariencia', 'oscuro')
  await page.reload()
  await expect(raiz).toHaveAttribute('data-apariencia', 'oscuro')
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#111d1b')
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await expect(page.getByLabel('Apariencia')).toHaveValue('oscuro')
  await page.getByLabel('Movimiento de la interfaz').selectOption('reducido')
  await page.getByLabel('Apariencia').selectOption('claro')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(raiz).toHaveAttribute('data-apariencia', 'claro')
  await page.reload()
  await expect(raiz).toHaveAttribute('data-apariencia', 'claro')
  await expect(raiz).toHaveAttribute('data-reducido', 'true')
  await elegir(page, 'sistema')
  await page.reload()
  await expect(raiz).toHaveAttribute('data-apariencia', 'oscuro')
})

async function observarEscena(page: Page) {
  await page.addInitScript(() => {
    const hook = new EventTarget()
    hook.addEventListener('observe', event => {
      const scene = (event as CustomEvent).detail as Scene
      if (!scene.isScene) return
      scene.onAfterRender = renderer => {
        if (!scene.userData.tukiFondo) return // Inventory thumbnails keep their transparent scene.
        window.ambienteTuki = {
          escena: scene.uuid,
          fondo: { ...scene.userData.tukiFondo },
          sombras: scene.children.filter(o => (o as Light).isLight && o.visible && o.castShadow).map(o => {
            const l = o as SpotLight
            return { tipo: l.type, posicion: l.position.toArray(), destino: l.target.position.toArray() }
          }),
          texturas: renderer.info.memory.textures,
          geometria: renderer.info.memory.geometries,
        }
      }
    })
    Object.assign(window, { __THREE_DEVTOOLS__: hook })
  })
}

test('alternar conserva armado, selección, cámara, miniaturas y el resultado de la cadena', async ({ page }) => {
  await observarEscena(page)
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('recta'))
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  const p = await page.evaluate(() => window.tukiQA.proyectar([0, .025, 0]))
  await page.mouse.click(p.x, p.y)
  const antes = await page.evaluate(() => window.tukiQA.estado())
  expect(antes.seleccion).toBe('d3')
  const imagen = await page.locator('[data-tool=domino] img').getAttribute('src')
  const escena = await page.evaluate(() => window.ambienteTuki.escena)
  await elegir(page, 'oscuro')
  await expect.poll(() => page.evaluate(() => window.ambienteTuki.fondo)).toEqual(fondos.oscuro)
  const noche = await page.evaluate(() => window.ambienteTuki)
  expect(noche.sombras.map(l => l.tipo)).toEqual(['SpotLight'])
  const despues = await page.evaluate(() => window.tukiQA.estado())
  for (const clave of ['armado', 'seleccion', 'historia', 'vista', 'fase'] as const) expect(despues[clave]).toEqual(antes[clave])
  await page.getByRole('button', { name: 'Vista superior' }).click()
  expect((await page.evaluate(() => window.ambienteTuki)).sombras).toEqual(noche.sombras)
  await elegir(page, 'claro')
  await expect.poll(() => page.evaluate(() => window.ambienteTuki.sombras[0]?.tipo)).toBe('DirectionalLight')
  await elegir(page, 'oscuro')
  const recursos = await page.evaluate(() => window.ambienteTuki)
  for (let i = 0; i < 2; i++) { await elegir(page, 'claro'); await elegir(page, 'oscuro') }
  expect(await page.evaluate(() => window.ambienteTuki.escena)).toBe(escena)
  expect(await page.evaluate(() => window.ambienteTuki.texturas)).toBe(recursos.texturas)
  expect(await page.evaluate(() => window.ambienteTuki.geometria)).toBe(recursos.geometria)
  expect(await page.locator('[data-tool=domino] img').getAttribute('src')).toBe(imagen)
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Completaste La recta', exact: true })).toBeVisible()
  const resultado = await page.evaluate(() => window.tukiQA.estado())
  await elegir(page, 'claro')
  expect(await page.evaluate(() => window.tukiQA.estado().resultado)).toBe(resultado.resultado)
  expect(await page.evaluate(() => window.tukiQA.estado().fase)).toBe(resultado.fase)
})

test('la noche cubre portada, niveles, ayudas y Taller en escritorio y móvil', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    // Firefox also runs init scripts in the transient about:blank document,
    // whose opaque origin cannot access localStorage.
    if (!['http:', 'https:'].includes(location.protocol)) return
    window.tukiPrueba.sembrar({
      completados: ['recta','curva','libro','taza','vuelta','subibaja','puerta','puente','mate','bajada'],
      audio: false, movimiento: 'reducido', apariencia: 'oscuro',
    })
  })
  const errores: string[] = []
  page.on('pageerror', e => errores.push(e.message))
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Desafíos', exact: true }).click()
  for (const nivel of ['libro', 'taza', 'mate']) {
    await page.locator('[data-level=' + nivel + ']').click()
    await page.locator('[data-action=jugar-' + nivel + ']').click()
    await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath(nivel + '-noche.png') })
    if (nivel === 'taza') {
      await page.getByRole('button', { name: 'Vista superior' }).click()
      await page.screenshot({ path: testInfo.outputPath('taza-superior-noche.png') })
    }
    await page.getByRole('button', { name: 'Volver a desafíos' }).click()
  }
  await page.getByRole('button', { name: 'Volver al inicio' }).click()
  await page.screenshot({ path: testInfo.outputPath('portada-noche.png') })
  await page.evaluate(() => window.tukiQA.cargar('taller100'))
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await page.screenshot({ path: testInfo.outputPath('taller-noche.png') })
  await page.evaluate(() => window.tukiQA.cargar('taza-mixta'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('movil-noche.png') })
  await page.getByRole('button', { name: 'Piezas', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Piezas disponibles' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('inventario-noche.png') })
  await page.getByRole('button', { name: 'Cerrar inventario' }).click()
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await expect(page.getByLabel('Apariencia')).toHaveValue('oscuro')
  await page.screenshot({ path: testInfo.outputPath('preferencias-noche.png') })
  await page.getByLabel('Apariencia').selectOption('claro')
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('movil-claro.png') })
  expect(errores).toEqual([])
})

declare global {
  interface Window {
    ambienteTuki: {
      escena: string; fondo: FondoVisual; texturas: number; geometria: number
      sombras: { tipo: string; posicion: number[]; destino: number[] }[]
    }
  }
}
