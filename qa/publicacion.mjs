import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const url = new URL(process.argv[2] ?? 'https://canni-dev.github.io/Tuki/')
if (!url.pathname.endsWith('/')) url.pathname += '/'
const navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
try {
  const pagina = await navegador.newPage({ viewport: { width: 1366, height: 768 } })
  const errores = []
  pagina.on('pageerror', e => errores.push(e.message))
  const rutas = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter(e => e.isFile())
    .map(e => path.relative(dist, path.join(e.parentPath, e.name)).replaceAll(path.sep, '/'))
    .sort()
  const types = { '.html': /text\/html/, '.js': /(?:java|ecma)script/, '.woff2': /woff2|octet-stream/, '.glb': /gltf-binary|octet-stream/ }
  const digest = createHash('sha256')
  for (const ruta of rutas) {
    const asset = await pagina.request.get(new URL(ruta, url).href)
    assert.equal(asset.status(), 200, ruta)
    const tipo = types[path.extname(ruta)]
    if (tipo) assert.match(asset.headers()['content-type'], tipo, ruta)
    const body = await asset.body()
    assert.ok(body.equals(await readFile(path.join(dist, ruta))), 'Difiere el archivo publicado: ' + ruta)
    digest.update(ruta + '\n').update(body)
    await asset.dispose()
  }
  await pagina.goto(url.href)
  await pagina.reload()
  await pagina.getByRole('button', { name: 'Jugar La curva' }).click()
  const empujar = pagina.getByRole('button', { name: 'Empujar', exact: true })
  await pagina.waitForFunction(() => document.querySelector('[data-action=empujar]')?.disabled === false)
  await pagina.getByRole('button', { name: 'Vista superior' }).click()
  await pagina.getByRole('button', { name: 'Trazar fila' }).click()
  // The opening orthographic camera in top view maps screen height linearly to metres.
  const nivel = JSON.parse(await readFile(path.join(root, 'src/data/curva.json'), 'utf8'))
  const fixture = JSON.parse(await readFile(path.join(root, 'qa/fixtures/s.json'), 'utf8'))
  const mesa = await pagina.locator('canvas').boundingBox()
  const [cx,,cz] = nivel.camara.objetivo
  const k = mesa.height / nivel.camara.altoVisible
  const camino = fixture.armado.piezas.map(p => p.posicion)
  const fin = camino.at(-1)
  camino.push([fin[0]+.010, 0, fin[2]-.005])
  for (const [i, [x,,z]] of camino.entries()) {
    await pagina.mouse.move(mesa.x + mesa.width/2 + (x-cx)*k, mesa.y + mesa.height/2 + (z-cz)*k, { steps:i?3:1 })
    if (i === 0) await pagina.mouse.down()
  }
  await pagina.mouse.up()
  await empujar.click()
  const victoria = pagina.getByRole('heading', { name: '¡Tuki! · Meta alcanzada' })
  await victoria.waitFor()
  await pagina.getByRole('button', { name:'Repetir', exact:true }).click()
  await victoria.waitFor()
  await pagina.getByRole('button', { name:'Volver a editar' }).click()
  await pagina.getByRole('button', { name:'Volver a desafíos' }).click()
  await pagina.getByRole('button', { name:'Jugar Del libro a la mesa' }).click()
  await pagina.waitForFunction(() => document.querySelector('[data-action=empujar]')?.disabled === false)
  assert.deepEqual(errores, [])
  console.log(JSON.stringify({
    url:url.href, archivosIdenticos:rutas.length, sha256:digest.digest('hex'),
    navegador:navegador.version(), recorrido:'Perfil limpio → recarga → S trazada con mouse → victoria → repetición → editor → libro desbloqueado',
    fecha:new Date().toISOString()
  }, null, 2))
} finally {
  await navegador.close()
}
