import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, mkdtemp, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { archivos, huellaArchivos } from './huellas.mjs'
import { pathToFileURL } from 'node:url'

const origen = path.resolve(import.meta.dirname, '..')
const local = path.join(origen, '.qa-local')
const argumento = nombre => { const i = process.argv.indexOf(nombre); return i < 0 ? undefined : process.argv[i + 1] }
const force = process.argv.includes('--force')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: origen, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
const base = '/Tuki/'
let root = origen

async function ejecutar(executable, args, env = {}) {
  const hijo = spawn(executable, args, { cwd: root, windowsHide: true, env: { ...process.env, ...env }, stdio: 'inherit' })
  const [code, signal] = await once(hijo, 'exit')
  if (code !== 0) throw new Error(`${path.basename(executable)} ${args.join(' ')} terminó con ${code ?? signal}.`)
}

async function entradas() {
  // Include ignored runtime inputs such as .env files, too. Only generated outputs,
  // installed dependencies (hashed separately) and local administration are excluded.
  return huellaArchivos(await archivos(root, new Set(['.git', '.agents', '.codex', 'node_modules', '.qa-local', 'dist', 'test-results', 'playwright-report'])), root)
}
async function snapshot(ref) {
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`).toString('utf8').trim()
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Revisión Git inválida.')
  await mkdir(path.join(local, 'revisiones'), { recursive: true })
  const destino = await mkdtemp(path.join(local, 'revisiones', commit.slice(0, 12) + '-'))
  const archivo = path.join(destino, 'fuentes.tar')
  git('archive', '--format=tar', `--output=${archivo}`, commit)
  // Git for Windows can resolve GNU tar, which treats a drive prefix as a remote host.
  execFileSync('tar', ['-xf', 'fuentes.tar'], { cwd: destino, windowsHide: true })
  // Keep the archive outside the source fingerprint.
  const { unlink } = await import('node:fs/promises'); await unlink(archivo)
  const igual = sha(await readFile(path.join(destino, 'package-lock.json'))) === sha(await readFile(path.join(origen, 'package-lock.json')))
  if (igual) await symlink(path.join(origen, 'node_modules'), path.join(destino, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  else {
    const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (!existsSync(npm)) throw new Error('No se encontró npm junto a Node para preparar la revisión aislada.')
    const anterior = root; root = destino
    try { await ejecutar(process.execPath, [npm, 'ci']) } finally { root = anterior }
  }
  return destino
}

async function entorno(require) {
  const { chromium, firefox } = require('@playwright/test')
  const program = process.env.ProgramFiles ?? 'C:/Program Files'
  const chrome = process.env.TUKI_CHROME ?? path.join(program, 'Google/Chrome/Application/chrome.exe')
  const firefoxReal = process.env.TUKI_FIREFOX ?? path.join(program, 'Mozilla Firefox/firefox.exe')
  const navegadores = [chromium.executablePath(), firefox.executablePath(), chrome, firefoxReal]
  const binarios = []
  for (const file of navegadores) {
    if (!existsSync(file)) throw new Error(`Falta el navegador ${file}. Instalá Chromium y Firefox de Playwright y Chrome/Firefox de escritorio.`)
    const dlls = (await archivos(path.dirname(file))).filter(f => ['xul.dll', 'chrome.dll'].includes(path.basename(f)))
    binarios.push({ file, sha256: await huellaArchivos([file, ...dlls], path.dirname(file)) })
  }
  if (process.platform !== 'win32') throw new Error('La aceptación gráfica completa requiere el equipo Windows de aceptación; no se emitirá una constancia parcial.')
  const equipo = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    '$o=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{sistema=$o.Caption;compilacion=$o.BuildNumber;cpu=(Get-CimInstance Win32_Processor).Name;adaptadores=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)} | ConvertTo-Json -Compress'], { windowsHide: true, encoding: 'utf8' }))
  const energia = execFileSync('powercfg', ['/getactivescheme'], { windowsHide: true, encoding: 'utf8' }).trim()
  return { node: process.version, plataforma: process.platform, arquitectura: process.arch, memoria: os.totalmem(), equipo, energia, binarios,
    configuracion: { viewport: [1366, 768], base, dpr: 1 },
    variables: Object.fromEntries(['TUKI_CHROME', 'TUKI_FIREFOX', 'PLAYWRIGHT_BROWSERS_PATH', 'CI', 'NODE_OPTIONS', 'TZ', 'LANG', 'LC_ALL'].map(k => [k, process.env[k] ?? ''])) }
}

async function comprobarInforme(file, permitirTactil = false) {
  const report = JSON.parse(await readFile(file, 'utf8'))
  if (report.errors?.length || report.stats.unexpected || !report.stats.expected) throw new Error('El informe de navegador no está aprobado: ' + file)
  const omitidos = []
  const recorrer = suites => { for (const suite of suites) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) if (test.status === 'skipped') omitidos.push({ titulo: spec.title, proyecto: test.projectName, anotaciones: test.annotations })
    recorrer(suite.suites ?? [])
  } }
  recorrer(report.suites)
  if (omitidos.some(t => !permitirTactil || t.proyecto !== 'firefox' || !t.anotaciones?.some(a => /CDP|multipuntero|transporte táctil/.test(a.description ?? ''))))
    throw new Error('Hay pruebas omitidas sin una limitación explícita de automatización: ' + JSON.stringify(omitidos))
  return { ...report.stats, omitidos }
}

async function verificar() {
  await mkdir(local, { recursive: true })
  const ref = argumento('--ref')
  if (ref) root = await snapshot(ref)
  const version = (await readFile(path.join(root, '.node-version'), 'utf8')).trim()
  if (process.versions.node !== version) throw new Error(`Usá Node ${version}; se encontró ${process.versions.node}.`)
  const require = createRequire(path.join(root, 'package.json'))
  const codigo = await entradas()
  const herramientas = await huellaArchivos(await archivos(path.join(root, 'node_modules'), new Set(['.cache', '.vite', '.vite-temp'])), path.join(root, 'node_modules'))
  const ambiente = await entorno(require)
  const verificador = await huellaArchivos([import.meta.filename, path.join(import.meta.dirname, 'huellas.mjs')], origen)
  const identidad = sha(JSON.stringify({ codigo, herramientas, ambiente, verificador }))
  const constancias = path.join(local, 'verificaciones'); await mkdir(constancias, { recursive: true })
  const archivo = path.join(constancias, identidad + '.json')
  if (!force && existsSync(archivo)) {
    const previa = JSON.parse(await readFile(archivo, 'utf8'))
    if (previa.aprobado && previa.identidad === identidad) {
      const dist = path.join(root, 'dist')
      if (!existsSync(dist) || await huellaArchivos(await archivos(dist), dist) !== previa.distSHA256) {
        const { build } = await import(pathToFileURL(require.resolve('vite')).href)
        await build({ root, base, logLevel: 'warn' })
        if (await huellaArchivos(await archivos(dist), dist) !== previa.distSHA256) throw new Error('La compilación reproducida difiere de la verificada. Ejecutá verify:local -- --force.')
      }
      console.log(`Verificación completa reutilizada: ${archivo}`)
      return
    }
  }
  const salida = path.join(local, 'resultados', identidad); await mkdir(salida, { recursive: true })
  const inicio = Date.now(), tiempos = {}, etapas = {}
  const etapa = async (nombre, fn) => { console.log(`\n${nombre}`); const t = Date.now(); const valor = await fn(); tiempos[nombre] = Date.now() - t; return valor }
  await etapa('Tipos', () => ejecutar(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit']))
  await etapa('Modelos', () => ejecutar(process.execPath, ['art/verify_models.mjs']))
  await etapa('Pruebas unitarias y físicas', () => ejecutar(process.execPath, [path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'), 'run']))
  const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  await etapa('Compilación', () => build({ root, base, logLevel: 'warn' }))
  const dist = path.join(root, 'dist'), distSHA256 = await huellaArchivos(await archivos(dist), dist)
  const servidor = await preview({ root, base, preview: { host: '127.0.0.1', port: 0, open: false }, logLevel: 'error' })
  try {
    const url = `http://127.0.0.1:${servidor.httpServer.address().port}${base}`
    await etapa('Recursos y recorrido servido', () => ejecutar(process.execPath, ['qa/publicacion.mjs', url]))
    const cli = require.resolve('@playwright/test/cli')
    const funcional = path.join(salida, 'e2e.json'), rendimiento = path.join(salida, 'rendimiento.json')
    await etapa('E2E Chromium y Firefox', () => ejecutar(process.execPath, [cli, 'test', '--workers=2', '--project=chromium', '--project=firefox', '--grep-invert', 'rendimiento real'],
      { TUKI_BASE_URL: url, TUKI_QA_INFORME: funcional, TUKI_FIREFOX_EMPAQUETADO: '1', TUKI_PERF: '0', TUKI_HEADED: '0' }))
    etapas.funcional = await comprobarInforme(funcional, true)
    await etapa('Rendimiento con GPU real', () => ejecutar(process.execPath, [cli, 'test', '--project=chromium', '--project=firefox', '--grep', 'rendimiento real'],
      { TUKI_BASE_URL: url, TUKI_QA_INFORME: rendimiento, TUKI_PERF: '1', TUKI_HEADED: '1', TUKI_FIREFOX_EMPAQUETADO: '0' }))
    etapas.rendimiento = await comprobarInforme(rendimiento)
    await etapa('Aceptación Windows', () => ejecutar(process.execPath, ['qa/windows/aceptacion.mjs'], { TUKI_QA_URL: url, TUKI_QA_DIR: salida }))
    const aceptacion = JSON.parse(await readFile(path.join(salida, 'aceptacion-windows.json'), 'utf8'))
    if (!aceptacion.aceptado || aceptacion.distSHA256 !== distSHA256) throw new Error('La aceptación Windows no corresponde a esta compilación.')
    etapas.aceptacion = { aprobado: true, archivo: path.join(salida, 'aceptacion-windows.json') }
  } finally { await servidor.close() }
  if (codigo !== await entradas()) throw new Error('Las fuentes cambiaron durante las pruebas. No se certifica este estado.')
  if (distSHA256 !== await huellaArchivos(await archivos(dist), dist)) throw new Error('La compilación cambió durante las pruebas.')
  const herramientasFinales = await huellaArchivos(await archivos(path.join(root, 'node_modules'), new Set(['.cache', '.vite', '.vite-temp'])), path.join(root, 'node_modules'))
  if (herramientas !== herramientasFinales || JSON.stringify(ambiente) !== JSON.stringify(await entorno(require))) throw new Error('El entorno cambió durante las pruebas.')
  const informe = { aprobado: true, identidad, codigo, herramientas, ambiente, verificador, distSHA256, etapas, tiempos, duracionMs: Date.now() - inicio, fecha: new Date().toISOString() }
  await writeFile(archivo, JSON.stringify(informe, null, 2) + '\n')
  console.log(`\nVerificación local completa aprobada: ${archivo}`)
}

verificar().catch(error => { console.error(error); process.exitCode = 1 })
