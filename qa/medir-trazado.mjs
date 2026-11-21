import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '..')
const i = process.argv.indexOf('--base')
if (i < 0 || !process.argv[i + 1]) throw new Error('Indicá --base con la extracción del código anterior.')
const resultados = [], servidores = []
try {
  const implementaciones = []
  for (const directorio of [path.resolve(process.argv[i + 1]), root]) {
    const servidor = await createServer({ root: directorio, configFile: false, server: { middlewareMode: true, hmr: { port: 0 } }, logLevel: 'error' })
    servidores.push(servidor)
    const { Editor } = await servidor.ssrLoadModule('/src/editor.ts')
    const { baseMesa } = await servidor.ssrLoadModule('/src/mesas.ts')
    await (await servidor.ssrLoadModule('/src/simulation.ts')).initPhysics()
    implementaciones.push({ Editor, baseMesa })
  }
  for (const total of [100, 150]) {
    const muestras = Array.from({ length: 250 }, (_, k) => [-.36 + .72 * k / 249, 0, .10 + .055 * Math.sin(k / 249 * Math.PI * 2)])
    const piezas = Array.from({ length: total }, (_, k) => ({ id: 'obstaculo-' + k, tipo: 'domino', apoyo: 'tablero', giroY: 0,
      posicion: [-.39 + (k % 30) * .026, 0, -.23 + Math.floor(k / 30) * .018] }))
    const editores = implementaciones.map(({ Editor, baseMesa }) => {
      const e = new Editor(baseMesa('Banco de trazo'))
      e.armado = { ...e.armado, piezas: structuredClone(piezas), saldo: { ...e.armado.saldo, domino: 200 - total } }
      return e
    })
    for (let prefijo = 2; prefijo <= muestras.length; prefijo += 8)
      assert.deepStrictEqual(editores[1].trazar(muestras.slice(0, prefijo), 'tablero'), editores[0].trazar(muestras.slice(0, prefijo), 'tablero'))
    const esperado = editores[0].trazar(muestras, 'tablero')
    assert.deepStrictEqual(editores[1].trazar(muestras, 'tablero'), esperado)
    for (const e of editores) for (let warm = 0; warm < 5; warm++) e.trazar(muestras, 'tablero')
    const medidas = [[], []]
    for (let repeticion = 0; repeticion < 30; repeticion++) for (const indice of repeticion % 2 ? [1, 0] : [0, 1]) {
      const t = performance.now(); editores[indice].trazar(muestras, 'tablero'); medidas[indice].push(performance.now() - t)
    }
    const mediana = ms => { const lista = ms.toSorted((a, b) => a - b); return (lista[14] + lista[15]) / 2 }
    resultados.push({ objetos: total, muestras: muestras.length, fichas: esperado.piezas.length,
      posicionesIdenticas: true, anteriorMs: mediana(medidas[0]), actualMs: mediana(medidas[1]), medidas })
  }
  const informe = { fecha: new Date().toISOString(), node: process.version, metodo: '30 pasadas alternadas, 5 de calentamiento, mismo trazo curvo y prefijos aceptados; tiempo de CPU, no FPS', resultados }
  await mkdir(path.join(root, '.qa-local'), { recursive: true })
  await writeFile(path.join(root, '.qa-local/trazado.json'), JSON.stringify(informe, null, 2) + '\n')
  console.log(JSON.stringify(informe, null, 2))
} catch (error) { console.error(error.stack); process.exitCode = 1 } finally { for (const servidor of servidores) await servidor.close() }
