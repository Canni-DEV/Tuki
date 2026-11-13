import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function preparar(page: Page, completados: string[]) {
  await page.addInitScript(ids => {
    if (!localStorage.getItem('tuki.progreso.v1'))
      localStorage.setItem('tuki.progreso.v1', JSON.stringify({version:1,campana:2,completados:ids,audio:false,movimiento:'reducido'}))
  },completados)
  await page.goto('./?revision')
}
const anteriores = ['recta','curva','libro','taza','vuelta','subibaja','puerta','puente']

test('los tres cables del mate quedan fijos al colocar fichas y durante la caída', async ({page}) => {
  await preparar(page, anteriores)
  await page.getByRole('button', {name:'Jugar La mesa del mate'}).click()
  await expect(page.getByRole('button', {name:'Empujar'})).toBeEnabled()
  const rutas = () => page.evaluate(() => window.tukiQA.recorridosCable())
  const fijas = await rutas()
  expect(fijas).toHaveLength(3)
  for (const cable of fijas) expect(cable).toHaveLength(1)

  await page.getByRole('button', {name:'Vista superior'}).click()
  const ruta = fijas[0][0]
  // The long run from B to the gate has room for a full tile on both sides.
  const i = ruta.findIndex((b, i) => i > 0 && b[1] < .002 && ruta[i-1][1] < .002 &&
    Math.hypot(b[0] - ruta[i-1][0], b[2] - ruta[i-1][2]) > .2)
  expect(i).toBeGreaterThan(0)
  const a = ruta[i-1], b = ruta[i]
  const punto = await page.evaluate(p => window.tukiQA.proyectar(p), [(a[0]+b[0])/2, 0, (a[2]+b[2])/2])
  await page.locator('[data-tool=domino]').click()
  await page.mouse.move(punto.x, punto.y)
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().previas.length)).toBe(1)
  expect(await page.evaluate(() => window.tukiQA.estado().motivo)).toBeNull()
  expect(await rutas()).toEqual(fijas)
  await page.mouse.click(punto.x, punto.y)
  await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.length)).toBe(1)
  expect(await rutas()).toEqual(fijas)

  await page.evaluate(() => window.tukiQA.cargar('mate'))
  expect(await rutas()).toEqual(fijas)
  await page.getByRole('button', {name:'Empujar'}).click()
  await expect(page.getByRole('heading', {name:'Completaste La mesa del mate'})).toBeVisible()
  expect(await rutas()).toEqual(fijas)
})

test('el 9 muestra dónde falló la combinación y al corregir la fila abre el 10', async ({page}) => {
  await preparar(page,anteriores)
  await expect(page.getByRole('button',{name:'Jugar La mesa del mate'})).toBeVisible()
  await page.evaluate(() => window.tukiQA.cargar('mate', false, 'B0'))
  await page.getByRole('button',{name:'Empujar'}).click()
  await expect(page.getByRole('heading',{name:'Cadena detenida'})).toBeVisible()
  await expect(page.locator('.test-state output')).toContainText('Error en el paso 1 (A)')
  await page.evaluate(() => window.tukiQA.cargar('mate'))
  await page.getByRole('button',{name:'Empujar'}).click()
  await expect(page.getByRole('heading',{name:'Completaste La mesa del mate'})).toBeVisible()
  await expect(page.locator('.test-state output')).toContainText('3/3 · B → A → C')
  await page.getByRole('button',{name:'Siguiente'}).click()
  await expect(page.getByRole('heading',{name:/10.*La bajada de los libros/})).toBeVisible()
  await expect(page.locator('[data-tool=domino]')).toHaveCount(0)
  await page.evaluate(() => window.tukiQA.cargar('bajada'))
  await page.getByRole('button',{name:'Empujar'}).click()
  await expect(page.getByRole('heading',{name:'Completaste La bajada de los libros'})).toBeVisible()
})
for (const tactil of [false,true]) test.describe(tactil ? 'Torre táctil' : 'Torre con mouse', () => {
  test.use(tactil ? {hasTouch:true,viewport:{width:390,height:844}} : {viewport:{width:1366,height:768}})
  test('la cámara encuadra los extremos y se puede colocar sobre cada terraza', async ({page,browserName}, testInfo) => {
    test.skip(tactil && browserName === 'firefox' && testInfo.project.use.channel === 'moz-firefox',
      'Firefox de escritorio en Windows no entrega eventos de touchscreen.tap al canvas.')
    await preparar(page,[...anteriores,'mate'])
    await page.getByRole('button',{name:'Jugar La bajada de los libros'}).click()
    await expect(page.getByRole('button',{name:'Empujar'})).toBeEnabled()
    for (const extremo of [[-.145,.225,-.1905],[.174,.050,.210]]) {
      const p = await page.evaluate(v => window.tukiQA.proyectar(v),extremo)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(page.viewportSize()!.width)
      expect(p.y).toBeGreaterThan(50)
      expect(p.y).toBeLessThan(page.viewportSize()!.height-65)
    }
    await page.getByRole('button',{name:'Vista superior'}).click()
    for (const [x,y,z,apoyo] of [
      [-.161,.175,-.235,'cima-tapa'],[-.152,.130,-.06,'primer-giro-tapa'],
      [-.020,.099,-.012,'segundo-giro-tapa'],[.085,.059,.125,'tercer-giro-tapa'],
    ] as const) {
      await page.locator('[data-tool=taco]').click()
      const p = await page.evaluate(v => window.tukiQA.proyectar(v),[x,y,z])
      if (tactil) await page.touchscreen.tap(p.x,p.y)
      else await page.mouse.click(p.x,p.y)
      await expect.poll(() => page.evaluate(() => window.tukiQA.estado().armado.piezas.at(-1)?.apoyo)).toBe(apoyo)
      await page.getByRole('button',{name:'Deshacer'}).click()
    }
  })
})
test('el Taller guarda el orden, exporta la versión 4 y respeta el desbloqueo al importar', async ({page}) => {
  await preparar(page,[...anteriores,'mate'])
  const pieza = (id: string,tipo: string,x: number,z: number) => ({ id,tipo,posicion:[x,0,z],apoyo:'tablero',giroY:0 })
  const doc = {version:3,perfilFisico:'mvp-1',nombre:'Dos palancas',piezas:[
    pieza('izquierda','palanca',-.16,-.05),pieza('derecha','palanca',.16,-.05),pieza('salida','puerta',0,.08),
    pieza('inicio','inicio',-.22,.12),pieza('meta','meta',.27,.12)
  ],conexiones:[{mando:'izquierda',receptor:'salida'},{mando:'derecha',receptor:'salida'}]}
  await page.getByRole('button',{name:'Taller libre'}).click()
  await page.locator('#archivo-mesa').setInputFiles({name:'mesa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
  await expect(page.getByRole('button',{name:'Empujar'})).toBeEnabled()
  await page.getByRole('button',{name:'Vista superior'}).click()
  const p = await page.evaluate(() => window.tukiQA.proyectar([.02,.023,.080]))
  await page.mouse.click(p.x,p.y)
  await page.getByRole('button',{name:'Configurar secuencia'}).click()
  await page.getByRole('combobox').selectOption('secuencia')
  await page.getByRole('button',{name:'Subir derecha'}).click()
  await page.getByRole('button',{name:'Guardar',exact:true}).click()
  await expect(page.getByRole('button',{name:'Deshacer'})).toBeEnabled()
  await page.getByRole('button',{name:'Volver a mis mesas'}).click()
  await page.getByRole('button',{name:'Abrir mesa'}).click()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button',{name:'Más acciones'}).click()
  await page.getByRole('button',{name:'Exportar mesa'}).click()
  const archivo = (await (await descarga).path())!
  const guardada = JSON.parse(await readFile(archivo,'utf8'))
  expect(guardada.version).toBe(4)
  expect(guardada.secuencias).toEqual([{receptor:'salida',mandos:['derecha','izquierda']}])
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('tuki.progreso.v1')!)
    prefs.completados = prefs.completados.filter((id: string) => id !== 'mate')
    localStorage.setItem('tuki.progreso.v1',JSON.stringify(prefs))
  })
  await page.reload()
  await page.getByRole('button',{name:'Taller libre'}).click()
  await page.locator('#archivo-mesa').setInputFiles(archivo)
  await expect(page.getByText('Taller · Solo lectura')).toBeVisible()
  await expect(page.getByRole('button',{name:'Empujar'})).toBeEnabled()
  await expect(page.getByRole('button',{name:'Configurar secuencia'})).toHaveCount(0)
})
