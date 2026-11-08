import './style.css'
import { Quaternion } from 'three'
import { Mesa } from './scene'
import { campana, niveles, nivelPorId } from './levels'
import { Editor, validarPieza } from './editor'
import { initPhysics, Simulation, type BodyPose, type SimEvent } from './simulation'
import { Sonido } from './audio'
import { consumirTiempo } from './reloj'
import { familias, leer, guardar, disponible } from './progreso'
import {
  tipos, esMando, esReceptor, esClasica, gruposBandeja,
  perfil,
  type IdNivel,
  type Nivel,
  type PiezaColocada,
  type TipoColocable,
  type Armado,
  type Vec3,
} from './types'
import { armadoDeMesa, Biblioteca, faltantes, leerMesa, mesaNueva, nivelTaller, permiteTipo, type Creacion } from './taller'
import { piezas as catalogo } from './types'
import { html, ayuda, audioButton, controlesVolumen, button, ico, iconButton, imgSimbolo, menu, nombres, nOrden } from './ui'
import firma from '../docs/arte/marca/simbolo.svg?raw'

const app = document.querySelector<HTMLElement>('#app')!,
  dialog = document.querySelector<HTMLDialogElement>('#dialog')!
const preferencias = leer(),
  sonido = new Sonido(preferencias)
const paneo = (pos: Vec3) => mesa?.paneo(pos) ?? 0
// Keyboard, mouse and touch can all be the gesture that unlocks browser audio.
const activarAudio = () => sonido.iniciar()
document.addEventListener('pointerdown', activarAudio)
document.addEventListener('pointerup', activarAudio)
document.addEventListener('keydown', activarAudio)
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
let cableando = false, borneOrigen: string | undefined
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
const biblioteca = new Biblioteca(() => aviso('El guardado local no está disponible. Podés exportar tu mesa.'))
let creacion: Creacion | undefined
let ultimoGuardado: Armado | undefined
const soloLectura = () => !!creacion && faltantes(creacion.mesa, preferencias.completados).length > 0
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
  cableando = false; borneOrigen = undefined
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
  creacion = undefined
  fase = 'seleccion'
  app.innerHTML = menu(preferencias)
  document.title = 'Tuki · Desafíos'
}
function libre(n: Nivel) {
  return disponible(n, preferencias)
}
function redibujar(poses = fase === 'edicion' ? undefined : ahora) {
  if (!mesa || !editor || !cargado) return
  mesa.dibujar(editor.armado.piezas, fase === 'edicion' ? editor.seleccion : null, previas, motivo, poses, editor.armado.conexiones)
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
function autoguardar() {
  if (!creacion || soloLectura() || ultimoGuardado === editor.armado) return
  creacion = biblioteca.guardar({ ...creacion.mesa, version: 2, piezas: editor.armado.piezas, conexiones: editor.armado.conexiones }, creacion.id)
  ultimoGuardado = editor.armado
}
async function verBiblioteca() {
  if (!preferencias.completados.includes('recta')) return
  resetVista()
  const solicitud = token
  creacion = undefined
  fase = 'seleccion'
  await initPhysics()
  await biblioteca.abrir()
  if (solicitud !== token) return
  document.title = 'Tuki · Taller libre'
  app.innerHTML = '<header class="menu-head"><div class="wrap nav">' + button('selector', 'Desafíos', 'atras') +
    '<div class="utilities">' + audioButton(preferencias) + iconButton('ajustes', 'Preferencias', 'ajustes') + '</div></div></header>' +
    '<main class="wrap workshop"><div class="section-title"><h1>Taller libre</h1><div class="edit-tools">' +
    button('importar', 'Importar archivo') + button('nueva', 'Nueva mesa', 'mesa', 'primary') +
    '</div></div><input type="file" id="archivo-mesa" accept=".tuki.json,.json" hidden>' +
    (biblioteca.mesas.size ? '<div class="library-grid">' + Array.from(biblioteca.mesas.values(), entry => {
      const locked = faltantes(entry.mesa, preferencias.completados)
      return '<article class="creation"><h2>' + html(entry.mesa.nombre) + '</h2><p>' + entry.mesa.piezas.length + ' / 100 objetos</p>' +
        (locked.length ? '<p>Para editar, ganá ' + locked.map(id => nivelPorId(id).nombre).join(', ') + '.</p>' : '') +
        '<div class="edit-tools">' + button('mesa-' + entry.id, locked.length ? 'Ver y probar' : 'Abrir mesa', 'play', 'primary') +
        (!locked.length ? button('copiar-' + entry.id, 'Duplicar') : '') + button('borrar-' + entry.id, 'Borrar') + '</div></article>'
    }).join('') + '</div>' : '<p>Creá una mesa o importá un archivo .tuki.json para empezar.</p>') + '</main>'
  const archivo = document.querySelector<HTMLInputElement>('#archivo-mesa')!
  archivo.onchange = async () => {
    const file = archivo.files?.[0]
    if (!file) return
    try {
      if (file.size > 512000) throw new Error('El archivo supera el tamaño de una mesa.')
      const doc = leerMesa(JSON.parse(await file.text()))
      const item = biblioteca.guardar(doc)
      if (token === solicitud) await abrirCreacion(item)
    } catch (error) { aviso(error instanceof SyntaxError ? 'Archivo JSON inválido.' : String((error as Error).message)) }
    archivo.value = ''
  }
}
function abrirCreacion(entry: Creacion) {
  creacion = entry
  return abrir(nivelTaller(entry.mesa.nombre))
}
function nombrarMesa() {
  dialog.innerHTML = '<form><h2>Nueva mesa</h2><label>Nombre de la mesa <input required maxlength="80" id="nombre-mesa" autofocus></label><div class="edit-tools">' +
    button('cerrar', 'Cancelar') + '<button type="submit" class="primary">Crear mesa</button></div></form>'
  dialog.querySelector('form')!.onsubmit = event => {
    event.preventDefault()
    const nombre = dialog.querySelector('input')!.value.trim()
    if (!nombre) return
    dialog.close()
    void abrirCreacion(biblioteca.guardar(mesaNueva(nombre)))
  }
  dialog.showModal()
}
function exportarMesa() {
  if (!creacion || soloLectura()) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(creacion.mesa, null, 2)], { type: 'application/json' }))
  link.download = (creacion.mesa.nombre.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'Mesa') + '.tuki.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
function cabecera() {
  return (
    '<header class="game-head"><div class="game-id">' +
    iconButton(creacion ? 'biblioteca' : 'selector', creacion ? 'Volver a mis mesas' : 'Volver a desafíos', 'atras') +
    '<img class="game-symbol" alt="Tuki" src="' +
    imgSimbolo +
    '"><div><div class="level-overline">' +
    (creacion ? (soloLectura() ? 'Taller · Solo lectura' : 'Taller libre') : nivel.id === 'taza-llave' ? 'Variante de sincronización' : 'Desafío ' + nOrden(nivel) + ' / ' + String(campana.length).padStart(2, '0')) +
    '</div><h1>' +
    html(nivel.nombre) +
    '</h1><p>' +
    nivel.objetivo +
    '</p></div></div><div class="cam-controls">' +
    (creacion && !soloLectura() ? button('exportar', 'Exportar mesa') : '') +
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
  if (n.id === 'taller' && creacion) {
    editor = new Editor(n)
    editor.cargar(armadoDeMesa(n, creacion.mesa))
    ultimoGuardado = editor.armado
  } else {
    creacion = undefined
    editor = editores.get(n.id) ?? new Editor(n)
    editores.set(n.id, editor)
  }
  document.title = n.nombre + ' · Tuki'
  app.innerHTML =
    '<div class="game">' +
    cabecera() +
    '<div class="stage"><canvas id="mesa" aria-label="Mesa de ' +
    html(n.nombre) +
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
    const desplazamiento = el.querySelector('.pieces')?.scrollLeft ?? 0
    const tarjetas = new Map(tipos
      .filter(t => nivel.inventario[t] > 0 && !soloLectura() &&
        (!esClasica(t) || creacion?.mesa.piezas.some(p => p.tipo === t)))
      .map((t) => {
        const img = mesa?.miniatura(t)
        const premio = creacion && !permiteTipo(t, preferencias.completados) ? nivelPorId(catalogo[t][2]).nombre : null
        return [t, (
          '<button class="piece ' +
          (herramienta === t ? 'active' : '') +
          '" data-tool="' +
          t +
          '" aria-pressed="' +
          (herramienta === t) +
          '" ' +
          (!cargado || premio || editor.disponibles(t) === 0 ? 'disabled' : '') + (premio ? ' title="Ganá ' + premio + '"' : '') +
          '>' +
          (img ? '<img alt="" src="' + img + '">' : '') +
          '<span>' +
          nombres[t] +
          '<b>' + (premio ? 'Ganá ' + premio : creacion ? '' : '× ' + editor.armado.saldo[t]) +
          '</b></span></button>'
        )] as const
      }))
    const agrupar = !!creacion || tarjetas.size > 5
    const inv = gruposBandeja.map(grupo => {
      const piezas = grupo.tipos.map(tipo => tarjetas.get(tipo) ?? '').join('')
      if (!agrupar || !piezas) return piezas
      return '<div class="familia-piezas" role="group" aria-label="' + grupo.nombre + '"><small>' +
        grupo.nombre + '</small><div>' + piezas + '</div></div>'
    }).join('')
    const editable = editor.armado.piezas.some((p) => p.id === editor.seleccion)
    el.classList.toggle('taller-tray', agrupar)
    el.innerHTML =
      '<div class="inventory"><div class="tray-label">' + (creacion ? (soloLectura() ? 'Solo lectura · Ganá ' + faltantes(creacion.mesa, preferencias.completados).map(id => nivelPorId(id).nombre).join(', ') : editor.armado.piezas.length + ' / 100 objetos') : 'Piezas disponibles') + '</div><div class="pieces">' +
      inv +
      '</div></div><div class="edit-tools">' +
    (cargado && creacion && tipos.some(t => esMando(t) && nivel.inventario[t]) && tipos.some(t => esReceptor(t) && nivel.inventario[t]) && !soloLectura()
      ? button('cable', cableando ? (borneOrigen ? 'Elegí el receptor' : 'Elegí el mando') : 'Conectar / desconectar', '', cableando ? 'active' : '') : '') +
      button('trazar', 'Trazar fila', 'trazar', herramienta === 'fila' ? 'active' : '') +
      button('deshacer', 'Deshacer', 'deshacer') +
      (editable ? button('retirar', 'Retirar', 'retirar') : '') +
      '</div>' +
      button('empujar', 'Empujar', 'play', 'primary push')
    el.querySelector('.pieces')!.scrollLeft = desplazamiento
    el.querySelector<HTMLButtonElement>('[data-action=deshacer]')!.disabled = soloLectura() || !editor.historia.length
    el.querySelector<HTMLButtonElement>('[data-action=trazar]')!.disabled =
      !cargado || soloLectura() || !editor.disponibles('domino')
    const push = el.querySelector<HTMLButtonElement>('[data-action=empujar]')!
    push.disabled = !cargado || !extremosListos()
    if (!extremosListos()) push.title = 'Colocá un inicio y una meta'
  } else {
    const gano = sim?.result === 'victoria',
      final = fase === 'resultado'
    const next = campana.find((n) => n.requiere === nivel.id)
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
      (final && gano && !creacion && (!next || !campana.includes(next)) ? button('selector', 'Ver desafíos') : '') +
      (final && gano && nivel.id === 'taza' ? button('jugar-taza-llave', 'Probar la llave') : '') +
      (final && gano && !creacion ? button('biblioteca', 'Taller libre', 'mesa') : '') +
      (final && creacion ? button('biblioteca', 'Mis mesas') : '') +
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
  let finOrbita: { x: number, y: number } | undefined
  canvas.addEventListener('pointerup', ev => {
    if (ev.button === 2 && previas.length) finOrbita = { x: ev.clientX, y: ev.clientY }
  })
  const revisarVista = (ev: MouseEvent) => {
    const p = previas[0]
    if (!mesa || !p?.apoyo || !herramienta || herramienta === 'fila' || gesto) return
    motivo = mesa.previaVisible(p) ? validarPieza(nivel, p, editor.armado.piezas) : 'Girá la cámara para ver la pieza'
    indicador(ev.clientX, ev.clientY)
    redibujar()
  }
  canvas.addEventListener('wheel', revisarVista, { passive: true })
  const drop = (ev: PointerEvent) => {
    if (fase !== 'edicion' || !cargado || !mesa) return
    if (ev.buttons & 2) { revisarVista(ev); return }
    if (cableando) return
    const { clientX: x, clientY: y } = ev
    if (finOrbita && previas.length && finOrbita.x === x && finOrbita.y === y) return
    finOrbita = undefined
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
      const libre = (o.giroY + ang - gesto.angulo! + 360) % 360
      const nueva = { ...o, giroY: ev.shiftKey ? Math.round(libre / 15) * 15 : libre }
      previas = [nueva]
      const move = editor.movimiento(nueva)
      previas = move.piezas
      motivo = move.error
    } else {
      const o = gesto?.origen
      const t = o?.tipo ?? (herramienta !== 'fila' ? herramienta : null)
      if (!t || (!gesto && ev.buttons)) return
      if (gesto?.tipo === 'mover' && Math.hypot(x - gesto.x, y - gesto.y) < 3 && !previas.length) return
      const giroY = o?.giroY ?? previas[0]?.giroY ?? nivel.fijos.find(p => p.rol === 'inicio')?.giroY ?? 0
      const p = mesa.apuntar(x, y, t, o?.id, giroY, o ? pieza => editor.movimiento(pieza).error : undefined)
      const pos = p?.posicion ?? mesa.superficiePunto(x, y, o?.posicion[1] ?? 0)
      if (!pos) return
      const nueva: PiezaColocada = {
        id: o?.id ?? 'previa',
        tipo: t,
        apoyo: p?.apoyo ?? '',
        posicion: pos,
        giroY,
      }
      previas = [nueva]
      if (o && p) { const move = editor.movimiento(nueva); previas = move.piezas; motivo = move.error }
      else motivo = p ? validarPieza(nivel, nueva, editor.armado.piezas) : mesa.motivoPuntero
    }
    indicador(x, y)
    redibujar()
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || soloLectura() || fase !== 'edicion' || !mesa || gesto) return
    const x = ev.clientX,
      y = ev.clientY
    if (cableando) {
      const id = mesa.elegirBorne(x, y, !!borneOrigen)
      if (!id) { aviso(borneOrigen ? 'Elegí el borne del receptor.' : 'Elegí el borne de una palanca o un botón.'); return }
      if (!borneOrigen) { borneOrigen = id; bandeja(); return }
      const conectado = editor.armado.conexiones?.some(c => c.mando === borneOrigen && c.receptor === id)
      if (editor.conectar(borneOrigen, id)) { autoguardar(); aviso(conectado ? 'Cable desconectado.' : 'Cable conectado.') }
      soltarHerramienta(); return
    }
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
      if ((gesto.tipo === 'fila' || !motivo) && editor.agregar(previas))
        sonido.edicion(gesto.tipo, paneo(previas[0].posicion))
      else if (motivo || gesto.tipo === 'colocar') sonido.interfaz('invalida')
    } else if (motivo) sonido.interfaz('invalida')
    else if (previas[0] && editor.mover(previas[0])) sonido.edicion(gesto.tipo, paneo(previas[0].posicion))
    autoguardar()
    const error = motivo
    soltarHerramienta()
    if (error && error !== 'Límite de fichas') aviso(error)
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId)
  })
  canvas.addEventListener('lostpointercapture', (ev) => {
    if (gesto?.pointer === ev.pointerId) cancelar()
  })
  canvas.addEventListener('pointercancel', () => cancelar())
  canvas.addEventListener('pointerleave', ev => {
    if (!gesto && !(ev.buttons & 2)) cancelar()
  })
}
function extremosListos() {
  return !creacion || ['inicio', 'meta'].every(id => editor.armado.piezas.some(p => p.id === id))
}
function probar(repeticion = false) {
  if (!extremosListos() || !cargado || (repeticion ? fase !== 'resultado' : fase !== 'edicion')) return
  cancelar()
  herramienta = null
  if (!repeticion) {
    ultimo = structuredClone(editor.armado)
    velocidad = 1
  }
  limpiarIntento()
  sim = new Simulation(nivel, ultimo!, ++numeroIntento)
  sonido.empezar()
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
  sonido.actualizar()
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
        '></label>' + controlesVolumen(preferencias) +
        '<label>Movimiento de la interfaz <select id="pref-mov"><option value="sistema">Según el sistema</option><option value="reducido">Reducido</option><option value="completo">Completo</option></select></label>'
      : ayuda())
  if (ajustes) {
    const select = dialog.querySelector<HTMLSelectElement>('select')!
    select.value = preferencias.movimiento
    select.onchange = () => {
      preferencias.movimiento = select.value as typeof preferencias.movimiento
      movimiento()
      persistir()
    }
    dialog.querySelector<HTMLInputElement>('#pref-audio')!.onchange = preferenciaAudio
    for (const familia of familias) {
      const rango = dialog.querySelector<HTMLInputElement>('#vol-' + familia)!
      rango.oninput = () => {
        preferencias.volumenes[familia] = rango.valueAsNumber
        dialog.querySelector('#porcentaje-' + familia)!.textContent = rango.value + ' %'
        rango.setAttribute('aria-valuetext', rango.value + ' %')
        sonido.actualizar(familia)
        persistir()
      }
    }
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
  // Assistive technology can activate a button without a preceding pointer or key event.
  sonido.iniciar()
  const tool = b.dataset.tool as TipoColocable | undefined,
    a = b.dataset.action
  if (tool || b.dataset.level || (a && !['audio', 'empujar', 'repetir', 'retirar', 'deshacer', 'superior', 'encuadrar'].includes(a)))
    sonido.interfaz('navegar')
  if (b.dataset.level) {
    void abrir(nivelPorId(b.dataset.level as IdNivel))
    return
  }
  if (a?.startsWith('mesa-') || a?.startsWith('copiar-') || a?.startsWith('borrar-')) {
    const entry = biblioteca.mesas.get(a.slice(a.indexOf('-') + 1))
    if (!entry) return
    if (a.startsWith('mesa-')) void abrirCreacion(entry)
    if (a.startsWith('copiar-') && !faltantes(entry.mesa, preferencias.completados).length) {
      void abrirCreacion(biblioteca.guardar({ ...entry.mesa, nombre: 'Copia de ' + entry.mesa.nombre.slice(0, 72) }))
    }
    if (a.startsWith('borrar-')) {
      dialog.innerHTML = '<h2>¿Borrar «' + html(entry.mesa.nombre) + '»?</h2><div class="edit-tools">' + button('cerrar', 'Cancelar') + '<button id="confirmar-borrar">Borrar mesa</button></div>'
      dialog.querySelector('#confirmar-borrar')!.addEventListener('click', () => { biblioteca.borrar(entry.id); dialog.close(); void verBiblioteca() })
      dialog.showModal()
    }
    return
  }
  if (tool) {
    if (creacion && (soloLectura() || !permiteTipo(tool, preferencias.completados))) return
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
    case 'biblioteca': void verBiblioteca(); break
    case 'nueva': nombrarMesa(); break
    case 'importar': document.querySelector<HTMLInputElement>('#archivo-mesa')?.click(); break
    case 'exportar': exportarMesa(); break
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
    case 'cable': {
      if (!cargado || !creacion || soloLectura()) break
      const activar = !cableando
      cancelar(); herramienta = null; cableando = activar; editor.seleccion = null
      bandeja(); redibujar(); break
    }
    case 'trazar':
      cancelar()
      herramienta = herramienta === 'fila' ? null : 'fila'
      editor.seleccion = null
      bandeja()
      redibujar()
      break
    case 'deshacer':
      if (editor.historia.length) {
        const p = editor.armado.piezas.find(p => p.id === editor.seleccion)
        sonido.edicion('deshacer', p ? paneo(p.posicion) : 0)
      }
      editor.deshacer()
      autoguardar()
      soltarHerramienta()
      break
    case 'retirar': {
      const p = editor.armado.piezas.find(p => p.id === editor.seleccion)
      if (editor.retirar()) sonido.edicion('retirar', p ? paneo(p.posicion) : 0)
      else { sonido.interfaz('invalida'); aviso('Despejá primero el apoyo.') }
      autoguardar()
      soltarHerramienta()
      break
    }
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
  if (dialog.open || fase !== 'edicion' || !cargado) return
  if (ev.key === 'Escape') { soltarHerramienta(); return }
  const key = ev.key.toLowerCase()
  if (gesto || ev.ctrlKey || ev.altKey || ev.metaKey || soloLectura() || !['q', 'e'].includes(key)) return
  const paso = (key === 'q' ? -1 : 1) * (ev.shiftKey ? 1 : 15)
  if (herramienta && herramienta !== 'fila' && previas[0]) {
    const previa = { ...previas[0], giroY: previas[0].giroY + paso }
    previas = [previa]
    motivo = validarPieza(nivel, previa, editor.armado.piezas)
    redibujar()
    return
  }
  const p = editor.armado.piezas.find(item => item.id === editor.seleccion)
  if (p) {
    const move = { ...p, giroY: p.giroY + paso }
    if (editor.mover(move)) { sonido.edicion('girar', paneo(p.posicion)); autoguardar(); cancelar(); bandeja() }
    else { sonido.interfaz('invalida'); aviso(editor.movimiento(move).error ?? 'Separá las piezas para girar.') }
  }
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
    const intento = sim
    acumulador = consumirTiempo(acumulador, perfil.paso, () => {
      antes = ahora
      for (const e of intento.step()) {
        if (modoQA) eventos.push(e)
        sonido.evento(e, paneo)
        if (!creacion && e.tipo === 'victoria' && !preferencias.completados.includes(nivel.id)) {
          const premio = tipos.filter(t => !esClasica(t) && !permiteTipo(t, preferencias.completados) &&
            permiteTipo(t, [...preferencias.completados, nivel.id]))
          preferencias.completados.push(nivel.id)
          sonido.interfaz('premio')
          persistir()
          if (premio.length) aviso('Taller · ' + premio.map(t => nombres[t]).join(', '))
        }
      }
      ahora = intento.poses()
      return !intento.result
    })
    if (!sim.result) sonido.rodar(sim.rodaduras, paneo)
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
      sonido.resultado(sim.result === 'victoria')
      bandeja()
    }
  } else mesa.render()
}
selector()
requestAnimationFrame(fotograma)
const fixtures = import.meta.glob<{ default: { armado: Armado } }>('../qa/fixtures/*.json')
async function cargarFixture(nombre: string, rota = false, retirar?: string) {
  const load = fixtures['../qa/fixtures/' + nombre + '.json']
  if (!load) throw new Error('Montaje desconocido')
  const { armado } = (await load()).default
  if (armado.nivel === 'taller') {
    await initPhysics()
    const doc = leerMesa({ ...mesaNueva('Mesa de control'), piezas: armado.piezas, conexiones: armado.conexiones })
    creacion = { id: 'control', mesa: doc }
    await abrir(nivelTaller(doc.nombre), true)
  } else if (fase === 'seleccion' || nivel.id !== armado.nivel || errCarga)
    await abrir(nivelPorId(armado.nivel), true)
  if (!cargado) throw new Error(mensajeCarga || 'Mesa sin cargar')
  if (sim) editar()
  const copia = structuredClone(armado)
  if (rota) copia.piezas.find((p) => p.id === 'd4')!.posicion[2] -= 0.020
  editor.cargar(copia)
  if (retirar) {
    editor.seleccion = retirar
    if (!editor.retirar()) throw new Error('No se pudo retirar ' + retirar)
  }
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
      verCables: (visible: boolean) => mesa?.mostrarCables(visible),
      recorridosCable: () => mesa?.recorridosCable(),
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
        previas, motivo,
        cargado,
        error: errCarga ? mensajeCarga : null,
      }),
    },
  })
if (params.get('sesion') === 'reparar') void cargarFixture('s', true)
if (params.get('sesion') === 'inventar') void abrir(nivelPorId('taza'), true)
