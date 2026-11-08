import { test, expect, type Page } from '@playwright/test'
import s from '../fixtures/s.json' with { type: 'json' }
import { trazoS } from '../trazos'
type State = {
  fase: string
  resultado: string | null
  cargado: boolean
  historia: number
  previas: { posicion: number[]; giroY: number; apoyo: string }[]
  motivo: string | null
  seleccion: string | null
  armado: typeof s.armado
  eventos: { tipo: string }[]
}
type QA = {
  recorridosCable(): number[][][][]
  estado(): State
  proyectar(pos: number[]): { x: number; y: number }
  cargar(nombre: string, rota?: boolean, retirar?: string): Promise<void>
}
declare global {
  interface Window {
    tukiQA: QA
  }
}
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const snapshot = await Promise.race([
    page.evaluate(() => window.tukiQA?.estado()).catch(() => null),
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 5000) }),
  ]).finally(() => clearTimeout(timer))
  if (snapshot) await testInfo.attach('estado-tuki', {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  })
})

const estado = (p: Page) => p.evaluate(() => window.tukiQA.estado())
const punto = (p: Page, pos: number[]) => p.evaluate((v) => window.tukiQA.proyectar(v), pos)
const abrir = async (p: Page) => {
  await p.goto('./?revision')
  await expect(p.getByText('0 de 8 completados')).toBeVisible()
  await expect(p.locator('[data-level="curva"]')).toBeDisabled()
  await p.getByRole('button', { name: 'Jugar La recta', exact: true }).click()
  await expect(p.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
}
async function arrastrar(p: Page, muestras: number[][]) {
  const coords = await p.evaluate((ps) => ps.map((pos) => window.tukiQA.proyectar(pos)), muestras)
  await p.mouse.move(coords[0].x, coords[0].y)
  await p.mouse.down()
  for (const q of coords.slice(1)) await p.mouse.move(q.x, q.y)
  await p.mouse.up()
}
test('recorrido con el mouse, reparación y progreso en una sesión limpia', async ({ page }) => {
  test.slow(true, 'El recorrido encadena dos trazos, cinco simulaciones y navegación con renderizado por software')
  await abrir(page)
  await expect(page.getByText('Desafío 01 / 08')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trazar fila' })).toBeEnabled()
  await page.getByRole('button', { name: 'Vista superior' }).click()
  for (const x of [-.0405, 0, .0405]) {
    await page.getByRole('button', { name: /Dominó.*×/ }).click()
    const p = await punto(page, [x, 0, 0])
    await page.mouse.click(p.x, p.y)
  }
  expect((await estado(page)).armado.saldo.domino).toBe(3)
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('Desafío 02 / 08')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await page.getByRole('button', { name: 'Trazar fila' }).click()
  await arrastrar(page, trazoS)
  let st = await estado(page)
  expect(st.armado.piezas).toHaveLength(8)
  expect(st.armado.saldo.domino).toBe(2)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  expect((await estado(page)).armado.saldo.domino).toBe(10)
  await page.getByRole('button', { name: 'Trazar fila' }).click()
  await arrastrar(page, trazoS)
  st = await estado(page)
  await page.getByRole('button', { name: 'Empujar' }).dblclick()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  expect((await estado(page)).eventos.filter((e) => e.tipo === 'empujon')).toHaveLength(1)
  await page.getByRole('button', { name: 'Cámara lenta' }).click()
  await page.getByRole('button', { name: 'Repetir', exact: true }).click()
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  expect((await estado(page)).armado).toEqual(st.armado)
  const pieza = st.armado.piezas.at(-1)!,
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
  for (const x of [-0.081, 0.081]) {
    await arrastrar(page, [[x, 0, 0], [x, 0, 0.035]])
    await expect(page.getByRole('button', { name:'Retirar' })).toHaveCount(0)
    expect((await estado(page)).historia).toBe(0)
  }
  await page.getByRole('button', { name: /Dominó.*6/ }).click()
  const pos = [0, 0, 0.08],
    point = await punto(page, pos)
  await page.mouse.click(point.x, point.y)
  const antes = await estado(page)
  expect(antes.armado.saldo.domino).toBe(5)
  await arrastrar(page, [pos, [0.23, 0, 0.08]])
  expect((await estado(page)).armado).toEqual(antes.armado)
  const radio = .019
  await arrastrar(page, [[radio, 0, pos[2]], [0, 0, pos[2]+radio]])
  expect((await estado(page)).armado.piezas[0].giroY).not.toBe(antes.armado.piezas[0].giroY)
  await page.getByRole('button', { name:'Retirar' }).click()
  expect((await estado(page)).armado.saldo.domino).toBe(6)
  await page.getByRole('button', { name:'Deshacer' }).click()
  await page.getByRole('button', { name:'Deshacer' }).click()
  await page.mouse.click(point.x,point.y)
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  await page.mouse.move(600,300)
  await page.mouse.down({button:'right'})
  await page.mouse.move(655,285,{steps:4})
  await page.mouse.up({button:'right'})
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
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
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
  await page.getByRole('button', { name: 'Jugar La recta' }).click()
  await expect(page.getByText(/WebGL\s?2/i)).toBeVisible()
})

test('una partida anterior conserva sus accesos y puede abrir la variante al completar la campaña', async ({ page }) => {
  await page.goto('./?revision')
  await page.evaluate(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
    version: 1, completados: ['curva'], audio: false, movimiento: 'reducido',
  })))
  await page.reload()
  await expect(page.getByText('2 de 8 completados')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible()
  await expect(page.locator('[data-level="taza-llave"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Jugar Del libro a la mesa' }).click()
  for (const [montaje, siguiente] of [['rampa', 'Siguiente'], ['taza-fichas', 'Probar la llave']]) {
    await expect(page.getByRole('button', { name: 'Empujar', exact: true })).toBeEnabled()
    await page.evaluate(nombre => window.tukiQA.cargar(nombre), montaje)
    await page.getByRole('button', { name: 'Empujar', exact: true }).click()
    await page.getByRole('button', { name: siguiente, exact: true }).click()
  }
  await expect(page.getByText('Variante de sincronización', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('4 de 8 completados')).toBeVisible()
  await expect(page.locator('[data-level="taza-llave"]')).toBeEnabled()
})

test('victoria y fallo se reconocen en silencio y con movimiento reducido', async ({ page }) => {
  await page.addInitScript(() => {
    const demoras: { inicio: number; creado: number }[] = []
    Object.assign(window, { demorasDeAudio: demoras })
    const creados = new WeakMap<OscillatorNode, number>()
    const crear = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      const ahora = this.currentTime
      const nodo = crear.call(this)
      creados.set(nodo, ahora)
      return nodo
    }
    const start = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when = 0) {
      demoras.push({ inicio: when, creado: creados.get(this)! })
      return start.call(this, when)
    }
  })
  const demoras = () => page.evaluate(() => (window as Window & {
    demorasDeAudio?: { inicio: number; creado: number }[]
  }).demorasDeAudio ?? [])
  await abrir(page)
  await page.evaluate(() => window.tukiQA.cargar('s'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await expect(page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' })).toBeVisible()
  const golpes = await demoras()
  const firma = golpes.filter(g => g.inicio - g.creado > .03)
  expect(firma).toHaveLength(2)
  // The audio device clock may advance one output block while JS constructs the nodes.
  expect(Math.abs(firma[0].inicio - firma[0].creado - .08)).toBeLessThan(.016)
  expect(firma[1].inicio - firma[0].inicio).toBeCloseTo(.08, 6)
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await page.getByLabel('Sonido', { exact: true }).uncheck()
  const vocesAlSilenciar = (await demoras()).length
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
  expect(await demoras()).toHaveLength(vocesAlSilenciar)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Activar sonido' })).toBeVisible()
  await page.getByRole('button', { name: 'Preferencias', exact: true }).click()
  await expect(page.getByLabel('Movimiento de la interfaz')).toHaveValue('reducido')
})

test('el taller guarda una cadena, comparte una copia y respeta premios del destinatario', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  for (const x of [-.0405, 0, .0405]) {
    await page.locator('[data-tool=domino]').click()
    const p = await punto(page, [x, 0, 0]); await page.mouse.click(p.x, p.y)
  }
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.getByRole('button', { name: 'Taller libre' }).click()
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await page.getByLabel('Nombre de la mesa').fill('Mi primera mesa')
  await page.getByRole('button', { name: 'Crear mesa' }).click()
  await expect(page.locator('[data-tool=inicio]')).toBeEnabled()
  await expect(page.locator('[data-tool=puente]')).toBeDisabled()
  const cabe = await page.evaluate(() => {
    const shelf = document.querySelector('.pieces')!
    const right = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().right
    return right('#mesa') <= innerWidth && right('[data-action=empujar]') <= innerWidth && shelf.scrollWidth > shelf.clientWidth
  })
  expect(cabe).toBe(true)
  await expect(page.locator('[data-action=empujar]')).toBeDisabled()
  await page.getByRole('button', { name: 'Vista superior' }).click()
  for (const [t, z] of [['inicio', -.05], ['domino', -.023], ['meta', .005]] as const) {
    await page.locator('[data-tool=' + t + ']').click()
    const p = await punto(page, [0, 0, z]); await page.mouse.click(p.x, p.y)
  }
  const antes = (await estado(page)).armado
  await expect(page.locator('[data-action=empujar]')).toBeEnabled()
  await page.locator('[data-action=empujar]').click()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tuki.progreso.v1')!).completados)).toEqual(['recta'])
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  const descargado = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar mesa' }).click()
  const file = await descargado
  expect(file.suggestedFilename()).toBe('Mi-primera-mesa.tuki.json')
  const path = await file.path()
  await page.reload()
  await page.getByRole('button', { name: 'Taller libre' }).click()
  await page.getByRole('button', { name: 'Abrir mesa' }).click()
  await expect(page.locator('[data-action=empujar]')).toBeEnabled()
  expect((await estado(page)).armado).toEqual(antes)
  await page.getByRole('button', { name: 'Volver a mis mesas' }).click()
  await page.locator('#archivo-mesa').setInputFiles(path!)
  await expect(page.locator('[data-action=empujar]')).toBeEnabled()
  expect((await estado(page)).armado).toEqual(antes)
  await page.getByRole('button', { name: 'Volver a mis mesas' }).click()
  await expect(page.locator('.creation')).toHaveCount(2)
  const ajena = {
    version: 1, perfilFisico: 'mvp-1', nombre: 'Con vasito', piezas: [
      ...antes.piezas, { id: 'vaso', tipo: 'vasito', posicion: [.2, 0, .1], apoyo: 'tablero', giroY: 0 }
    ]
  }
  await page.locator('#archivo-mesa').setInputFiles({ name: 'visita.tuki.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ajena)) })
  await expect(page.getByText('Taller · Solo lectura', { exact: true })).toBeVisible()
  await expect(page.locator('[data-tool]')).toHaveCount(0)
  await page.locator('[data-action=empujar]').click()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  await page.getByRole('button', { name: 'Mis mesas', exact: true }).click()
  await expect(page.locator('.creation').filter({ hasText: 'Con vasito' }).getByRole('button', { name: 'Duplicar' })).toHaveCount(0)
  await page.evaluate(() => window.tukiQA.cargar('s'))
  await page.locator('[data-action=empujar]').click()
  await page.getByRole('button', { name: 'Taller libre' }).click()
  const imported = page.locator('.creation').filter({ hasText: 'Con vasito' })
  await imported.getByRole('button', { name: 'Duplicar' }).click()
  await expect(page.locator('[data-tool=vasito]')).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Copia de Con vasito' })).toBeVisible()
})

test('un fallo de guardado conserva el borrador en memoria y permite exportarlo', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tuki.progreso.v1', JSON.stringify({
      version: 1, completados: ['recta'], audio: false, movimiento: 'reducido',
    }))
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('Almacenamiento bloqueado') } })
  })
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Taller libre' }).click()
  await page.locator('#archivo-mesa').setInputFiles({
    name: 'rota.tuki.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}'),
  })
  await expect(page.locator('#aviso')).toContainText('inválido')
  await expect(page.locator('.creation')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nueva mesa' }).click()
  await page.getByLabel('Nombre de la mesa').fill('Borrador sin disco')
  await page.getByRole('button', { name: 'Crear mesa' }).click()
  await expect(page.locator('[data-tool=inicio]')).toBeEnabled()
  await expect(page.locator('[data-action=empujar]')).toBeDisabled()
  await page.locator('[data-tool=inicio]').click()
  const pos = await punto(page, [0, 0, 0])
  await page.mouse.click(pos.x, pos.y)
  await page.keyboard.press('e')
  expect((await estado(page)).armado.piezas[0].giroY).toBe(15)
  await page.keyboard.press('Shift+q')
  expect((await estado(page)).armado.piezas[0].giroY).toBe(14)
  await page.getByRole('button', { name: 'Volver a mis mesas' }).click()
  await page.getByRole('button', { name: 'Abrir mesa' }).click()
  await expect(page.locator('[data-tool=domino]')).toBeEnabled()
  expect((await estado(page)).armado.piezas).toHaveLength(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar mesa' }).click()
  expect((await download).suggestedFilename()).toBe('Borrador-sin-disco.tuki.json')
})

test('El subibaja abre vacío y se completa después de construir la cadena', async ({ page }) => {
  test.slow(true, 'Dos simulaciones del subibaja hasta el reposo con renderizado por software')
  await page.addInitScript(() => {
    localStorage.setItem('tuki.progreso.v1', JSON.stringify({
      version: 1, completados: ['recta', 'curva', 'libro', 'taza', 'vuelta'], audio: false, movimiento: 'reducido',
    }))
  })
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Jugar El subibaja', exact: true }).click()
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.getByRole('heading', { name: 'Cadena detenida' }).waitFor()
  expect((await estado(page)).armado.piezas).toEqual([])
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await page.evaluate(() => window.tukiQA.cargar('subibaja'))
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
})

for (const [montaje, receptor] of [['vuelta', 's0'], ['puente', 'd1']]) {
  test(montaje + ' permite reparar con el mouse la cadena detenida', async ({ page }) => {
    test.slow(montaje === 'puente', 'Dos pasadas de la mesa articulada con renderizado por software')
    await abrir(page)
    await page.evaluate(nombre => window.tukiQA.cargar(nombre), montaje)
    await page.getByRole('button', { name: 'Vista superior' }).click()
    const pieza = (await estado(page)).armado.piezas.find(p => p.id === receptor)!
    const desvio = [.17, 0, .1]
    await arrastrar(page, [pieza.posicion, desvio])
    const conDesvio = (await estado(page)).armado
    expect(conDesvio.piezas.find(p => p.id === receptor)!.posicion).not.toEqual(pieza.posicion)
    await page.getByRole('button', { name: 'Empujar', exact: true }).click()
    await page.getByRole('heading', { name: /Cadena detenida|Meta alcanzada/ }).waitFor()
    expect((await estado(page)).resultado).toBe('detenida')
    await page.getByRole('button', { name: 'Volver a editar' }).click()
    expect((await estado(page)).armado).toEqual(conDesvio)
    if (montaje === 'puente') await page.getByRole('button',{name:'Deshacer'}).click()
    else await arrastrar(page, [desvio, pieza.posicion])
    await page.getByRole('button', { name: 'Empujar', exact: true }).click()
    await page.waitForFunction(() => window.tukiQA.estado().eventos.some(e => e.tipo === 'victoria'))
  })
}

test('el embudo descarga en la canaleta con ambas patas en la mesa al cambiar de vista', async ({ page }) => {
  await abrir(page)
  const pose = [.07, 0, -.044]
  await page.evaluate(() => window.tukiQA.cargar('taza-mixta', false, 'embudo'))
  for (const vista of ['Vista superior', 'Ver mesa', 'órbita']) {
    if (vista === 'órbita') {
      await page.mouse.move(620, 330)
      await page.mouse.down({ button: 'right' })
      await page.mouse.move(720, 350, { steps: 4 })
      await page.mouse.up({ button: 'right' })
    } else await page.getByRole('button', { name: vista, exact: true }).click()
    await page.locator('[data-tool=embudo]').click()
    const pos = await punto(page, pose)
    await page.mouse.move(pos.x, pos.y)
    const previa = await estado(page)
    expect(previa.motivo).toBeNull()
    expect(previa.previas[0].apoyo).toBe('tablero')
    if (vista === 'órbita') {
      await page.mouse.down({ button: 'right' })
      await page.mouse.move(pos.x + 35, pos.y - 7, { steps: 3 })
      await page.mouse.up({ button: 'right' })
      expect((await estado(page)).previas).toEqual(previa.previas)
    }
    await page.mouse.down()
    await page.mouse.up()
    const embudo = (await estado(page)).armado.piezas.find(p => p.tipo === 'embudo')!
    expect(embudo.apoyo).toBe('tablero')
    expect(embudo.giroY).toBe(90)
    for (let eje = 0; eje < 3; eje++) expect(Math.abs(embudo.posicion[eje] - pose[eje])).toBeLessThan(.001)
    await page.getByRole('button', { name: 'Deshacer' }).click()
  }
})

test('la puerta instalada se puede accionar y conserva el tendido durante la órbita', async ({ page }) => {
  await abrir(page)
  await page.evaluate(() => window.tukiQA.cargar('puerta'))
  await expect(page.locator('[data-action=cable], [data-tool=boton], [data-tool=puerta]')).toHaveCount(0)
  const ruta = await page.evaluate(() => window.tukiQA.recorridosCable())
  expect(ruta[0][0].length).toBeGreaterThan(5)
  for (const x of [785, 525]) {
    await page.mouse.move(650, 330); await page.mouse.down({ button: 'right' })
    await page.mouse.move(x, 360, { steps: 10 }); await page.mouse.up({ button: 'right' })
    expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(ruta)
  }
  await page.getByRole('button', { name: 'Vista superior' }).click()
  await arrastrar(page, [[-.04, .014, -.006], [.02, 0, -.01]])
  expect((await estado(page)).historia).toBe(0)
  await page.getByRole('button', { name: 'Empujar', exact: true }).click()
  await page.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' }).waitFor()
  expect((await estado(page)).eventos.filter(e => e.tipo === 'llave')).toHaveLength(1)
})

test('el Taller mueve una pila con cable y recupera las conexiones al importar', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
    version: 1,
    completados: ['recta', 'curva', 'libro', 'taza', 'taza-llave', 'vuelta', 'subibaja', 'puerta', 'puente'], audio: false, movimiento: 'reducido'
  })))
  await page.goto('./?revision')
  await page.evaluate(() => window.tukiQA.cargar('taller100'))
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const rutas = () => page.evaluate(() => window.tukiQA.recorridosCable())
  const antes = await rutas()
  expect(antes).toHaveLength(4)
  const balance = (await estado(page)).armado
  for (const cantidad of [3, 4]) {
    await page.locator('[data-action=cable]').click()
    for (const pos of [[-.205, .0215, .1902], [.2225, .006, .208]]) {
      const pt = await punto(page, pos); await page.mouse.click(pt.x, pt.y)
    }
    expect((await estado(page)).armado.conexiones).toHaveLength(cantidad)
  }
  const conectadas = await rutas()
  const origen = await punto(page, [-.26, .018, .211]), destino = await punto(page, [-.25, .018, .211])
  await page.mouse.move(origen.x, origen.y)
  await page.mouse.down()
  await page.mouse.move(destino.x, destino.y, { steps: 3 })
  expect(await rutas()).not.toEqual(conectadas)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await rutas()).toEqual(conectadas)
  await arrastrar(page, [[-.26, .018, .211], [-.25, .018, .211]])
  expect((await estado(page)).armado.piezas.find(p => p.id === 'mando')!.posicion).not.toEqual([-.205, .018, .207])
  expect(await rutas()).not.toEqual(conectadas)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  expect((await estado(page)).armado.piezas).toEqual(balance.piezas)
  expect(await rutas()).toEqual(conectadas)
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar mesa' }).click()
  const archivo = await (await descarga).path()
  await page.getByRole('button', { name: 'Volver a mis mesas' }).click()
  await page.locator('#archivo-mesa').setInputFiles(archivo!)
  await expect(page.locator('[data-action=cable]')).toBeEnabled()
  expect((await estado(page)).armado.piezas).toEqual(balance.piezas)
  expect(await rutas()).toEqual(conectadas)
})

test('un cable baja de la pila de libros y rodea la taza desde las dos vistas laterales', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('tuki.progreso.v1', JSON.stringify({
    version: 1,
    completados: ['recta', 'curva', 'libro', 'taza', 'taza-llave', 'vuelta', 'subibaja', 'puerta', 'puente'], audio: false, movimiento: 'reducido'
  })))
  await page.goto('./?revision')
  await page.getByRole('button', { name: 'Taller libre' }).click()
  const pieza = (id: string, tipo: string, posicion: number[], apoyo = 'tablero', giroY = 0) => ({ id, tipo, posicion, apoyo, giroY })
  const mesa = {
    version: 2, perfilFisico: 'mvp-1', nombre: 'Pila y taza', piezas: [
      pieza('inferior', 'libro', [-.042, 0, 0]), pieza('superior', 'libro', [-.042, .018, 0], 'inferior/apoyo'),
      pieza('palanca', 'palanca', [-.038, .036, 0], 'superior/apoyo', 270), pieza('taza', 'taza', [.072, 0, -.006]),
      pieza('puerta', 'puerta', [.157, 0, .003]),
    ], conexiones: [{ mando: 'palanca', receptor: 'puerta' }]
  }
  await page.locator('#archivo-mesa').setInputFiles({ name: 'pila.tuki.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mesa)) })
  await expect(page.locator('[data-action=cable]')).toBeEnabled()
  const ruta = await page.evaluate(() => window.tukiQA.recorridosCable())
  expect(ruta[0][0].some(p => p[1] > .036)).toBe(true)
  expect(ruta[0][0].some(p => p[1] < .002)).toBe(true)
  await page.getByRole('button', { name: 'Vista superior' }).click()
  const canvas = page.locator('canvas#mesa')
  const foto = async (name: string) => {
    const path = testInfo.outputPath(name + '.png')
    await canvas.screenshot({ path })
    await testInfo.attach(name, { path, contentType: 'image/png' })
  }
  await foto('vista-superior')
  await page.getByRole('button', { name: 'Ver mesa', exact: true }).click()
  await page.mouse.move(650, 330); await page.mouse.wheel(0, -215)
  for (const [i, x] of [440, 970].entries()) {
    await page.mouse.move(650, 330); await page.mouse.down({ button: 'right' })
    await page.mouse.move(x, 325, { steps: 24 }); await page.mouse.up({ button: 'right' })
    expect(await page.evaluate(() => window.tukiQA.recorridosCable())).toEqual(ruta)
    await foto('lateral-' + i)
  }
})
