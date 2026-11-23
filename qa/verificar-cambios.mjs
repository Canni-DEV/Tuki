import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { crearPlan, omitirGPU } from './politica-pruebas.mjs'
import { origen, archivosCambiados, ejecutar, snapshot } from './revision-local.mjs'
import { comprobarInforme, comprobarUnitarias } from './informes.mjs'

async function verificar() {
  const opciones = {}, extras = []
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--plan') opciones.plan = true
    else if (['--base', '--ref', '--e2e'].includes(arg) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
      const valor = process.argv[++i]
      if (arg === '--e2e') extras.push(valor)
      else opciones[arg.slice(2)] = valor
    } else throw new Error(`Argumento inválido: ${arg}. Usá --plan, --base REF, --ref REF o --e2e qa/e2e/archivo.spec.ts.`)
  }
  const cambio = archivosCambiados(origen, opciones)
  const root = opciones.ref && !opciones.plan ? await snapshot(opciones.ref) : origen
  const p = crearPlan(cambio.archivos)
  // Deleted tests/helpers need broader coverage, never a successful empty selection.
  const eliminados = opciones.ref
    ? [] // git show is checked below, also in --plan mode.
    : cambio.archivos.filter(f => !existsSync(path.join(root, f)))
  if (opciones.ref) {
    const { gitEn } = await import('./revision-local.mjs')
    const presentes = new Set(gitEn(origen, 'ls-tree', '-r', '--name-only', '-z', cambio.revision).split('\0'))
    eliminados.push(...cambio.archivos.filter(f => !presentes.has(f)))
  }
  if (eliminados.length) {
    Object.assign(p, crearPlan([...cambio.archivos, '<archivo eliminado>']))
    p.archivos = cambio.archivos
  }
  for (const f of extras) {
    if (!/^qa\/e2e\/[\w-]+\.spec\.ts$/.test(f) || !existsSync(path.join(root, f))) throw new Error('Prueba adicional inválida: ' + f)
    if (!p.navegadorTodos && !p.navegador.some(g => !g.filtro && g.archivos.includes(f))) p.navegador.push({ archivos: [f] })
    p.compilar = p.tipos = true
    p.proyectos = ['chromium', 'firefox']
  }
  const plan = { ...cambio, ...p, eliminados }
  console.log(JSON.stringify(plan, null, 2))
  if (opciones.plan || !cambio.archivos.length && !extras.length) return
  const version = (await readFile(path.join(root, '.node-version'), 'utf8')).trim()
  if (process.versions.node !== version) throw new Error(`Usá Node ${version}; se encontró ${process.versions.node}.`)
  const require = createRequire(path.join(root, 'package.json'))
  const salida = path.join(origen, '.qa-local', 'cambios', `${Date.now()}-${process.pid}`)
  await mkdir(salida, { recursive: true })
  const run = (args, env) => ejecutar(root, process.execPath, args, env)
  const inicio = Date.now(), tiempos = {}
  const etapa = async (nombre, fn) => { console.log('\n' + nombre); const t = Date.now(); await fn(); tiempos[nombre] = Date.now() - t }
  if (p.politica) await etapa('Política de pruebas', () => run(['--test', 'qa/politica-pruebas.test.mjs']))
  if (p.tipos) await etapa('Tipos', () => run([require.resolve('typescript/bin/tsc'), '--noEmit']))
  if (p.tiposRender) await etapa('Tipos del render', () => run([require.resolve('typescript/bin/tsc'), '--noEmit', '-p', 'render/fotorealista/tsconfig.json']))
  if (p.modelos) await etapa('Modelos', () => run(['art/verify_models.mjs']))
  const vitest = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  if (p.unitariasTodas) await etapa('Toda la suite unitaria y física', () => run([vitest, 'run']))
  else for (const [i, grupo] of p.unitarias.entries()) {
    const informe = path.join(salida, `unitarias-${i}.json`)
    await etapa(`Unitarias ${i + 1}`, () => run([vitest, 'run', ...grupo.archivos, ...(grupo.filtro ? ['-t', grupo.filtro] : []), '--reporter=default', '--reporter=json', '--outputFile=' + informe]))
    await comprobarUnitarias(informe)
  }
  if (p.compilar) {
    const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
    const base = '/Tuki/'
    await etapa('Compilación', () => build({ root, base, logLevel: 'warn' }))
    if (p.navegadorTodos || p.navegador.length) {
      const server = await preview({ root, base, preview: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
      try {
        const url = `http://127.0.0.1:${server.httpServer.address().port}${base}`
        const grupos = p.navegadorTodos ? [{ archivos: [] }] : p.navegador
        for (const [i, grupo] of grupos.entries()) {
          const informe = path.join(salida, `e2e-${i}.json`)
          await etapa(`Navegador ${i + 1}`, () => run([require.resolve('@playwright/test/cli'), 'test', ...grupo.archivos,
            ...p.proyectos.map(x => '--project=' + x), '--workers=2', '--grep-invert', omitirGPU,
            ...(grupo.filtro ? ['--grep', grupo.filtro] : [])],
          { TUKI_BASE_URL: url, TUKI_FIREFOX_EMPAQUETADO: '1', TUKI_QA_INFORME: informe, TUKI_PERF: '0', TUKI_HEADED: '0', CHROME_LOG_FILE: path.join(salida, 'chrome-debug.log') }))
          await comprobarInforme(informe, true)
        }
      } finally { await server.close() }
    }
  }
  const informe = path.join(salida, 'seleccion.json')
  await writeFile(informe, JSON.stringify({ aprobado: true, alcance: 'selectivo; no habilita publicación', plan, tiempos, duracionMs: Date.now() - inicio }, null, 2) + '\n')
  console.log(`\nPruebas seleccionadas aprobadas (${((Date.now() - inicio) / 1000).toFixed(1)} s): ${informe}`)
}
verificar().catch(error => { console.error(error); process.exitCode = 1 })
