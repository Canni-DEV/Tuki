import { test, expect } from '@playwright/test'
import type { Mesh, Scene } from 'three'

test('la llegada a la mesa 05 deja fuera de cuadro el origen y solo dibuja las dos mesas del viaje', async ({ page }, testInfo) => {
  await page.setViewportSize({ width:1913, height:946 })
  await page.addInitScript(() => {
    localStorage.setItem('tuki.progreso.v1', JSON.stringify({
      version:1, campana:2, completados:['recta','curva','libro','taza','vuelta','subibaja','puerta','puente','mate','bajada'], audio:false, movimiento:'completo'
    }))
    // Inspect actual render frames using Three's devtools observer, including the frame before cleanup.
    const hook = new EventTarget()
    hook.addEventListener('observe', event => {
      const scene = (event as CustomEvent).detail as Scene
      if (!scene.isScene) return
      scene.onBeforeRender = (_renderer, _scene, camera) => {
        if (!document.querySelector('[data-level=vuelta][aria-pressed=true]')) return
        const tableros: Mesh[] = []
        scene.traverseVisible(objeto => {
          if (objeto.name === 'table' && (objeto as Mesh).isMesh) tableros.push(objeto as Mesh)
        })
        if (!tableros.length) return
        let origenEnCuadro = false
        for (const mesh of tableros) {
          const posicion = mesh.getWorldPosition(mesh.position.clone())
          if (Math.hypot(posicion.x, posicion.z) < .01) continue
          const vertices = mesh.geometry.getAttribute('position')
          for (let i = 0; i < vertices.count; i++) {
            const p = posicion.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld).project(camera)
            if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1) origenEnCuadro = true
          }
        }
        window.fotogramasMesas.push({ total: tableros.length, origenEnCuadro })
      }
    })
    Object.assign(window, { __THREE_DEVTOOLS__: hook, fotogramasMesas: [] })
  })
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('vuelta'))
  await page.getByRole('button', {name:'Volver a desafíos'}).click()
  for (const [width, height, desde] of [[1913,946,'taza'], [390,844,'recta'], [844,390,'subibaja']] as const) {
    await page.setViewportSize({width, height})
    await page.locator('[data-level=' + desde + ']').click()
    // Entering play waits for the source models, then returning uses the same prepared board.
    await page.locator('[data-action=jugar-' + desde + ']').click()
    await expect(page.getByRole('button',{name:'Empujar'})).toBeEnabled()
    await page.getByRole('button',{name:'Volver a desafíos'}).click()
    await page.evaluate(() => { window.fotogramasMesas.length = 0 })
    await page.locator('[data-level=vuelta]').click()
    await page.waitForFunction(() => {
      const frames = window.fotogramasMesas
      return frames.some(f => f.total > 1) && frames.at(-1)?.total === 1
    })
    const frames = await page.evaluate(() => window.fotogramasMesas)
    expect(Math.max(...frames.map(f => f.total))).toBe(2)
    expect(frames.filter(f => f.total === 2).at(-1)?.origenEnCuadro).toBe(false)
    await page.screenshot({path: testInfo.outputPath('mesa-05-' + width + 'x' + height + '.png')})
  }
})

declare global {
  interface Window {
    fotogramasMesas: { total: number; origenEnCuadro: boolean }[]
  }
}

test('el atril conserva el canvas, oculta los bloqueos y acepta cambios durante el viaje', async ({ page }) => {
  await page.goto('./?revision')
  const canvas = await page.locator('#mesa').elementHandle()
  await page.getByRole('button', { name: 'Desafíos', exact: true }).click()
  const elegida = page.locator('.ficha[aria-pressed=true]')
  await expect(elegida).toHaveAttribute('data-level', 'recta')
  await page.locator('[data-level=curva]').click()
  await expect(page.getByRole('status').filter({ hasText: 'Completá La recta.' })).toBeVisible()
  await expect(elegida).toHaveAttribute('data-level','recta')
  await page.getByRole('button', { name: 'Volver al inicio' }).click()
  await expect(page.getByRole('button', { name: 'Jugar La recta' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tuki.progreso.v1') ?? '{"completados":[]}').completados)).toEqual([])
  expect(await canvas!.evaluate(c => c === document.querySelector('#mesa'))).toBe(true)

  await page.evaluate(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
    version:1, campana:2, completados:['recta','curva','libro','taza','vuelta','subibaja','puerta','puente','mate','bajada'], audio:false, movimiento:'completo'
  })))
  await page.reload()
  await page.getByRole('button', {name:'Jugar',exact:true}).click()
  await expect(page.locator('.ficha')).toHaveCount(10)
  for (const id of ['curva','puente','taza']) await page.locator('[data-level='+id+']').click()
  await expect(elegida).toHaveAttribute('data-level','taza')
  await page.getByRole('button',{name:'La llave de paso',exact:true}).click()
  await expect(elegida).toHaveAttribute('data-level','taza')
  await expect(page.getByRole('heading', { name:'La llave de paso' })).toBeVisible()
  await page.getByRole('button', { name:'Alrededor de la taza', exact:true }).click()
  await expect(page.getByRole('button', { name:'Jugar Alrededor de la taza' })).toBeVisible()
  await page.locator('[data-level=vuelta]').click()
  await expect(page.getByRole('button', { name:'La llave de paso', exact:true })).toHaveCount(0)
  await page.locator('[data-level=taza]').click()
  await page.getByRole('button',{name:'La llave de paso',exact:true}).click()
  await page.getByRole('button',{name:'Jugar La llave de paso'}).click()
  await expect(page.getByRole('button',{name:'Empujar',exact:true})).toBeEnabled()
  expect((await page.evaluate(() => window.tukiQA.estado())).armado.nivel).toBe('taza-llave')
})

test.describe('gestos sobre el tablero', () => {
  test.use({ viewport: { width:390, height:844 }, hasTouch:true })
  test('dos dedos cancelan la edición y un trazo táctil completa La recta', async ({page, browserName}) => {
    test.skip(browserName !== 'chromium', 'La inyección multipuntero usa el transporte táctil CDP de Chromium.')
    await page.goto('./?revision')
    await page.getByRole('button',{name:'Jugar La recta'}).tap()
    await expect(page.getByRole('button',{name:'Empujar'})).toBeEnabled()
    const sesion = await page.context().newCDPSession(page)
    const tocar = (type: 'touchStart'|'touchMove'|'touchEnd', touchPoints: {x:number;y:number;id:number}[]) =>
      sesion.send('Input.dispatchTouchEvent', {type, touchPoints})
    const proyectar = (x:number) => page.evaluate(x => window.tukiQA.proyectar([x,0,0]),x)
    const a = {...await proyectar(0), id:1}
    await page.locator('[data-tool=domino]').tap()
    await tocar('touchStart',[a])
    await tocar('touchStart',[a, {x:a.x+30,y:a.y+20,id:2}])
    await tocar('touchMove',[a, {x:a.x+65,y:a.y+35,id:2}])
    await tocar('touchEnd',[])
    const estado = await page.evaluate(() => window.tukiQA.estado())
    expect(estado.armado.piezas).toHaveLength(0)
    expect(estado.armado.saldo.domino).toBe(6)
    await page.getByRole('button',{name:'Vista superior'}).tap()
    await page.getByRole('button',{name:'Trazar fila'}).tap()
    const desde = {...await proyectar(-.054),id:1}, hasta = {...await proyectar(.055),id:1}
    await tocar('touchStart',[desde])
    for (let i = 1; i <= 12; i++) {
      await tocar('touchMove',[{x:desde.x+(hasta.x-desde.x)*i/12, y:desde.y+(hasta.y-desde.y)*i/12, id:1}])
    }
    await tocar('touchEnd',[])
    await page.getByRole('button',{name:'Empujar'}).tap()
    await expect(page.getByRole('heading',{name:'Completaste La recta'})).toBeVisible()
    await expect(page.getByRole('button',{name:'Siguiente'})).toBeInViewport({ratio:1})
  })
})
