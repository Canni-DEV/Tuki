import './style.css'
import { Quaternion } from 'three'
import { Mesa } from './scene'
import { campana, niveles, nivelPorId } from './levels'
import { Editor, validarPieza } from './editor'
import { initPhysics, Simulation, type BodyPose, type SimEvent } from './simulation'
import { Sonido } from './audio'
import { leer, guardar } from './progreso'
import {
  tipos,
  perfil,
  type IdNivel,
  type Nivel,
  type PiezaColocada,
  type TipoColocable,
  type Armado,
  type Vec3,
} from './types'
import { ayuda, audioButton, button, ico, iconButton, imgSimbolo, menu, nombres, nOrden } from './ui'
import firma from '../docs/arte/marca/simbolo.svg?raw'

const app = document.querySelector<HTMLElement>('#app')!,
  dialog = document.querySelector<HTMLDialogElement>('#dialog')!
const preferencias = leer(),
  sonido = new Sonido()
sonido.audio(preferencias.audio)
const editores = new Map<IdNivel, Editor>()
const params = new URLSearchParams(location.search)
const modoQA = params.has('revision')
type Fase = 'seleccion' | 'edicion' | 'prueba' | 'resultado'
let fase: Fase = 'seleccion',
  nivel: Nivel,
  editor: Editor,
  mesa: Mesa | undefined,
  sim: Simulation | undefined
let ultimo: Armado | undefined,
  numeroIntento = 0,
  velocidad = 1,
  token = 0,
  cargado = false,
  errCarga = false
let herramienta: TipoColocable | 'fila' | null = null,
  previas: PiezaColocada[] = [],
  motivo: string | null = null
type Gesto = {
  tipo: 'fila' | 'mover' | 'girar' | 'colocar'
  pointer: number
  x: number
  y: number
  origen?: PiezaColocada
  angulo?: number
  apoyo: string
  muestras: Vec3[]
  cortado?: boolean
}
let gesto: Gesto | null = null,
  avisador: ReturnType<typeof setTimeout> | undefined
let eventos: SimEvent[] = [],
  fps: number[] = [],
  frames: number[] = [],
  inicioReal = 0,
  duracion = 0,
  gpu = ''
let antes = new Map<string, BodyPose>(),
  ahora = new Map<string, BodyPose>(),
  ultimaMarca = 0,
  acumulador = 0
let mensajeCarga = ''
let firmaEmitida = 0
let clickDeInicio: { x: number; y: number; t: number } | undefined
const media = matchMedia('(prefers-reduced-motion: reduce)')
function movimiento() {
  document.documentElement.dataset.reducido = String(
    preferencias.movimiento === 'reducido' || (preferencias.movimiento === 'sistema' && media.matches),
  )
}
media.addEventListener('change', movimiento)
movimiento()
function aviso(text: string) {
  const box = document.querySelector<HTMLElement>('#aviso')!
  box.textContent = text
  box.classList.toggle('visible', !!text)
  clearTimeout(avisador)
  avisador = setTimeout(() => box.classList.remove('visible'), 4000)
}
function persistir() {
  if (!guardar(preferencias)) aviso('Tu progreso durará hasta cerrar esta pestaña.')
}
function limpiarIntento() {
  sonido.limpiar()
  sim?.dispose()
  sim = undefined
  acumulador = 0
  ultimaMarca = 0
  antes.clear()
  ahora.clear()
}
function cancelar() {
  gesto = null
  previas = []
  motivo = null
  indicador()
  redibujar()
}
function resetVista() {
  token++
  cargado = false
  errCarga = false
  cancelar()
  limpiarIntento()
  mesa?.dispose()
  mesa = undefined
  herramienta = null
  ultimo = undefined
}
function selector() {
  resetVista()
  fase = 'seleccion'
  app.innerHTML = menu(preferencias)
  document.title = 'Tuki · Desafíos'
}
function libre(n: Nivel) {
  return !n.requiere || preferencias.completados.includes(n.requiere)
}
function redibujar(poses?: Map<string, BodyPose>) {
  if (!mesa || !editor || !cargado) return
  mesa.dibujar(editor.armado.piezas, fase === 'edicion' ? editor.seleccion : null, previas, motivo, poses)
}
function indicador(x?: number, y?: number) {
  const el = document.querySelector<HTMLElement>('#indicador')
  if (!el) return
  const text =
    motivo ??
    (gesto?.tipo === 'fila' && previas.length
      ? previas.length + ' ' + (previas.length === 1 ? 'ficha' : 'fichas')
      : '')
  el.textContent = text
  el.hidden = !text
  if (x !== undefined && y !== undefined) {
    const rect = el.parentElement!.getBoundingClientRect()
    el.style.left = Math.max(6, Math.min(rect.width - el.offsetWidth - 8, x - rect.left + 15)) + 'px'
    el.style.top = Math.max(6, Math.min(rect.height - el.offsetHeight - 6, y - rect.top + 18)) + 'px'
  }
}
function cabecera() {
  return (
    '<header class="game-head"><div class="game-id">' +
    iconButton('selector', 'Volver a desafíos', 'atras') +
    '<img class="game-symbol" alt="Tuki" src="' +
    imgSimbolo +
    '"><div><div class="level-overline">' +
    (nivel.id === 'taza-llave' ? 'Variante de sincronización' : 'Desafío ' + nOrden(nivel) + ' / ' + String(campana.length).padStart(2, '0')) +
    '</div><h1>' +
    nivel.nombre +
    '</h1><p>' +
    nivel.objetivo +
    '</p></div></div><div class="cam-controls">' +
    button('superior', 'Vista superior', 'planta') +
    button('encuadrar', 'Ver mesa', 'mesa') +
    audioButton(preferencias) +
    iconButton('ajustes', 'Preferencias', 'ajustes') +
    '</div></header>'
  )
}
async function abrir(n: Nivel, interno = false) {
  if (!interno && !libre(n)) return
  resetVista()
  const local = token
  fase = 'edicion'
  nivel = n
  editor = editores.get(n.id) ?? new Editor(n)
  editores.set(n.id, editor)
  document.title = n.nombre + ' · Tuki'
  app.innerHTML =
    '<div class="game">' +
    cabecera() +
    '<div class="stage"><canvas id="mesa" aria-label="Mesa de ' +
    n.nombre +
    '"></canvas><div id="indicador" hidden></div><div id="carga" class="load"><div><p role="status">Preparando la mesa…</p></div></div></div><footer class="tray" id="bandeja"></footer></div>'
  bandeja()
  try {
    const canvas = document.querySelector<HTMLCanvasElement>('#mesa')!
    mesa = new Mesa(canvas, n)
    await Promise.all([mesa.cargar(), initPhysics()])
    if (token !== local) return
    cargado = true
    const gl = canvas.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpu = gl
      ? ext
        ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
      : ''
    document.querySelector('#carga')?.remove()
    conectarMouse(canvas)
    bandeja()
    redibujar()
  } catch (error) {
    if (token !== local) return
    errCarga = true
    mensajeCarga = error instanceof Error ? error.message : String(error)
    const load = document.querySelector<HTMLElement>('#carga')!
    load.innerHTML =
      '<div><h2>No se pudo abrir la mesa</h2><p></p>' +
      button('reintentar', 'Reintentar', 'repetir', 'primary') +
      '</div>'
    load.querySelector('p')!.textContent = mensajeCarga
  }
}
function bandeja() {
  const el = document.querySelector<HTMLElement>('#bandeja')
  if (!el) return
  if (fase === 'edicion') {
    const inv = tipos
      .filter((t) => nivel.inventario[t] > 0)
      .map((t) => {
        const img = mesa?.miniatura(t)
        return (
          '<button class="piece ' +
          (herramienta === t ? 'active' : '') +
          '" data-tool="' +
          t +
          '" aria-pressed="' +
          (herramienta === t) +
          '" ' +
          (!cargado || editor.armado.saldo[t] === 0 ? 'disabled' : '') +
          '>' +
          (img ? '<img alt="" src="' + img + '">' : '') +
          '<span>' +
          nombres[t] +
          '<b>× ' +
          editor.armado.saldo[t] +
          '</b></span></button>'
        )
      })
      .join('')
    const editable = editor.armado.piezas.some((p) => p.id === editor.seleccion)
    el.innerHTML =
      '<div class="inventory"><div class="tray-label">Piezas disponibles</div><div class="pieces">' +
      inv +
      '</div></div><div class="edit-tools">' +
      button('trazar', 'Trazar fila', 'trazar', herramienta === 'fila' ? 'active' : '') +
      button('deshacer', 'Deshacer', 'deshacer') +
      (editable ? button('retirar', 'Retirar', 'retirar') : '') +
      '</div>' +
      button('empujar', 'Empujar', 'play', 'primary push')
    el.querySelector<HTMLButtonElement>('[data-action=deshacer]')!.disabled = !editor.historia.length
    el.querySelector<HTMLButtonElement>('[data-action=trazar]')!.disabled =
      !cargado || !editor.armado.saldo.domino
    el.querySelector<HTMLButtonElement>('[data-action=empujar]')!.disabled = !cargado
  } else {
    const gano = sim?.result === 'victoria',
      final = fase === 'resultado'
    const next = niveles.find((n) => n.requiere === nivel.id)
    el.innerHTML =
      '<div class="test-state" role="status">' +
      (final && gano ? '<div class="remate">' + firma + '</div>' : '') +
      '<div><div class="tray-label">' +
      (final ? 'Resultado' : 'En marcha') +
      (velocidad === 0.25 ? ' · Cámara lenta' : '') +
      '</div><h2>' +
      (final ? (gano ? '¡Tuki! · Meta alcanzada' : 'Cadena detenida') : 'Prueba') +
      '</h2></div></div><div class="result-tools">' +
      button('velocidad', velocidad === 1 ? 'Cámara lenta' : 'Velocidad normal') +
      (final ? button('repetir', 'Repetir', 'repetir') : '') +
      button('editar', 'Volver a editar') +
      (final && gano && (!next || !campana.includes(next)) ? button('selector', 'Ver desafíos') : '') +
      (final && gano && next
        ? button(
            'jugar-' + next.id,
            next.id === 'taza-llave' ? 'Probar la llave' : 'Siguiente',
            'flecha',
            'primary',
          )
        : '') +
      '</div>'
    if (final && gano) {
      const marca = el.querySelector<HTMLElement>('.remate')!
      if (firmaEmitida === numeroIntento) marca.classList.add('final')
      firmaEmitida = numeroIntento
    }
  }
}
function soltarHerramienta() {
  herramienta = null
  cancelar()
  bandeja()
}
function conectarMouse(canvas: HTMLCanvasElement) {
  const drop = (ev: PointerEvent) => {
    if (fase !== 'edicion' || !cargado || !mesa) return
    const { clientX: x, clientY: y } = ev
    if (gesto?.tipo === 'fila') {
      if (gesto.cortado) return
      const p = mesa.apuntar(x, y, 'domino')
      const currentY = gesto.muestras[0][1]
      const pos = mesa.superficiePunto(x, y, currentY)
      if (pos && Math.hypot(pos[0] - gesto.muestras.at(-1)![0], pos[2] - gesto.muestras.at(-1)![2]) >= 0.002)
        gesto.muestras.push(pos)
      const tramo = editor.trazar(gesto.muestras, gesto.apoyo)
      previas = tramo.piezas
      motivo = tramo.error
      if (!p || p.apoyo !== gesto.apoyo) {
        gesto.cortado = true
        motivo = 'Empezá otro trazo abajo'
      }
    } else if (gesto?.tipo === 'girar') {
      const o = gesto.origen!,
        p = mesa.superficiePunto(x, y, o.posicion[1])
      if (!p) return
      const ang = (Math.atan2(p[0] - o.posicion[0], p[2] - o.posicion[2]) * 180) / Math.PI
      const nueva = { ...o, giroY: (o.giroY + ang - gesto.angulo! + 360) % 360 }
      previas = [nueva]
      motivo = validarPieza(nivel, nueva, editor.armado.piezas)
    } else {
      const o = gesto?.origen
      const t = o?.tipo ?? (herramienta !== 'fila' ? herramienta : null)
      if (!t || (!gesto && ev.buttons)) return
      if (gesto?.tipo === 'mover' && Math.hypot(x - gesto.x, y - gesto.y) < 3 && !previas.length) return
      const p = mesa.apuntar(x, y, t)
      const pos = p?.posicion ?? mesa.superficiePunto(x, y, o?.posicion[1] ?? 0)
      if (!pos) return
      const nueva: PiezaColocada = {
        id: o?.id ?? 'previa',
        tipo: t,
        apoyo: p?.apoyo ?? '',
        posicion: pos,
        giroY: o?.giroY ?? nivel.fijos.find((o) => o.id === 'inicio')?.giroY ?? 0,
      }
      previas = [nueva]
      motivo = p ? validarPieza(nivel, nueva, editor.armado.piezas) : 'Volvé a la mesa'
    }
    indicador(x, y)
    redibujar()
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || fase !== 'edicion' || !mesa || gesto) return
    sonido.iniciar()
    const x = ev.clientX,
      y = ev.clientY
    if (herramienta === 'fila') {
      const p = mesa.apuntar(x, y, 'domino')
      if (!p) return
      gesto = { tipo: 'fila', pointer: ev.pointerId, x, y, apoyo: p.apoyo, muestras: [p.posicion] }
    } else if (herramienta) {
      gesto = { tipo: 'colocar', pointer: ev.pointerId, x, y, apoyo: '', muestras: [] }
      drop(ev)
    } else {
      const hit = mesa.seleccionar(x, y)
      editor.seleccion = hit?.id ?? null
      const o = editor.armado.piezas.find((p) => p.id === hit?.id)
      if (o) {
        const p = mesa.superficiePunto(x, y, o.posicion[1]) ?? o.posicion
        gesto = {
          tipo: hit!.aro ? 'girar' : 'mover',
          pointer: ev.pointerId,
          x,
          y,
          origen: o,
          apoyo: o.apoyo,
          muestras: [],
          angulo: (Math.atan2(p[0] - o.posicion[0], p[2] - o.posicion[2]) * 180) / Math.PI,
        }
      }
      bandeja()
      redibujar()
    }
    if (gesto) canvas.setPointerCapture(ev.pointerId)
  })
  canvas.addEventListener('pointermove', drop)
  canvas.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0 || !gesto || gesto.pointer !== ev.pointerId) return
    drop(ev)
    if (gesto.tipo === 'fila' || gesto.tipo === 'colocar') {
      if ((gesto.tipo === 'fila' || !motivo) && editor.agregar(previas)) sonido.colocar()
    } else if (!motivo && previas[0]) editor.mover(previas[0])
    const error = motivo
    soltarHerramienta()
    if (error && error !== 'Límite de fichas') aviso(error)
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId)
  })
  canvas.addEventListener('lostpointercapture', (ev) => {
    if (gesto?.pointer === ev.pointerId) cancelar()
  })
  canvas.addEventListener('pointercancel', () => cancelar())
  canvas.addEventListener('pointerleave', () => {
    if (!gesto) cancelar()
  })
}
function probar(repeticion = false) {
  if (!cargado || (repeticion ? fase !== 'resultado' : fase !== 'edicion')) return
  cancelar()
  herramienta = null
  if (!repeticion) {
    ultimo = structuredClone(editor.armado)
    velocidad = 1
  }
  limpiarIntento()
  sim = new Simulation(nivel, ultimo!, ++numeroIntento)
  fase = 'prueba'
  antes = sim.poses()
  ahora = sim.poses()
  inicioReal = performance.now()
  ultimaMarca = inicioReal
  frames = []
  fps = []
  duracion = 0
  eventos = []
  bandeja()
  redibujar(ahora)
}
function editar() {
  if (!sim || !ultimo) return
  limpiarIntento()
  editor.armado = structuredClone(ultimo)
  fase = 'edicion'
  cancelar()
  bandeja()
}
function preferenciaAudio() {
  preferencias.audio = !preferencias.audio
  sonido.audio(preferencias.audio)
  persistir()
  const old = app.querySelector('[data-action=audio]')
  if (old) old.outerHTML = audioButton(preferencias)
}
function modal(ajustes = false) {
  dialog.innerHTML =
    iconButton('cerrar', 'Cerrar', 'cierre') +
    (ajustes
      ? '<h2>Preferencias</h2><label>Sonido <input type="checkbox" id="pref-audio" ' +
        (preferencias.audio ? 'checked' : '') +
        '></label><label>Movimiento de la interfaz <select id="pref-mov"><option value="sistema">Según el sistema</option><option value="reducido">Reducido</option><option value="completo">Completo</option></select></label>'
      : ayuda())
  if (ajustes) {
    const select = dialog.querySelector<HTMLSelectElement>('select')!
    select.value = preferencias.movimiento
    select.onchange = () => {
      preferencias.movimiento = select.value as typeof preferencias.movimiento
      movimiento()
      persistir()
    }
    dialog.querySelector<HTMLInputElement>('input')!.onchange = preferenciaAudio
  }
  dialog.showModal()
}
document.addEventListener('click', (ev) => {
  const b = (ev.target as Element).closest<HTMLButtonElement>('button')
  if (!b || b.disabled) return
  // A second mouse click can land on a different button after the tray changes phase.
  if (
    clickDeInicio &&
    ev.detail > 0 &&
    ev.timeStamp - clickDeInicio.t < 500 &&
    Math.hypot(ev.clientX - clickDeInicio.x, ev.clientY - clickDeInicio.y) < 4
  ) {
    clickDeInicio = undefined
    return
  }
  clickDeInicio = undefined
  sonido.iniciar()
  const tool = b.dataset.tool as TipoColocable | undefined,
    a = b.dataset.action
  if (b.dataset.level) {
    void abrir(nivelPorId(b.dataset.level as IdNivel))
    return
  }
  if (tool) {
    cancelar()
    herramienta = herramienta === tool ? null : tool
    editor.seleccion = null
    bandeja()
    redibujar()
    return
  }
  if (a?.startsWith('jugar-')) {
    void abrir(nivelPorId(a.slice(6) as IdNivel))
    return
  }
  switch (a) {
    case 'ayuda':
      modal()
      break
    case 'ajustes':
      modal(true)
      break
    case 'cerrar':
      dialog.close()
      break
    case 'audio':
      preferenciaAudio()
      break
    case 'selector':
      selector()
      break
    case 'reintentar':
      void abrir(nivel, true)
      break
    case 'superior':
      mesa?.superior()
      break
    case 'encuadrar':
      mesa?.encuadrar()
      break
    case 'trazar':
      cancelar()
      herramienta = herramienta === 'fila' ? null : 'fila'
      editor.seleccion = null
      bandeja()
      redibujar()
      break
    case 'deshacer':
      editor.deshacer()
      soltarHerramienta()
      break
    case 'retirar':
      editor.retirar()
      soltarHerramienta()
      break
    case 'empujar':
    case 'repetir':
      if (ev.detail > 0) clickDeInicio = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp }
      probar(a === 'repetir')
      break
    case 'editar':
      editar()
      break
    case 'velocidad':
      velocidad = velocidad === 1 ? 0.25 : 1
      bandeja()
      break
  }
})
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !dialog.open && fase === 'edicion') soltarHerramienta()
})
document.addEventListener('visibilitychange', () => {
  ultimaMarca = 0
  sonido.visible(!document.hidden)
})
function interpolar(t: number) {
  const poses = new Map<string, BodyPose>()
  for (const [id, b] of ahora) {
    const a = antes.get(id) ?? b
    const q = new Quaternion(...a.q).slerp(new Quaternion(...b.q), t)
    poses.set(id, { p: a.p.map((p, i) => p + (b.p[i] - p) * t) as Vec3, q: [q.x, q.y, q.z, q.w] })
  }
  return poses
}
function fotograma(t: number) {
  requestAnimationFrame(fotograma)
  if (!mesa || !cargado || document.hidden) return
  if (fase === 'prueba' && sim) {
    acumulador += ultimaMarca ? Math.max(0, t - ultimaMarca) * 0.001 * velocidad : 0
    ultimaMarca = t
    for (let i = 0; i < 8 && acumulador >= perfil.paso && !sim.result; i++) {
      antes = ahora
      for (const e of sim.step()) {
        if (modoQA) eventos.push(e)
        sonido.evento(e)
      }
      ahora = sim.poses()
      acumulador -= perfil.paso
    }
    sonido.rodar(sim.result ? 0 : sim.rodadura.velocidad, sim.rodadura.material)
    redibujar(sim.result ? ahora : interpolar(Math.min(1, acumulador / perfil.paso)))
    mesa.render()
    if (modoQA) frames.push(performance.now() - inicioReal)
    if (sim.result) {
      duracion = performance.now() - inicioReal
      if (modoQA) {
        for (let end = 1000; end <= duracion; end += 1000)
          fps.push(frames.filter((x) => x > end - 1000 && x <= end).length)
        if (duracion >= 1000) fps.push(frames.filter((x) => x > duracion - 1000 && x <= duracion).length)
      }
      fase = 'resultado'
      if (sim.result === 'victoria' && !preferencias.completados.includes(nivel.id)) {
        preferencias.completados.push(nivel.id)
        persistir()
      }
      bandeja()
    }
  } else mesa.render()
}
selector()
requestAnimationFrame(fotograma)
const fixtures = import.meta.glob<{ default: { armado: Armado } }>('../qa/fixtures/*.json')
async function cargarFixture(nombre: string, rota = false) {
  const load = fixtures['../qa/fixtures/' + nombre + '.json']
  if (!load) throw new Error('Montaje desconocido')
  const { armado } = (await load()).default
  if (fase === 'seleccion' || nivel.id !== armado.nivel || errCarga)
    await abrir(nivelPorId(armado.nivel), true)
  if (!cargado) throw new Error(mensajeCarga || 'Mesa sin cargar')
  if (sim) editar()
  const copia = structuredClone(armado)
  if (rota) copia.piezas.find((p) => p.id === 'd4')!.posicion[2] -= 0.020
  editor.cargar(copia)
  cancelar()
  bandeja()
}
if (modoQA)
  Object.assign(window, {
    tukiQA: {
      cargar: cargarFixture,
      empujar: () => probar(),
      repetir: () => probar(true),
      editar,
      velocidad: (n: number) => {
        velocidad = n === 0.25 ? 0.25 : 1
        bandeja()
      },
      proyectar: (p: Vec3) => mesa?.proyectar(p),
      estado: () => ({
        fase,
        resultado: sim?.result ?? null,
        paso: sim?.tick ?? 0,
        eventos,
        fps,
        duracion,
        gpu,
        velocidad,
        armado: editor?.armado,
        seleccion: editor?.seleccion,
        historia: editor?.historia.length,
        cargado,
        error: errCarga ? mensajeCarga : null,
      }),
    },
  })
if (params.get('sesion') === 'reparar') void cargarFixture('s', true)
if (params.get('sesion') === 'inventar') void abrir(nivelPorId('taza'), true)
