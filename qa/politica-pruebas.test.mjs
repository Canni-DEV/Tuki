import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { crearPlan, leerEnvio } from './politica-pruebas.mjs'
import { archivosCambiados, snapshot } from './revision-local.mjs'
import { validarCertificado, comprobarDist } from './certificado-publicacion.mjs'
import { archivos, huellaArchivos } from './huellas.mjs'
import { comprobarInforme, comprobarUnitarias } from './informes.mjs'

const dir = () => mkdtempSync(path.join(tmpdir(), 'tuki-politica-'))
const git = (root, ...args) => execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
function repo() {
  const root = dir()
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'qa@example.invalid'); git(root, 'config', 'user.name', 'QA')
  // Temporary repos have no Tuki .gitattributes; don't inherit the operator's CRLF conversion.
  git(root, 'config', 'core.autocrlf', 'false')
  writeFileSync(path.join(root, 'README.md'), 'inicio\n')
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base')
  return root
}
const sha = 'a'.repeat(40), cero = '0'.repeat(40)
test('motor siempre conserva toda la suite física; grupos se suman', () => {
  for (const f of ['simulation', 'contactos', 'types', 'shapes', 'geometry', 'construccion', 'dispositivos-simulacion', 'levels', 'runtime']) {
    const p = crearPlan([`src/${f}.ts`, 'src/audio.ts'])
    assert.equal(p.unitariasTodas, true, f)
    assert.ok(p.navegador.some(g => g.archivos.includes('qa/e2e/audio.spec.ts')))
    assert.deepEqual(p.proyectos, ['chromium', 'firefox'])
  }
})
test('documentación no ejecuta físicas ni navegador; editor, persistencia y audio son focalizados', () => {
  const doc = crearPlan(['README.md', 'docs/tecnica/fisica.md', 'AGENTS.md'])
  assert.equal(doc.compilar, false); assert.equal(doc.unitariasTodas, false); assert.equal(doc.navegador.length, 0)
  for (const f of ['editor', 'guardado', 'audio', 'camara']) {
    const p = crearPlan([`src/${f}.ts`])
    assert.equal(p.unitariasTodas, false); assert.equal(p.navegadorTodos, false); assert.ok(p.navegador.length)
  }
})
test('el shader selecciona su regresión unitaria y una herramienta de render no reduce rutas desconocidas', () => {
  const render = crearPlan(['render/fotorealista/src/puntos.ts'])
  assert.ok(render.unitarias.some(g => g.archivos.includes('qa/render-puntos.test.ts')))
  assert.equal(render.unitariasTodas, false)
  const tool = crearPlan(['qa/render/mesas-calidad.mjs'])
  assert.ok(tool.categorias.includes('transversal o sin clasificación'))
  assert.equal(tool.unitariasTodas, true)
  assert.equal(tool.navegadorTodos, true)
  assert.deepEqual(tool.proyectos, ['chromium', 'firefox'])
})
test('nivel conserva normalización completa del nivel y casos sin títulos filtrables', () => {
  const p = crearPlan(['src/data/subibaja.json'])
  assert.equal(p.unitariasTodas, false)
  assert.ok(p.unitarias.some(g => g.filtro === '^(subibaja) ' && g.archivos.length === 4))
  assert.ok(p.unitarias.some(g => !g.filtro && g.archivos.includes('qa/causalidad-balancin.test.ts')))
  assert.ok(p.navegador.some(g => g.filtro === 'El subibaja'))
  const dispositivo = crearPlan(['src/data/disparo.json'])
  assert.ok(dispositivo.unitarias.some(g => !g.filtro && g.archivos.includes('qa/campana-dispositivos.test.ts')))
  assert.ok(dispositivo.unitarias.some(g => g.archivos.includes('qa/disparo.test.ts')))
  assert.ok(dispositivo.navegador.some(g => g.filtro === '^disparo:'))
})
test('fixtures alternativos, regresión y aliases seleccionan el nivel correcto', () => {
  for (const [f, nivel] of [['s-alternativo', 'curva'], ['subibaja-contacto-simultaneo', 'subibaja'], ['bola-temprana', 'taza-llave'], ['puente-tarde', 'puente']]) {
    assert.ok(crearPlan([`qa/fixtures/${f}.json`]).categorias.includes('nivel: ' + nivel))
  }
})
test('rutas o niveles desconocidos, locks y configuración amplían la cobertura', () => {
  for (const f of ['src/nuevo-motor.ts', 'src/data/nuevo.json', 'package-lock.json', 'vite.config.ts', '<archivo eliminado>']) {
    const p = crearPlan([f]); assert.equal(p.unitariasTodas, true, f); assert.equal(p.navegadorTodos, true, f)
  }
})
test('deduplica y no filtra una spec que ya se necesita entera', () => {
  const p = crearPlan(['src/data/subibaja.json', 'qa/e2e/juego.spec.ts', 'qa/e2e/juego.spec.ts'])
  assert.equal(p.archivos.length, 2)
  assert.ok(!p.navegador.some(g => g.filtro === 'El subibaja'))
  const varias = crearPlan(['src/data/subibaja.json', 'qa/fixtures/subibaja-alternativo.json', 'src/data/puente.json'])
  const normalizacion = varias.unitarias.filter(g => g.filtro)
  assert.equal(normalizacion.length, 1)
  assert.equal(normalizacion[0].filtro, '^(puente) |^(subibaja) ')
  assert.equal(varias.navegador.filter(g => g.filtro).length, 1)
})
test('pre-push clasifica por destino remoto y reconoce borrados/tags anotados', () => {
  const envios = leerEnvio(`refs/heads/trabajo ${sha} refs/heads/main ${cero}\nrefs/tags/v1 ${sha} refs/tags/v1 ${cero}\n(delete) ${cero} refs/heads/otra ${sha}`)
  assert.deepEqual(envios.map(e => e.completa), [true, true, false])
  assert.equal(envios[2].borrar, true)
  assert.equal(leerEnvio(`HEAD ${sha} refs/heads/codex/tarea ${cero}`)[0].completa, false)
  assert.equal(leerEnvio(`HEAD ${sha} refs/heads/release/1.1 ${cero}`)[0].completa, true)
  assert.throws(() => leerEnvio('refs/heads/main no-es-sha refs/heads/main ' + cero))
  assert.deepEqual(leerEnvio(''), [])
})
test('diff incluye staged, unstaged, untracked y ambos lados de renombres/borrados', () => {
  const root = repo()
  mkdirSync(path.join(root, 'src')); writeFileSync(path.join(root, 'src', 'simulation.ts'), 'motor')
  git(root, 'add', '.'); git(root, 'commit', '-m', 'motor')
  const base = git(root, 'rev-parse', 'HEAD')
  git(root, 'mv', 'src/simulation.ts', 'src/otro.ts')
  writeFileSync(path.join(root, 'README.md'), 'cambio')
  writeFileSync(path.join(root, 'nuevo.ts'), 'nuevo')
  assert.deepEqual(archivosCambiados(root, { base }).archivos, ['README.md', 'nuevo.ts', 'src/otro.ts', 'src/simulation.ts'])
  assert.throws(() => archivosCambiados(root, { base: 'inexistente' }))
})
test('primer push compara con main y --ref nunca usa cambios sin commit', () => {
  const root = repo(); git(root, 'switch', '-c', 'codex/prueba')
  writeFileSync(path.join(root, 'README.md'), 'rama'); git(root, 'commit', '-am', 'rama')
  writeFileSync(path.join(root, 'sin-commit.ts'), 'pendiente')
  const diff = archivosCambiados(root, { ref: 'HEAD' })
  assert.ok(diff.base); assert.deepEqual(diff.archivos, ['README.md'])
  git(root, 'branch', '-D', 'main')
  assert.equal(archivosCambiados(root, { ref: 'HEAD' }).base, null)
  assert.deepEqual(archivosCambiados(root, { ref: 'HEAD' }).archivos, ['README.md'])
})
test('los logs generados ignorados no amplían la selección de cambios', () => {
  const root = repo()
  writeFileSync(path.join(root, '.gitignore'), '/debug.log\n')
  git(root, 'add', '.'); git(root, 'commit', '-m', 'ignorar log generado')
  writeFileSync(path.join(root, 'debug.log'), 'Chrome diagnóstico')
  assert.deepEqual(archivosCambiados(root, { base: 'HEAD' }).archivos, [])
})
test('extracción real conserva los bytes del commit y no incluye el árbol de trabajo', async () => {
  const root = repo(), commit = git(root, 'rev-parse', 'HEAD')
  writeFileSync(path.join(root, 'README.md'), 'sin confirmar')
  writeFileSync(path.join(root, 'nuevo.txt'), 'nuevo')
  const copia = await snapshot(commit, root)
  const bytesCommit = execFileSync('git', ['show', `${commit}:README.md`], { cwd: root, windowsHide: true })
  assert.deepEqual(readFileSync(path.join(copia, 'README.md')), bytesCommit)
  assert.equal(existsSync(path.join(copia, 'nuevo.txt')), false)
  assert.equal(existsSync(path.join(copia, '.git')), false)
})
test('hook real selecciona runner, SHA exacto, base, deduplicación estricta y propaga fallos', () => {
  const root = repo(), qa = path.join(root, 'qa'); mkdirSync(qa)
  for (const f of ['pre-push.mjs', 'politica-pruebas.mjs', 'revision-local.mjs']) copyFileSync(new URL(f, import.meta.url), path.join(qa, f))
  const fake = "import{appendFileSync}from'node:fs';appendFileSync('ejecuciones.jsonl',JSON.stringify({script:import.meta.filename,args:process.argv.slice(2)})+'\\n');if(process.env.TUKI_TEST_FALLAR==='1')process.exit(7)"
  for (const f of ['verificar-local.mjs', 'verificar-cambios.mjs']) writeFileSync(path.join(qa, f), fake)
  git(root, 'add', '.'); git(root, 'commit', '-m', 'runners')
  const base = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-c', 'codex/prueba'); writeFileSync(path.join(root, 'README.md'), 'rama'); git(root, 'commit', '-am', 'rama')
  const ref = git(root, 'rev-parse', 'HEAD')
  const run = (input, env = {}) => spawnSync(process.execPath, ['qa/pre-push.mjs', 'origin', 'url'], { cwd: root, input, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } })
  let result = run(`HEAD ${ref} refs/heads/codex/prueba ${base}`)
  assert.equal(result.status, 0, result.stderr)
  const leer = () => readFileSync(path.join(root, 'ejecuciones.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(leer()[0].script.endsWith('verificar-cambios.mjs'))
  assert.deepEqual(leer()[0].args, ['--ref', ref, '--base', base])
  result = run(`HEAD ${ref} refs/heads/codex/prueba ${cero}\nHEAD ${ref} refs/heads/main ${base}`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(leer().length, 2); assert.ok(leer()[1].script.endsWith('verificar-local.mjs'))
  git(root, 'tag', '-a', 'v1', '-m', 'tag')
  const tag = git(root, 'rev-parse', 'v1')
  result = run(`refs/tags/v1 ${tag} refs/tags/v1 ${cero}`)
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(leer()[2].args, ['--ref', ref])
  result = run(`HEAD ${ref} refs/heads/codex/prueba ${base}`, { TUKI_TEST_FALLAR: '1' })
  assert.equal(result.status, 7)
  result = run(`(delete) ${cero} refs/heads/codex/prueba ${ref}`)
  assert.equal(result.status, 0); assert.equal(leer().length, 4)
})
function certificado() {
  const etapa = () => ({ expected: 1, unexpected: 0, flaky: 0, skipped: 0, omitidos: [] })
  return { aprobado: true, revision: sha, identidad: 'b'.repeat(64), distSHA256: 'c'.repeat(64), ambiente: { plataforma: 'win32' },
    etapas: { funcional: etapa(), rendimiento: etapa(), calidad: etapa(), aceptacion: { aprobado: true } } }
}
test('publicar exige todas las etapas, revisión exacta y omisiones justificadas', () => {
  assert.ok(validarCertificado(certificado(), sha))
  for (const cambiar of [c => { c.revision = 'd'.repeat(40) }, c => { delete c.etapas.rendimiento }, c => { c.etapas.calidad.flaky = 1 }, c => { c.etapas.funcional.expected = 0 }, c => { c.etapas.aceptacion.aprobado = false }, c => { c.aprobado = false }]) {
    const c = certificado(); cambiar(c); assert.throws(() => validarCertificado(c, sha))
  }
  const c = certificado(); c.etapas.funcional.skipped = 1
  c.etapas.funcional.omitidos = [{ proyecto: 'firefox', anotaciones: [{ description: 'CDP no disponible' }] }]
  assert.ok(validarCertificado(c, sha))
  c.etapas.funcional.omitidos[0].proyecto = 'chromium'; assert.throws(() => validarCertificado(c, sha))
})
test('publicar rechaza un dist alterado aunque la constancia esté aprobada', async () => {
  const root = dir(); writeFileSync(path.join(root, 'index.html'), 'verificado')
  const c = certificado(); c.distSHA256 = await huellaArchivos(await archivos(root), root)
  await comprobarDist(c, sha, root)
  writeFileSync(path.join(root, 'index.html'), 'otro')
  await assert.rejects(comprobarDist(c, sha, root))
})
test('workflow no publica en push/PR y coteja la compilación antes de subirla', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch'"))
  assert.ok(!workflow.includes("github.event_name != 'pull_request'\n        with:\n          path: dist"))
  assert.ok(workflow.indexOf('await comprobarDist') < workflow.indexOf('actions/upload-pages-artifact'))
  assert.ok(workflow.includes("process.env.REVISION_VERIFICADA !== process.env.GITHUB_SHA"))
})
test('CI conserva los controles anteriores sin instalar ni ejecutar navegadores', () => {
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
  const comandos = [...workflow.matchAll(/^      - run: (.+)$/gm)].map(m => m[1].trim())
  assert.deepEqual(comandos, ['npm ci', 'npm run typecheck', 'npm run render:typecheck',
    'node art/verify_models.mjs', 'npm run test:run', 'npm run build -- --base="/$REPO_NAME/"'])
  assert.doesNotMatch(workflow, /playwright|verify:changes|verify:local|test:e2e|qa\/windows\/aceptacion/)
  assert.doesNotMatch(workflow, /fetch-depth: 0/)
})
test('todas las rutas explícitas del selector existen', () => {
  const p = crearPlan(['src/editor.ts', 'src/guardado.ts', 'src/audio.ts', 'src/camara.ts', 'src/fondo.ts', 'src/data/subibaja.json', 'src/data/disparo.json'])
  for (const g of [...p.unitarias, ...p.navegador]) for (const f of g.archivos) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f)
})
test('rechaza selección unitaria vacía e informes con fallos', async () => {
  const file = path.join(dir(), 'informe.json')
  for (const report of [{ success: true, numPassedTests: 0, numFailedTests: 0 }, { success: false, numPassedTests: 2, numFailedTests: 1 }]) {
    writeFileSync(file, JSON.stringify(report)); await assert.rejects(comprobarUnitarias(file))
  }
  writeFileSync(file, JSON.stringify({ success: true, numPassedTests: 2, numFailedTests: 0 }))
  await comprobarUnitarias(file)
})
test('navegador conserva solo las omisiones táctiles justificadas de Firefox', async () => {
  const file = path.join(dir(), 'informe.json')
  const report = { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 1 }, suites: [{ specs: [{ title: 'táctil', tests: [
    { status: 'skipped', projectName: 'firefox', annotations: [{ description: 'transporte táctil no disponible' }] },
  ] }] }] }
  writeFileSync(file, JSON.stringify(report)); await comprobarInforme(file, true)
  await assert.rejects(comprobarInforme(file))
  report.suites[0].specs[0].tests[0].annotations = []
  writeFileSync(file, JSON.stringify(report)); await assert.rejects(comprobarInforme(file, true))
  report.stats.expected = 0
  writeFileSync(file, JSON.stringify(report)); await assert.rejects(comprobarInforme(file, true))
})
