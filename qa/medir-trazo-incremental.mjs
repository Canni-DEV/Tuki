import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const refIndex = process.argv.indexOf('--ref'), ref = refIndex < 0 ? undefined : process.argv[refIndex + 1]
if (refIndex >= 0 && !ref) throw new Error('Falta la revisión después de --ref')
const revision = ref && execFileSync('git', ['rev-parse', '--verify', ref + '^{commit}'], { cwd: root, windowsHide: true, encoding: 'utf8' }).trim()
const anterior = revision && execFileSync('git', ['show', revision + ':src/editor.ts'], { cwd: root, windowsHide: true, encoding: 'utf8' })
const virtual = path.join(root, 'src', 'editor-comparacion.ts').replaceAll('\\', '/')
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false },
  plugins: [{ name: 'editor-de-comparacion', resolveId(id) { if (id === '/editor-comparacion') return virtual }, load(id) { if (id === virtual) return anterior } }],
})
const resumen = valores => {
  const ms = valores.toSorted((a, b) => a - b)
  return { medianaMs: ms[Math.floor(ms.length / 2)], p95Ms: ms[Math.floor(ms.length * .95)], maxMs: ms.at(-1) }
}
try {
  const { Editor } = await server.ssrLoadModule('/src/editor.ts')
  const { baseMesa } = await server.ssrLoadModule('/src/mesas.ts')
  const Comparacion = anterior ? (await server.ssrLoadModule('/editor-comparacion')).Editor : Editor
  await (await server.ssrLoadModule('/src/simulation.ts')).initPhysics()
  const resultados = []
  for (const objetos of [0, 100, 150, 190]) for (const curva of [false, true]) {
    const crear = C => {
      const e = new C(baseMesa('Banco incremental'))
      e.armado = { ...e.armado, piezas: Array.from({ length: objetos }, (_, k) => ({ id: 'obstaculo-' + k,
        tipo: 'domino', apoyo: 'tablero', giroY: 0, posicion: [-.39 + k % 30 * .026, 0, -.23 + Math.floor(k / 30) * .018] })),
      saldo: { ...e.armado.saldo, domino: 200 - objetos } }
      return e
    }
    const muestras = Array.from({ length: 250 }, (_, k) => [-.36 + .72 * k / 249, 0, .10 + (curva ? .055 * Math.sin(k / 249 * Math.PI * 2) : 0)])
    const e = crear(Editor), antes = crear(Comparacion), comparacion = [], actualizaciones = [], gestos = []
    const cold = performance.now(), sesion = e.iniciarTrazo('tablero')
    const preparacionMs = performance.now() - cold
    for (let k = 2; k <= muestras.length; k++) {
      const puntos = muestras.slice(0, k), t = performance.now(), esperado = antes.trazar(puntos, 'tablero')
      comparacion.push(performance.now() - t)
      const actual = sesion.evaluar(puntos)
      assert.deepStrictEqual(actual.piezas, esperado.piezas)
      assert.equal(actual.error, esperado.error)
    }
    for (let r = -5; r < 30; r++) {
      const trazo = e.iniciarTrazo('tablero'), inicio = performance.now()
      for (let k = 2; k <= muestras.length; k++) {
        const puntos = muestras.slice(0, k), t = performance.now()
        trazo.evaluar(puntos)
        if (r >= 0) actualizaciones.push(performance.now() - t)
      }
      if (r >= 0) gestos.push(performance.now() - inicio)
    }
    const resultado = { objetos, curva, muestras: muestras.length, preparacionMs, geometriaIdentica: true,
      comparacionCompleta: resumen(comparacion), incremental: resumen(actualizaciones), gestoCompleto: resumen(gestos) }
    resultados.push(resultado)
    console.log(JSON.stringify(resultado))
    assert.ok(resultado.incremental.p95Ms <= 8, 'El p95 de cálculo supera 8 ms')
    assert.ok(resultado.incremental.maxMs < 50, 'Una actualización supera 50 ms')
  }
  const informe = { fecha: new Date().toISOString(), revisionComparada: revision ?? 'cálculo completo actual', node: process.version,
    sistema: os.version(), cpu: os.cpus()[0].model, metodo: 'CPU sin navegador: 30 gestos, 5 de calentamiento; 249 actualizaciones por gesto. No mide FPS ni latencia visual.', resultados }
  await mkdir(path.join(root, '.qa-local'), { recursive: true })
  await writeFile(path.join(root, '.qa-local', 'trazado-incremental.json'), JSON.stringify(informe, null, 2) + '\n')
} finally { await server.close() }
