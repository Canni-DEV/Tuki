import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { preview } from 'vite'
import { openBrowser } from './browsers.mjs'
import { resumen } from './resumen.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'dist')
const setup = process.argv.includes('--smoke')
const expansion = process.argv.includes('--ampliacion')
const output = process.env.TUKI_QA_DIR || (setup ? path.join(os.tmpdir(),'tuki-piloto-windows') : path.join(root, 'docs/qa'))
const names = ['recta','puerta','s','rampa','taza-fichas','taza-mixta','llave-abierta','bola-temprana','vuelta','subibaja','puente','puente-tarde','taller100']
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function buildHash(dir = dist, digest = createHash('sha256'), servedAt) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const target = path.join(dir, entry.name)
    if (entry.isDirectory()) await buildHash(target, digest, servedAt)
    else {
      const relative = path.relative(dist,target).replaceAll('\\','/')
      const bytes = await readFile(target)
      if (servedAt) {
        const res = await fetch(new URL(relative, servedAt))
        if (!res.ok || !bytes.equals(Buffer.from(await res.arrayBuffer()))) throw new Error('El servidor no entrega el archivo de dist: ' + relative)
      }
      digest.update(relative + '\n').update(bytes)
    }
  }
  return digest
}

function hardware() {
  const command = [
    '$o=Get-CimInstance Win32_OperatingSystem',
    '[pscustomobject]@{sistema=$o.Caption;compilacion=$o.BuildNumber;cpu=(Get-CimInstance Win32_Processor).Name;adaptadores=@(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)} | ConvertTo-Json -Compress',
  ].join(';')
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile','-Command',command], {encoding:'utf8',windowsHide:true}))
}

/** Reachable devices use causal activation. Fixed guides use the ball's first impact. */
function trace(fixture, events) {
  const targets = new Set(fixture.grupos.flat())
  const activated = new Map()
  const balls = fixture.armado.piezas.filter(p => p.tipo === 'bolita').map(p=>p.id)
  for (const e of events) {
    let id
    if (e.tipo === 'empujon') id = e.a
    else if (e.tipo === 'activo') id = e.b
    else if (e.tipo === 'impacto') {
      const ball=balls.find(b=>(b===e.a||b===e.b) && activated.has(b))
      const other=e.a===ball?e.b:e.a
      const guia = fixture.armado.piezas.find(p => p.id === other)
      if (ball && (['rampa','embudo','canal','curva90'].includes(guia?.tipo) ||
        ['slider','diverter','tray'].includes(other.split('/')[1]))) id = other
    }
    if (targets.has(id) && !activated.has(id)) activated.set(id, e.paso)
  }
  const steps = new Map()
  for (const [id, step] of activated) {
    if (!steps.has(step)) steps.set(step, [])
    steps.get(step).push(id)
  }
  return [...steps.entries()].sort((a,b) => a[0]-b[0]).map(([paso, ids]) => ({paso,ids:ids.sort()}))
}

function firstDifference(actual, expected) {
  for (let i=0; i<Math.max(actual.length,expected.length); i++) {
    if (JSON.stringify(actual[i]?.ids) !== JSON.stringify(expected[i]?.toSorted())) {
      return {grupo:i+1, paso:actual[i]?.paso ?? null, esperado:expected[i] ?? [], obtenido:actual[i]?.ids ?? []}
    }
  }
  return null
}

async function mount(browser, name, fixture) {
  const state = await browser.eval(async name => {
    await window.tukiQA.cargar(name)
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const node = document.querySelector('canvas')
    const rect = node.getBoundingClientRect()
    const gl = node.getContext('webgl2')
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const visible = element => {
      const r = element?.getBoundingClientRect()
      return Boolean(r && r.width && r.height && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight)
    }
    return {
      viewport:[innerWidth,innerHeight], escala:visualViewport?.scale ?? 1, dpr:devicePixelRatio,
      mesa:[rect.x,rect.y,rect.width,rect.height], mesaVisible:visible(node),
      empujarVisible:visible(document.querySelector('[data-action="empujar"]')),
      inventarioVisible:visible(document.querySelector('.inventory')) && document.querySelectorAll('[data-tool]').length > 0,
      gpu:gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), armado:window.tukiQA.estado().armado,
      visible:!document.hidden,
    }
  }, name)
  const expected=structuredClone(fixture.armado)
  for(const key of Object.keys(state.armado.saldo))expected.saldo[key]??=0
  if (!isDeepStrictEqual(state.armado,expected)) throw new Error(name + ' · el montaje de dist difiere de la revisión en disco.')
  delete state.armado
  if (state.viewport.join('x') !== '1366x768' || state.escala !== 1 || !state.visible) throw new Error('Viewport o visibilidad incorrectos: ' + JSON.stringify(state))
  return state
}

async function attempt(browser, first, speed) {
  return browser.eval(async (first,speed) => {
    const qa = window.tukiQA
    if (first) qa.empujar()
    else { qa.velocidad(speed); qa.repetir() }
    if (qa.estado().fase !== 'prueba') throw new Error('El intento no empezó.')
    const deadline = Date.now() + 115_000
    while (qa.estado().fase === 'prueba' && Date.now() < deadline) await new Promise(r => setTimeout(r, 65))
    const {fase,resultado,paso,eventos,duracion,fps,velocidad} = qa.estado()
    if (fase !== 'resultado') throw new Error('Se agotó el plazo sin resultado. Paso ' + paso)
    return {resultado,paso,eventos,duracionMs:Math.round(duracion),fps,velocidad}
  }, first, speed)
}

const signatures = new Map()
const revision = (await buildHash()).digest('hex')
const report = {
  fecha: new Date().toISOString(), equipo: hardware(), distSHA256:revision,
  medicion:'Un cuadro por render; ventanas de 1 s de reloj real y última ventana de 1 s terminada en el resultado.',
  gpuFirefox:'En el perfil temporal se desactiva webgl.sanitize-unmasked-renderer para registrar el nombre real que devuelve WEBGL_debug_renderer_info.',
  modo:setup?'smoke':expansion?'ampliación':'aceptación', navegadores:[],
}
const server = !process.env.TUKI_QA_URL && await preview({ root, base:'/Tuki/', preview:{host:'127.0.0.1',port:0}, logLevel:'error' })
const url = process.env.TUKI_QA_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/Tuki/`
await mkdir(output,{recursive:true})
const resultFile = path.join(output, setup?'aceptacion-smoke.json':expansion?'ampliacion-windows.json':'aceptacion-windows.json')
let success = true
try {
  await buildHash(dist,createHash('sha256'),url)
  for (const program of ['chrome','firefox']) {
    const browser = await openBrowser(program)
    try {
      await browser.goto(new URL('?revision', url).href)
      for (let i=0;i<80 && !await browser.eval(() => Boolean(window.tukiQA));i++) await wait(100)
      const edition = execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Item -LiteralPath $env:TUKI_QA_EJECUTABLE).VersionInfo.ProductName'],
        {encoding:'utf8',windowsHide:true,env:{...process.env,TUKI_QA_EJECUTABLE:browser.executablePath}}).trim()
      const info = {nombre:browser.name,edicion:edition,version:browser.version,montajes:[]}
      report.navegadores.push(info)
      for (const name of setup ? ['s','taza-mixta'] : names) {
        if (name==='taller100') {
          await browser.eval(()=>localStorage.setItem('tuki.progreso.v1',JSON.stringify({version:1,
            completados:['recta','curva','libro','taza','taza-llave','vuelta','subibaja','puerta','puente'],audio:false,movimiento:'sistema'})))
          await browser.goto(new URL('?revision',url).href)
        }
        const fixture = JSON.parse(await readFile(path.join(root,'qa/fixtures',name+'.json'),'utf8'))
        const condiciones = await mount(browser,name,fixture)
        const row = {nombre:name,revisionNivel:fixture.armado.revision,perfil:fixture.armado.perfilFisico,esperado:fixture.esperado,grupos:fixture.grupos,condiciones,pasadas:[]}
        info.montajes.push(row)
        if (!condiciones.mesaVisible || !condiciones.empujarVisible || !condiciones.inventarioVisible) success=false
        if (process.env.TUKI_QA_CAPTURAS && ['taza-mixta','vuelta','subibaja','puente','taller100'].includes(name)) {
          await mkdir(process.env.TUKI_QA_CAPTURAS,{recursive:true})
          await writeFile(path.join(process.env.TUKI_QA_CAPTURAS,program+'-'+(name==='taza-mixta'?'taza':name)+'.png'),await browser.capture())
        }
        for(let i=0;i<(setup?1:expansion?2:10);i++) {
          const speed = i<(expansion?1:8)?1:.25
          const attemptData = await attempt(browser,i===0,speed)
          const groups = trace(fixture,attemptData.eventos)
          const first = firstDifference(groups,fixture.grupos)
          const signature = JSON.stringify(groups)
          const baseline = signatures.get(name)
          if (!baseline) signatures.set(name,signature)
          const match = attemptData.resultado===fixture.esperado && !first && attemptData.velocidad===speed
          const impulses = attemptData.eventos.filter(e => e.tipo==='empujon').length
          const winCount = attemptData.eventos.filter(e=>e.tipo==='victoria').length
          const exact = !baseline || baseline===signature
          const pass = {velocidad:speed,accion:i?'Repetir':'Empujar',desenlace:attemptData.resultado,paso:attemptData.paso,
            duracionMs:attemptData.duracionMs,fps:attemptData.fps,coincide:match,mismaTrazaPorPaso:exact,
            impulsos:impulses,victorias:winCount}
          if (!i || first || !exact) pass.contactos = groups
          if (first) pass.primeraDiferencia=first
          if (['taza-mixta','taller100'].includes(name) && speed===1 && (!attemptData.fps.length || Math.min(...attemptData.fps)<30)) success=false
          if (!match || !exact || impulses!==1 || winCount!==(fixture.esperado==='victoria'?1:0)) success=false
          row.pasadas.push(pass)
        }
        console.log(browser.name,browser.version,name,row.pasadas.filter(p=>p.coincide).length+'/'+row.pasadas.length,'· mínimos FPS',row.pasadas.filter(p=>p.velocidad===1).map(p=>p.fps.length?Math.min(...p.fps):'n/a').join(','))
        await writeFile(resultFile,JSON.stringify(report)+'\n')
      }
    } finally { await browser.close() }
  }
  if ((await buildHash(dist,createHash('sha256'),url)).digest('hex')!==revision) throw new Error('La compilación servida cambió durante las pasadas.')
  report.aceptado = success && !setup
  if (!setup) await writeFile(path.join(output,expansion?'ampliacion.md':'aceptacion.md'),resumen(report))
  if (!success) process.exitCode=1
} finally {
  if (server) await new Promise(resolve=>server.httpServer.close(resolve))
  await writeFile(resultFile,JSON.stringify(report)+'\n')
}
