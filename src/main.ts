import { formularioDispositivo, formularioSecuencia } from './configuracion-editor'
import { configurable } from './dispositivos'
import './style.css'
import { Interpolacion, PresentacionPrevia } from './presentacion'
import type { Mesa } from './scene'
import { Espacio, type Encuadre } from './espacio'
import { conectarCamara } from './gestos-camara'
import type { ModoCamara } from './camara'
import { fichaInventario, MenuInventario, type OpcionInventario } from './inventario'
import { normalizarFavoritos } from './favoritos'
import { loadModel } from './modelos'
import { aprobaciones, claveComprobacion, perfiles } from './render/aprobacion'
import { campana, variantes, nivelPorId } from './levels'
type Editor = import('./editor').Editor
import { alturasCompatibles } from './superficies-trazo'
import type { BodyPose, SimEvent } from './simulation'
type Simulation = import('./simulation').Simulation
import { Sonido } from './audio'
import { consumirTiempo } from './reloj'
import { acreditarVictoria, familias, leer, guardar, sincronizar, prefijo, disponible, type Victoria } from './progreso'
import { precargarRespuestas } from './musica'
import {
  gruposBandeja, limitePiezasTaller,
  perfil, contextoDe, esMesaLibre, puedeCablear, medidasMesa, formatosMesa, type FormatoMesa,
  type IdNivel,
  type Nivel,
  type PiezaColocada,
  type TipoColocable,
  type Armado,
  type Vec3,
} from './types'
import { comprobarEnWorker } from './validacion-taller'
import type { Creacion } from './taller'
import { permiteTipo } from './desbloqueos'
import { piezas as catalogo } from './types'
import { Biblioteca } from './biblioteca'
import { almacen, type Registro } from './almacen'
import { mostrarGuardados } from './estado-guardado'
import { GuardadoCreaciones } from './guardado-creaciones'
import { vistaBiblioteca } from './vista-biblioteca'
import { BibliotecaDesafios, type DesafioGuardado } from './biblioteca-desafios'
import type { DocumentoDesafio } from './desafios'
import { certificarEnWorker } from './certificacion'
import { descargarDocumento } from './descargas'
import { html, ayuda, audioButton, controlesVolumen, button, iconButton, portada, desafios, ajustes, proximo, nombres, nOrden, medidasDeEscenario } from './ui'

let Editor: typeof import('./runtime').Editor
let validarPieza: typeof import('./runtime').validarPieza
let initPhysics: typeof import('./runtime').initPhysics
let Simulation: typeof import('./runtime').Simulation
let armadoDeMesa: typeof import('./runtime').armadoDeMesa
let faltantes: typeof import('./runtime').faltantes
let leerMesa: typeof import('./runtime').leerMesa
let leerMesaAsync: typeof import('./runtime').leerMesaAsync
let mesaNueva: typeof import('./runtime').mesaNueva
let nivelTaller: typeof import('./runtime').nivelTaller
let actualizarSolucion: typeof import('./runtime').actualizarSolucion
let armadoSolucion: typeof import('./runtime').armadoSolucion
let desafioDesdeMesa: typeof import('./runtime').desafioDesdeMesa
let leerDesafio: typeof import('./runtime').leerDesafio
let mesaDeAutor: typeof import('./runtime').mesaDeAutor
let nivelDesafio: typeof import('./runtime').nivelDesafio
let fichaDesafio: typeof import('./runtime').fichaDesafio
let runtime: Promise<void> | undefined
function cargarRuntime() {
  return runtime ??= import('./runtime').then(modulo => {
    ({ Editor, validarPieza, initPhysics, Simulation, armadoDeMesa, faltantes, leerMesa, leerMesaAsync, mesaNueva, nivelTaller, actualizarSolucion, armadoSolucion, desafioDesdeMesa, leerDesafio, mesaDeAutor, nivelDesafio, fichaDesafio } = modulo)
  }).catch(error => { runtime = undefined; throw error })
}

const app = document.querySelector<HTMLElement>('#app')!,
  dialog = document.querySelector<HTMLDialogElement>('#dialog')!
app.innerHTML = '<div class="stage"><canvas id="mesa" tabindex="0" aria-label="Mesas de Tuki"></canvas><div id="indicador" hidden role="status"></div></div><div id="interfaz"></div><div id="carga" class="load" role="status" hidden></div><div id="inventario-rapido" class="inventory-layer" hidden></div>'
const canvas = app.querySelector<HTMLCanvasElement>('#mesa')!
const interfaz = app.querySelector<HTMLElement>('#interfaz')!
const carga = app.querySelector<HTMLElement>('#carga')!
const menuInventario = new MenuInventario(app.querySelector('#inventario-rapido')!, canvas, tipo => elegirPieza(tipo, false))
let ajusteAbierto = false, ajusteFino = false
let ultimoPuntero: { x: number; y: number } | undefined
let tactil = matchMedia('(pointer: coarse)').matches
let modoCamara: ModoCamara = 'orbitar'
let seleccionAntesDelToque: { pointer: number; seleccion: string | null } | undefined
let toqueCable: { pointer: number; x: number; y: number } | undefined
let intentoSeleccion: { pointer: number; x: number; y: number } | undefined
let recordarEdicion = false
const focoMesa = () => canvas.focus({ preventScroll: true })
const teclaDeshacer = navigator.platform.startsWith('Mac') ? 'Cmd+Z' : 'Ctrl+Z'
const teclaRehacer = navigator.platform.startsWith('Mac') ? 'Cmd+Mayús+Z' : 'Ctrl+Mayús+Z'
const teclaDuplicar = navigator.platform.startsWith('Mac') ? 'Cmd+D' : 'Ctrl+D'
let espacio: Espacio | undefined
let controlVisual: import('./render/control').ControlVisual | undefined
let pausaVisual = false, solicitudVisual = 0
let preparandoInicioCalidad = false, pausaDelRender = false, mensajeVisual = ''
let visualPendiente: {repeat:boolean}|undefined
let destino: 'inicio' | 'desafios' | 'biblioteca' | 'partida' = 'inicio'
let nivelElegido: Nivel = campana[0]
let mesaElegida: string | undefined
let repetirCarga: () => void
let pistaTrazo = false
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
type PlantillaColocacion = Pick<PiezaColocada, 'tipo' | 'giroY' | 'configuracion'> & { duplicado?: boolean }
let plantilla: PlantillaColocacion | undefined
let colocarVarias = false
let validando = false, revisionGesto = 0
let validacionGesto: AbortController | undefined
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
  alturaTrazo?: number
}
const biblioteca = new Biblioteca()
const retos = new BibliotecaDesafios()
let jugandoDesafio: DesafioGuardado | undefined, autorDesafio: DesafioGuardado | undefined
let creacion: Creacion | undefined
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
let victoria: Victoria | undefined
let clickDeInicio: { x: number; y: number; t: number } | undefined
const media = matchMedia('(prefers-reduced-motion: reduce)')
function movimiento() {
  document.documentElement.dataset.reducido = String(
    preferencias.movimiento === 'reducido' || (preferencias.movimiento === 'sistema' && media.matches),
  )
}
media.addEventListener('change', movimiento)
movimiento()
const colorSistema = matchMedia('(prefers-color-scheme: dark)')
function apariencia() {
  const oscuro = preferencias.apariencia === 'oscuro' || (preferencias.apariencia === 'sistema' && colorSistema.matches)
  document.documentElement.dataset.apariencia = oscuro ? 'oscuro' : 'claro'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#111d1b' : '#f6eedc')
  espacio?.aplicarApariencia(oscuro)
}
colorSistema.addEventListener('change', apariencia)
apariencia()
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
  recordarEdicion = false
  victoria = undefined
  mesa?.terminarReflejo()
  mesa?.marcarCompuerta()
  sonido.limpiar()
  sim?.dispose()
  sim = undefined
  acumulador = 0
  ultimaMarca = 0
  antes.clear()
  ahora.clear()
}
function cancelar() {
  intentoSeleccion = undefined
  seleccionAntesDelToque = undefined; toqueCable = undefined
  const pendiente = validando
  revisionGesto++; validando = false
  validacionGesto?.abort(); validacionGesto = undefined
  if (pendiente) bandeja()
  mesa?.limpiarInestable()
  gesto = null
  cableando = false; borneOrigen = undefined
  previas = []
  motivo = null
  indicador()
  redibujar()
}
function cancelarParaCamara() {
  intentoSeleccion = undefined
  const cambiar = !!gesto || !!seleccionAntesDelToque || !!toqueCable
  if (seleccionAntesDelToque) editor.seleccion = seleccionAntesDelToque.seleccion
  seleccionAntesDelToque = undefined; toqueCable = undefined
  if (gesto) { gesto = null; previas = []; motivo = null; indicador() }
  if (cambiar) { bandeja(); redibujar() }
}
function cambiarModoCamara(modo: ModoCamara) {
  controlesCamara.cancelar()
  modoCamara = modo
  document.querySelector('[data-action=desplazar-vista]')?.setAttribute('aria-pressed', String(modo === 'desplazar'))
  canvas.classList.toggle('desplazar-vista', modo === 'desplazar')
}
function resetVista() {
  cambiarModoCamara('orbitar')
  menuInventario.reiniciar()
  colocarVarias = false
  plantilla = undefined
  ajusteAbierto = false
  ajusteFino = false
  ultimoPuntero = undefined
  token++
  cargado = false
  errCarga = false
  cancelar()
  limpiarIntento()
  espacio?.cancelarViaje()
  mesa = undefined
  carga.hidden = true
  aviso('')
  herramienta = null
  ultimo = undefined
}
function pantalla(d: typeof destino, contenido: string) {
  const mismoDestino = destino === d
  const focoAnterior = document.activeElement as HTMLElement | null
  const identidadFoco = focoAnterior?.dataset.action ?? focoAnterior?.dataset.creacion
  const scroll = interfaz.querySelector('.creaciones')?.scrollLeft ?? 0
  const conFoco = interfaz.contains(document.activeElement)
  destino = d
  app.dataset.destino = d
  interfaz.innerHTML = contenido
  if (conFoco) {
    const foco = mismoDestino ? [...interfaz.querySelectorAll<HTMLElement>('button')].find(b => identidadFoco && (b.dataset.action ?? b.dataset.creacion) === identidadFoco) ?? interfaz.querySelector<HTMLElement>('[aria-pressed=true]') : null
    const siguiente = foco ?? interfaz.querySelector<HTMLElement>('button:not(:disabled)')
    siguiente?.focus({ preventScroll: true })
  }
  if (mismoDestino) { const lista = interfaz.querySelector('.creaciones'); if (lista) lista.scrollLeft = scroll }
  canvas.setAttribute('aria-label', 'Mesas de Tuki')
}
function falloCarga(error: unknown, reintentar: () => void) {
  repetirCarga = reintentar
  errCarga = true
  mensajeCarga = error instanceof Error ? error.message : String(error)
  carga.innerHTML = '<p>' + html(mensajeCarga) + '</p>' + button('reintentar', 'Reintentar', 'repetir', 'primary')
  carga.hidden = false
}
async function preparar(modo: Encuadre, reintentar: () => void, n?: Nivel, armado?: Armado) {
  const solicitud = token
  if(!espacio&&preferencias.visuales==='fotorealista') {
    preparandoInicioCalidad=true
    canvas.parentElement!.dataset.preparandoCalidad='true'
  }
  if (preferencias.audio) void precargarRespuestas()
  const espera = setTimeout(() => {
    if (solicitud !== token) return
    carga.textContent = 'Preparando la mesa…'
    carga.hidden = false
  }, 950)
  try {
    espacio ??= new Espacio(canvas, preferencias.proyeccionCamara)
    if(preparandoInicioCalidad){pausarVisuales(false);mostrarEstadoVisual()}
    const [visual] = await Promise.all([espacio.mostrar(modo, n, armado),
      modo === 'juego' ? initPhysics() : undefined])
    if (solicitud !== token) return
    carga.hidden = true
    if(preferencias.visuales==='fotorealista' && !controlVisual) await elegirVisuales('fotorealista')
    return visual
  } catch (error) {
    if (solicitud === token) {terminarInicioCalidad();falloCarga(error, reintentar)}
  } finally { clearTimeout(espera) }
}
async function inicio() {
  resetVista()
  jugandoDesafio = autorDesafio = undefined
  creacion = undefined
  fase = 'seleccion'
  pantalla('inicio', portada(preferencias))
  document.title = 'Tuki'
  const solicitud = token
  await preparar('inicio', inicio)
  if (solicitud === token && !errCarga) {
    const n = proximo(preferencias)
    if (n) void Promise.all(n.fijos.map(p => loadModel(p.activo))).catch(() => {})
  }
}
async function selector(n = proximo(preferencias) ?? campana[0]) {
  resetVista()
  jugandoDesafio = autorDesafio = undefined
  fase = 'seleccion'
  creacion = undefined
  nivelElegido = n
  pantalla('desafios', desafios(preferencias, n))
  interfaz.querySelector('.ficha[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  document.title = 'Desafíos · Tuki'
  await preparar('seleccion', () => selector(n), n, editores.get(n.id)?.armado)
}
function libre(n: Nivel) {
  return disponible(n, preferencias)
}
const presentacionPrevia = new PresentacionPrevia()
function redibujar(poses = fase === 'edicion' ? undefined : ahora) {
  presentacionPrevia.cancelar()
  if (!mesa || !editor || !cargado) return
  mesa.dibujar(editor.armado.piezas, fase === 'edicion' ? editor.seleccion : null, previas, motivo, poses, editor.armado.conexiones)
}
function indicador(x?: number, y?: number) {
  const el = document.querySelector<HTMLElement>('#indicador')
  if (!el) return
  const text =
    (validando ? 'Comprobando el equilibrio…' : motivo) ??
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
const guardados = mostrarGuardados()
const guardadoCreaciones = new GuardadoCreaciones(biblioteca, retos, guardados)
function autoguardar() {
  guardadoCreaciones.edicion({ editor, autor: autorDesafio, mesa: creacion, jugador: jugandoDesafio,
    soloLectura: soloLectura(), actualizarSolucion, mesaDeAutor,
    confirmado: recuperada => {
      if (recuperada) aviso('Se conservaron tus cambios en una copia recuperada.')
    },
  })
}
let importandoArchivo = false
async function verBiblioteca(id = mesaElegida) {
  if (!preferencias.completados.includes('recta')) { aviso('Completá La recta.'); return }
  resetVista()
  jugandoDesafio = autorDesafio = undefined
  const solicitud = token
  creacion = undefined
  fase = 'seleccion'
  try {
    await Promise.all([biblioteca.abrir(), retos.abrir()])
  } catch (error) {
    if (solicitud === token) aviso('El guardado local no está disponible. Podés trabajar en esta sesión y exportar tus mesas.')
  }
  if (solicitud !== token) return
  const entradas = [...biblioteca.listado.values()]
  const entry = biblioteca.listado.get(id ?? '') ?? entradas[0]
  mesaElegida = entry?.id
  document.title = 'Mis mesas · Tuki'
  pantalla('biblioteca', vistaBiblioteca(entradas, [...retos.listado.values()], retos.completados, preferencias, mesaElegida))
  interfaz.querySelector('[aria-pressed=true]')?.scrollIntoView({ block:'nearest', inline:'nearest' })
  const archivo = document.querySelector<HTMLInputElement>('#archivo-mesa')!
  archivo.onchange = async () => {
    const file = archivo.files?.[0]
    if (!file || importandoArchivo) return
    // A metadata refresh may have started since this input was rendered.
    const solicitud = token
    importandoArchivo = true
    try {
      await cargarRuntime()
      // Up to 10,000 cables with 64-character IDs, plus the ordered inputs of each receiver.
      if (file.size > 4 * 1024 * 1024) throw new Error('El archivo supera el tamaño de una mesa.')
      const datos = JSON.parse(await file.text())
      if (datos?.tipo === 'desafio') {
        let doc = leerDesafio(datos)
        if (doc.estado === 'certificado') {
          const controller = new AbortController()
          dialog.innerHTML = '<h2>Verificando desafío</h2><p role="status">Comprobando la solución…</p>' + button('cerrar','Cancelar')
          dialog.addEventListener('close', () => controller.abort(), {once:true}); dialog.showModal()
          try { doc = await certificarEnWorker(doc, controller.signal, texto => { const p = dialog.querySelector('[role=status]'); if(p) p.textContent = texto }) }
          finally { dialog.close() }
        }
        if (token !== solicitud) return
        const item = await retos.guardar(doc, doc.estado === 'borrador')
        if (token !== solicitud) return
        if (doc.estado === 'certificado') await abrirReto(item)
        else { await verBiblioteca(); mostrarAutor(item) }
        return
      }
      const doc = await leerMesaAsync(datos)
      if (token !== solicitud) return
      const item = guardadoCreaciones.nueva(doc)
      if (token === solicitud) await abrirCreacion(item)
    } catch (error) { if (token === solicitud) aviso(error instanceof SyntaxError ? 'Archivo JSON inválido.' : String((error as Error).message)) }
    finally { importandoArchivo = false; archivo.value = '' }
  }
  try {
    await cargarRuntime()
    const seleccionada = entry ? await biblioteca.cargar(entry.id) : undefined
    if (solicitud !== token) return
    const n = nivelTaller(seleccionada?.mesa.nombre ?? 'Mis mesas', seleccionada?.mesa)
    await preparar('seleccion', () => verBiblioteca(id), n, seleccionada ? armadoDeMesa(n, seleccionada.mesa) : undefined)
  } catch (error) {
    if (solicitud !== token) return
    falloCarga(error, () => verBiblioteca(id))
    if (entry) {
      const b = document.createElement('button'); b.textContent = 'Descargar archivo guardado'
      b.onclick = () => void exportarRegistro(entry.id)
      carga.append(b)
      const borrar = document.createElement('button'); borrar.textContent = 'Borrar mesa'
      borrar.onclick = () => confirmarBorrado(entry.id, 'mesa'); carga.append(borrar)
    }
  }
}
function abrirCreacion(entry: Creacion) {
  jugandoDesafio = autorDesafio = undefined
  creacion = entry
  mesaElegida = entry.id
  return abrir(nivelTaller(entry.mesa.nombre, entry.mesa))
}
async function abrirReto(entry: DesafioGuardado, pruebaAutor = false) {
  if (!['inicio','meta'].every(t=>entry.documento.instalados.some(p=>p.tipo===t))) { aviso('Instalá un inicio y una meta antes de probar.'); return }
  jugandoDesafio = { ...entry, documento: structuredClone(entry.documento) }
  autorDesafio = pruebaAutor ? entry : undefined
  creacion = undefined
  return abrir(nivelDesafio(entry.documento), true)
}
function mostrarAutor(entry: DesafioGuardado) {
  let actual = entry
  fichaDesafio(dialog, actual.documento, {
    guardar: async d => {
      await guardados.esperar()
      const siguiente = await retos.guardar(d, true, actual.id, actual.revisionGuardado)
      Object.assign(actual, siguiente)
      if (autorDesafio === entry) autorDesafio = actual
    },
    editar: d => {
      jugandoDesafio = undefined; autorDesafio = actual
      creacion = { id: actual.id, revisionGuardado: actual.revisionGuardado, mesa: mesaDeAutor(d) }
      void abrir(nivelTaller(d.nombre, creacion.mesa))
    },
    probar: () => void abrirReto(actual, true),
    exportar: d => descargarDocumento(d, d.nombre, '.tuki-desafio.json'),
  })
}
async function volverAutor() {
  if (!autorDesafio) return
  autoguardar()
  await guardados.esperar()
  if (autorDesafio) mostrarAutor(autorDesafio)
}
let copiandoCampana = false
async function copiarCampana() {
  if (copiandoCampana) return
  if (contextoDe(nivel) !== 'campana' || !preferencias.completados.includes(nivel.id) || !nivel.objetos) return
  const doc = { ...mesaNueva(nivel.nombre, nivel.formatoMesa), piezas: structuredClone(nivel.objetos),
    ordenFisico: nivel.ordenFisico ?? 'geometria', empujon: structuredClone(nivel.empujon),
    conexiones: nivel.instalacion?.conexiones.map(({mando,receptor})=>({mando,receptor})) ?? [],
    secuencias: structuredClone(nivel.instalacion?.secuencias ?? []) }
  copiandoCampana = true
  const solicitud = token
  try {
    await biblioteca.abrir()
    if (solicitud !== token) return
    const entry = await biblioteca.guardar(doc)
    if (solicitud === token) await abrirCreacion(entry)
  } finally { copiandoCampana = false }
}
let copiandoMesa = false
async function duplicarMesa(id: string) {
  if (copiandoMesa) return
  copiandoMesa = true
  const solicitud = token
  try {
    const entry = await biblioteca.cargar(id)
    if (solicitud !== token || faltantes(entry.mesa, preferencias.completados).length) return
    dialog.close()
    const copia = await biblioteca.guardar({ ...entry.mesa, nombre: 'Copia de ' + entry.mesa.nombre.slice(0, 72) })
    if (solicitud === token) await abrirCreacion(copia)
  } finally { copiandoMesa = false; bibliotecaCambio() }
}
function nombrarMesa() {
  dialog.innerHTML = '<form><h2>Nueva mesa</h2><label>Nombre de la mesa <input required maxlength="80" id="nombre-mesa" autofocus></label><label>Formato<select id="formato-mesa">' + Object.entries(formatosMesa).map(([id,m])=>'<option value="'+id+'"'+(id==='clasica'?' selected':'')+'>'+m.nombre+'</option>').join('') + '</select></label><div class="edit-tools">' +
    button('cerrar', 'Cancelar') + '<button type="submit" class="primary">Crear mesa</button></div></form>'
  dialog.querySelector('form')!.onsubmit = async event => {
    event.preventDefault()
    const nombre = dialog.querySelector('input')!.value.trim()
    if (!nombre) return
    dialog.close()
    const solicitud = token
    try {
      const entry = guardadoCreaciones.nueva(mesaNueva(nombre, dialog.querySelector<HTMLSelectElement>('#formato-mesa')!.value as FormatoMesa))
      if (solicitud === token) await abrirCreacion(entry)
    } catch (error) { aviso(String((error as Error).message)) }
  }
  if (!dialog.open) dialog.showModal()
}
function exportarMesa(entry = creacion) {
  if (!entry || faltantes(entry.mesa, preferencias.completados).length) return
  descargarDocumento(entry.mesa, entry.mesa.nombre, '.tuki.json')
}
function cabecera() {
  const indice = contextoDe(nivel) !== 'campana' || nivel.varianteDe ? '' : '<span class="numero">' + nOrden(nivel) + ' · </span>'
  return '<header class="game-head"><div class="game-id">' +
    iconButton(autorDesafio ? 'volver-autor' : contextoDe(nivel) !== 'campana' ? 'biblioteca' : 'selector',
      autorDesafio ? 'Volver al autor' : contextoDe(nivel) !== 'campana' ? 'Volver a mis mesas' : 'Volver a desafíos', 'atras') +
    '<div>' + (soloLectura() ? '<small>Taller · Solo lectura</small>' : '') + '<h1>' + indice + html(nivel.nombre) +
    '</h1></div></div><div class="cam-controls">' +
    iconButton('desplazar-vista', 'Desplazar vista', 'desplazar').replace('<button ', '<button aria-pressed="' + (modoCamara === 'desplazar') + '" ') +
    iconButton('superior', 'Vista superior', 'planta') +
    iconButton('encuadrar', 'Ver mesa', 'mesa') + ajustes() + '</div></header>'
}
let apertura: Promise<void> | undefined
function abrir(n: Nivel, interno = false) {
  const solicitud = token + 1
  apertura = entrarEnPartida(n, interno).catch(error => { if (token === solicitud) falloCarga(error, () => abrir(n, interno)) })
  return apertura
}
async function entrarEnPartida(n: Nivel, interno: boolean) {
  if (!interno && !libre(n)) return
  resetVista()
  const local = token
  carga.textContent = 'Preparando la mesa…'; carga.hidden = false
  await cargarRuntime()
  await initPhysics()
  if (local !== token) return
  fase = 'edicion'
  nivel = n
  if (contextoDe(n) === 'desafio' && jugandoDesafio) {
    editor = new Editor(n)
    if (jugandoDesafio.intento) { try { editor.cargar(jugandoDesafio.intento) } catch { aviso('El intento guardado necesita empezar de nuevo.') } }
    guardadoCreaciones.comenzar(editor)
  } else if (esMesaLibre(n) && creacion) {
    editor = new Editor(n)
    editor.cargar(armadoDeMesa(n, creacion.mesa), true)
    guardadoCreaciones.comenzar(editor)
  } else {
    creacion = undefined
    editor = editores.get(n.id) ?? new Editor(n)
    editores.set(n.id, editor)
  }
  document.title = n.nombre + ' · Tuki'
  if (contextoDe(n) === 'campana') nivelElegido = n
  pantalla('partida', cabecera() + '<footer class="tray" id="bandeja"></footer>')
  canvas.setAttribute('aria-label', 'Mesa de ' + n.nombre)
  bandeja()
  const visual = await preparar('juego', () => abrir(n, interno), n, editor.armado)
  if (local !== token || !visual) return
  mesa = visual
  cargado = true
  const gl = canvas.getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  gpu = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : ''
  bandeja()
  redibujar()
  if (controlesRapidos() && !dialog.open) focoMesa()
}
function controlesRapidos() {
  return destino === 'partida'
}
function edicionDisponible() {
  return destino === 'partida' && fase === 'edicion' && cargado && !validando && !gesto && !soloLectura()
}
function opcionesInventario(): OpcionInventario[] {
  if (soloLectura()) return []
  const favoritos = normalizarFavoritos(preferencias.favoritosTaller)
  return gruposBandeja.flatMap(grupo => grupo.tipos.filter(tipo => nivel.inventario[tipo] > 0)
    .map(tipo => ({ tipo, categoria: grupo.nombre }))).map(({ tipo, categoria }, i) => {
      const bloqueada = !!creacion && !permiteTipo(tipo, preferencias.completados)
      const motivo = bloqueada ? 'Ganá ' + nivelPorId(catalogo[tipo][2]).nombre
        : !editor.disponibles(tipo) ? (creacion && (tipo === 'inicio' || tipo === 'meta') ? 'Ya colocado'
          : creacion ? 'Límite de objetos' : 'Sin unidades') : undefined
      const atajo = esMesaLibre(nivel) ? favoritos.indexOf(tipo) + 1 : i + 1
      return { tipo, categoria, imagen: mesa?.miniatura(tipo), cantidad: editor.armado.saldo[tipo],
        detalle: creacion ? medidasDeEscenario(tipo) || 'Disponible' : undefined, motivo,
        atajo: atajo > 0 && atajo <= 9 ? atajo : undefined,
        activa: herramienta === tipo, habilitada: cargado && !validando && !motivo }
    })
}
function elegirPieza(tipo: TipoColocable, alternar = true) {
  if (!edicionDisponible() || !editor.disponibles(tipo) || (creacion && !permiteTipo(tipo, preferencias.completados))) return
  if (!menuInventario.fijado) menuInventario.cerrar(false)
  cancelar()
  herramienta = alternar && herramienta === tipo ? null : tipo
  plantilla = herramienta ? { tipo, giroY: nivel.fijos.find(p => p.rol === 'inicio')?.giroY ?? 0 } : undefined
  editor.seleccion = null
  ajusteAbierto = false
  bandeja()
  redibujar()
  if (controlesRapidos()) focoMesa()
}
function abrirInventario(desdeTeclado = false) {
  if (menuInventario.abierto) { menuInventario.cerrar(); return }
  if (!controlesRapidos() || !edicionDisponible()) return
  controlesCamara.cancelar()
  cancelar()
  const bandejaRect = document.querySelector('#bandeja')!.getBoundingClientRect()
  const botonRect = document.querySelector('[data-action=piezas]')!.getBoundingClientRect()
  const origen = desdeTeclado && ultimoPuntero ? ultimoPuntero : { x: botonRect.left + 180, y: bandejaRect.top - 188 }
  menuInventario.abrir(opcionesInventario(), origen.x, origen.y, tactil, bandejaRect.top, esMesaLibre(nivel) ? {
    favoritos: normalizarFavoritos(preferencias.favoritosTaller),
    cambiar: favoritos => { preferencias.favoritosTaller = favoritos; persistir(); bandeja() },
  } : undefined)
}
function puedeDuplicar() {
  const p = editor.armado.piezas.find(p => p.id === editor.seleccion)
  return !!p && p.tipo !== 'inicio' && p.tipo !== 'meta' && editor.disponibles(p.tipo) > 0
    && (!creacion || permiteTipo(p.tipo, preferencias.completados))
}
function duplicar() {
  if (!edicionDisponible() || !puedeDuplicar()) return
  const p = editor.armado.piezas.find(p => p.id === editor.seleccion)!
  cancelar()
  herramienta = p.tipo
  plantilla = { tipo: p.tipo, giroY: p.giroY, configuracion: structuredClone(p.configuracion), duplicado: true }
  editor.seleccion = null
  ajusteAbierto = false
  bandeja(); redibujar()
  aviso('Elegí dónde colocar la copia.')
}
function accionEspacio() {
  if (fase === 'edicion') return 'empujar'
  const siguiente = contextoDe(nivel) === 'campana' && campana.find(n => n.requiere === nivel.id)
  if (fase === 'resultado' && victoria && siguiente) return 'jugar-' + siguiente.id
  return 'editar'
}
function panelAjuste() {
  return '<div class="fine-panel" role="group" aria-label="Ajuste fino"><div class="fine-heading">' +
    '<span>' + (ajusteFino ? '0,5 mm · 1°' : '2 mm · 15°') + '</span>' +
    '<button type="button" data-action="fino" aria-pressed="' + ajusteFino + '">Fino</button>' +
    iconButton('cerrar-ajuste', 'Cerrar ajuste', 'cierre') + '</div><div class="fine-directions">' +
    button('paso-arriba', '↑', '', '', 'Mover arriba') +
    button('paso-izquierda', '←', '', '', 'Mover a la izquierda') +
    button('paso-abajo', '↓', '', '', 'Mover abajo') +
    button('paso-derecha', '→', '', '', 'Mover a la derecha') +
    '</div><div class="fine-rotation">' +
    button('giro-izquierda', '↶', '', '', 'Girar a la izquierda', 'Q') +
    button('giro-derecha', '↷', '', '', 'Girar a la derecha', 'E') + '</div></div>'
}
function ajustarPieza(accion: string, fino: boolean) {
  if (!edicionDisponible() || !mesa) return
  const giro = accion.startsWith('giro-')
  const signo = accion.endsWith('izquierda') ? -1 : 1
  const angulo = signo * (fino ? 1 : 15)
  if (giro && plantilla && herramienta && herramienta !== 'fila') {
    plantilla.giroY += angulo
    if (previas[0]) {
      previas = [{ ...previas[0], giroY: plantilla.giroY }]
      motivo = validarPieza(nivel, previas[0], editor.armado.piezas)
    }
    indicador()
    redibujar()
    return
  }
  if (herramienta || cableando) return
  const pieza = editor.armado.piezas.find(p => p.id === editor.seleccion)
  if (!pieza) return
  const paso = fino ? .0005 : .002
  const direcciones: Record<string, [number, number]> = {
    'paso-arriba': [0, paso], 'paso-abajo': [0, -paso],
    'paso-izquierda': [-paso, 0], 'paso-derecha': [paso, 0],
  }
  const propuesta = giro ? { ...pieza, giroY: pieza.giroY + angulo } :
    { ...pieza, posicion: mesa.desplazarEnVista(pieza.posicion, ...direcciones[accion]) }
  const movimiento = editor.movimiento(propuesta)
  if (movimiento.error) { aviso(movimiento.error); sonido.interfaz('invalida'); return }
  previas = movimiento.piezas
  redibujar()
  void confirmarEdicion(e => e.mover(propuesta), () => sonido.edicion(giro ? 'girar' : 'mover', paneo(pieza.posicion)))
}

// Buttons and keyboard dispatch through the same editing and simulation operations.
function accionPartida(accion: string) {
  const edicion = ['trazar', 'deshacer', 'rehacer', 'duplicar', 'colocar-varias', 'retirar', 'retirar-todas', 'seleccionar', 'ajustar', 'cerrar-ajuste', 'fino']
  const ajuste = accion.startsWith('paso-') || accion.startsWith('giro-')
  if (!edicion.includes(accion) && !ajuste && !['empujar', 'repetir', 'editar'].includes(accion)) return false
  if (accion === 'deshacer' && validando) { soltarHerramienta(); return true }
  if (destino !== 'partida' || !cargado || gesto || validando) return true
  if ((edicion.includes(accion) || ajuste) && !edicionDisponible()) return true
  if (ajuste) { ajustarPieza(accion, ajusteFino); return true }
  switch (accion) {
    case 'seleccionar': soltarHerramienta(); break
    case 'duplicar': duplicar(); break
    case 'colocar-varias':
      if (esMesaLibre(nivel)) { colocarVarias = !colocarVarias; bandeja() }
      break
    case 'ajustar': ajusteAbierto = !ajusteAbierto; bandeja(); return true
    case 'cerrar-ajuste': ajusteAbierto = false; bandeja(); break
    case 'fino': ajusteFino = !ajusteFino; bandeja(); return true
    case 'trazar':
      if (!editor.disponibles('domino')) return true
      cancelar()
      plantilla = undefined
      herramienta = herramienta === 'fila' ? null : 'fila'
      if (herramienta && !pistaTrazo) { aviso('Arrastrá para trazar'); pistaTrazo = true }
      editor.seleccion = null
      bandeja()
      redibujar()
      break
    case 'deshacer':
    case 'rehacer': {
      const pieza = editor.armado.piezas.find(p => p.id === editor.seleccion)
      if (accion === 'deshacer' ? editor.historia.length : editor.futuro.length)
        sonido.edicion('deshacer', pieza ? paneo(pieza.posicion) : 0)
      const propuesta = (accion === 'deshacer' ? editor.historia : editor.futuro).at(-1)?.armado
      if (propuesta && autorDesafio && creacion && !jugandoDesafio) {
        try { actualizarSolucion(autorDesafio.documento, { ...creacion.mesa, piezas: propuesta.piezas, conexiones: propuesta.conexiones, secuencias: propuesta.secuencias }) }
        catch (error) { aviso((error as Error).message); break }
      }
      if (accion === 'deshacer') editor.deshacer()
      else editor.rehacer()
      autoguardar()
      soltarHerramienta()
      break
    }
    case 'retirar': {
      const pieza = editor.armado.piezas.find(p => p.id === editor.seleccion)
      if (pieza) void confirmarEdicion(e => e.retirar(), () => sonido.edicion('retirar', paneo(pieza.posicion)))
      break
    }
    case 'retirar-todas':
      void confirmarEdicion(e => e.retirarTodas(), () => sonido.edicion('retirar'))
      break
    case 'empujar': probar(); break
    case 'repetir': probar(true); break
    case 'editar': editar(); break
  }
  if (controlesRapidos()) focoMesa()
  return true
}
function bandeja() {
  const el = document.querySelector<HTMLElement>('#bandeja')
  if (!el) return
  const rapido = controlesRapidos()
  const focoAccion = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.action : undefined
  el.classList.toggle('quick-tray', rapido)
  el.classList.toggle('victoria-tray', fase === 'resultado' && !!victoria)
  if (fase === 'edicion') {
    const desplazamiento = el.querySelector('.pieces')?.scrollLeft ?? 0
    const opciones = opcionesInventario()
    const taller = esMesaLibre(nivel)
    const favoritos = normalizarFavoritos(preferencias.favoritosTaller)
    const inv = taller ? (soloLectura() ? '' : favoritos.map((tipo, i) => {
      const opcion = opciones.find(o => o.tipo === tipo)
      return opcion ? fichaInventario(opcion, true)
        : '<button type="button" class="empty-favorite" data-action="piezas" aria-label="Acceso ' + (i + 1) + ' vacío; abrir piezas"><kbd>' + (i + 1) + '</kbd><span>＋</span></button>'
    }).join('')) : opciones.slice(0, 9).map(o => fichaInventario(o, true)).join('')
    const seleccionada = editor.armado.piezas.find(p => p.id === editor.seleccion)
    const editable = !!seleccionada && !soloLectura() && !herramienta && !cableando
    if (!editable) ajusteAbierto = false
    el.classList.toggle('workshop-tray', taller)
    el.innerHTML =
      '<div class="inventory">' + button('piezas', 'Piezas', '', 'inventory-trigger', 'Piezas', 'T') +
      '<span id="nombre-pieza" hidden></span><div class="pieces">' + inv + '</div>' +
      (creacion ? '<div class="tray-label">' + (soloLectura() ? 'Solo lectura · Ganá ' +
        faltantes(creacion.mesa, preferencias.completados).map(id => nivelPorId(id).nombre).join(', ')
        : editor.armado.piezas.length + ' / ' + limitePiezasTaller + ' objetos') + '</div>' : '') +
      '</div><div class="edit-tools">' +
      button('seleccionar', '', 'seleccionar', 'icon' + (!herramienta && !cableando ? ' active' : ''), 'Seleccionar') +
      button('trazar', '<span>Trazar fila</span>', 'trazar', herramienta === 'fila' ? 'active' : '', 'Trazar fila', 'F') +
      (puedeCablear(nivel) && !soloLectura() ? iconButton('cable', 'Conectar / desconectar', 'cable') : '') +
      iconButton('deshacer', 'Deshacer', 'deshacer', teclaDeshacer) +
      iconButton('rehacer', 'Rehacer', 'rehacer', teclaRehacer) +
      (taller && !soloLectura() ? iconButton('colocar-varias', 'Colocar varias', 'varias') : '') +
      (!soloLectura() ? iconButton('opciones-edicion', 'Más acciones', 'mas') : '') +
      '</div>' + button('empujar', 'Empujar', 'play', 'primary push', 'Empujar', 'Espacio') +
      (editable ? '<div class="selection-tools" role="group" aria-label="Pieza seleccionada"><span class="selection-name">' +
        html(nombres[seleccionada.tipo]) + '</span>' +
        button('ajustar', 'Ajustar', '', ajusteAbierto ? 'active' : '') +
        iconButton('duplicar', 'Duplicar pieza', 'duplicar', teclaDuplicar) +
        iconButton('retirar', 'Retirar', 'retirar', 'Supr') +
        (configurable(seleccionada.tipo) ? button('configurar-dispositivo', 'Configurar dispositivo') : '') +
        (puedeConfigurarSecuencia() ? button('configurar-secuencia', 'Configurar secuencia') : '') + '</div>' : '') +
      (cableando ? '<div class="tool-status" role="status">' + (borneOrigen ? 'Elegí el receptor' : 'Elegí el mando') + '</div>' : '') +
      (colocarVarias && !cableando ? '<div class="tool-status">Colocar varias · Escape para seleccionar</div>' : '') +
      (ajusteAbierto ? panelAjuste() : '')
    el.querySelector('.pieces')!.scrollLeft = desplazamiento
    const disponible = cargado && !validando && !soloLectura()
    for (const accion of ['seleccionar', 'trazar', 'deshacer', 'rehacer', 'duplicar', 'retirar', 'ajustar', 'colocar-varias', 'cable', 'configurar-dispositivo', 'configurar-secuencia']) {
      const boton = el.querySelector<HTMLButtonElement>('[data-action="' + accion + '"]')
      if (boton) boton.disabled = !disponible || (accion === 'trazar' && !editor.disponibles('domino'))
        || (accion === 'deshacer' && !editor.historia.length) || (accion === 'rehacer' && !editor.futuro.length)
        || (accion === 'duplicar' && !puedeDuplicar())
    }
    const push = el.querySelector<HTMLButtonElement>('[data-action=empujar]')!
    push.disabled = validando || !cargado || !extremosListos()
    if (!extremosListos()) push.title = 'Colocá un inicio y una meta'
    const botonPiezas = el.querySelector<HTMLButtonElement>('[data-action=piezas]')!
    botonPiezas.disabled = !disponible
    botonPiezas.setAttribute('aria-haspopup', 'dialog')
    botonPiezas.setAttribute('aria-controls', 'inventario-rapido')
    botonPiezas.setAttribute('aria-expanded', String(menuInventario.abierto))
    el.querySelector('[data-action=seleccionar]')!.setAttribute('aria-pressed', String(!herramienta && !cableando))
    el.querySelector('[data-action=ajustar]')?.setAttribute('aria-expanded', String(ajusteAbierto))
    el.querySelector('[data-action=cable]')?.setAttribute('aria-pressed', String(cableando))
    el.querySelector('[data-action=colocar-varias]')?.setAttribute('aria-pressed', String(colocarVarias))
    menuInventario.actualizar(opciones, favoritos)
  } else {
    const final = fase === 'resultado'
    const gano = !!victoria
    const next = contextoDe(nivel) === 'campana' && campana.find((n) => n.requiere === nivel.id)
    el.classList.remove('workshop-tray')
    if (!el.querySelector('.test-state')) {
      el.innerHTML = '<div class="test-state"><div class="tray-label"></div>' +
        '<div role="status" aria-atomic="true"><h2></h2><div class="premios"></div></div>' +
        '<p id="recordatorio-edicion" role="status" hidden></p></div><div class="result-tools"></div><button class="push"></button>'
    }
    el.querySelector('.tray-label')!.textContent = (final ? 'Resultado · Edición bloqueada' : 'Prueba en curso · Edición bloqueada') + (velocidad === .25 ? ' · Cámara lenta' : '')
    const titulo = final && victoria ? (victoria.taller ? 'Resolviste ' : 'Completaste ') + victoria.nombre
      : final ? 'Cadena detenida' : gano ? 'Meta alcanzada' : 'Prueba'
    const encabezado = el.querySelector('h2')!
    if (encabezado.textContent !== titulo) encabezado.textContent = titulo
    mostrarEstadoCircuito()
    const premios = final && victoria ? [
      victoria.desafios.length ? '<p><b>Desafíos</b> · ' + victoria.desafios.map(html).join(', ') + '</p>' : '',
      nivel.id === 'mate' && victoria.primera ? '<p>Secuencias desbloqueadas en el Taller</p>' : '',
      victoria.abreTaller ? '<p>Taller libre desbloqueado</p>' : '',
    ].join('') : ''
    const detalle = el.querySelector('.premios')!
    if (detalle.innerHTML !== premios) detalle.innerHTML = premios
    el.querySelector('.result-tools')!.innerHTML =
      (final ? button('repetir', 'Repetir', 'repetir') + iconButton('opciones-resultado', 'Opciones de reproducción', 'mas')
        : button('velocidad', velocidad === 1 ? 'Cámara lenta' : 'Velocidad normal')) +
      (final && gano && !creacion && !jugandoDesafio && !next ? button('selector', 'Desafíos', 'flecha', rapido ? '' : 'primary') : '') +
      (final && creacion && gano ? button('biblioteca', 'Mis mesas', 'mesa') : '') +
      (final && jugandoDesafio ? button(autorDesafio ? 'volver-autor' : 'biblioteca', autorDesafio ? 'Volver al autor' : 'Mis desafíos') : '') +
      (final && gano && autorDesafio && jugandoDesafio ? button('usar-solucion', 'Guardar esta solución') : '') +
      (final && gano && contextoDe(nivel) === 'campana' ? button('copiar-campana','Copiar al taller') : '') +
      (final && gano && next
        ? button(
            'jugar-' + next.id,
            'Siguiente',
            'flecha',
            'primary',
            'Siguiente',
            rapido ? 'Espacio' : '',
          )
        : '')
    const accionEditar = final ? 'Editar armado' : 'Detener y editar'
    el.querySelector('.push')!.outerHTML = button('editar', accionEditar, '',
      'primary push' + (recordarEdicion ? ' edit-reminder' : ''), accionEditar,
      rapido && accionEspacio() === 'editar' ? 'Espacio' : '')
    const recordatorio = el.querySelector<HTMLElement>('#recordatorio-edicion')!
    recordatorio.hidden = !recordarEdicion
    recordatorio.textContent = recordarEdicion
      ? 'Para modificar las piezas, elegí «' + accionEditar + '». Se recuperará el armado anterior.' : ''
    if (recordarEdicion) el.querySelector('.push')!.setAttribute('aria-describedby', recordatorio.id)
  }
  if (focoAccion) el.querySelector<HTMLButtonElement>('[data-action="' + focoAccion + '"]')?.focus({ preventScroll: true })
}
function mostrarEstadoCircuito() {
  const estado = document.querySelector('.test-state')
  if (!estado || !sim?.secuencias.size) return
  let salida = estado.querySelector('output')
  if (!salida) { salida = document.createElement('output'); estado.append(salida) }
  salida.textContent = Array.from(sim.secuencias, ([id, s]) => {
    const historial = s.aciertos.join(' → ')
    const fallo = s.error.length ? ' · Error en el paso ' + (s.aciertos.length + 1) + ' (' + s.error.join(' + ') + ')' : ''
    return id + ' · ' + s.aciertos.length + '/' + s.orden.length + (historial ? ' · ' + historial : '') + fallo
  }).join(' | ')
}
function puedeConfigurarSecuencia() {
  return creacion && !soloLectura() && preferencias.completados.includes('mate') && editor.seleccion &&
    (editor.armado.conexiones ?? []).filter(c => c.receptor === editor.seleccion).length >= 2
}
function configurarDispositivo() {
  const p = editor.armado.piezas.find(p => p.id === editor.seleccion), activo = editor
  if (!p || !configurable(p.tipo) || fase !== 'edicion' || soloLectura()) return
  formularioDispositivo(dialog, p, editor.armado.piezas, puedeCablear(nivel), propuesta => {
    if (activo === editor) void confirmarEdicion(e => e.configurarDispositivo(p.id, propuesta),
      () => { redibujar(); bandeja(); aviso('Dispositivo configurado.') }, { fallo: 'La configuración necesita espacio libre.' })
  })
}
function configurarSecuencia() {
  if (!puedeConfigurarSecuencia()) return
  const receptor = editor.seleccion!, activo = editor
  formularioSecuencia(dialog, receptor, editor.armado, mandos => {
    if (activo === editor) void confirmarEdicion(e => e.configurarSecuencia(receptor, mandos), () => aviso('Circuito guardado.'))
  })
}
function soltarHerramienta() {
  herramienta = null
  plantilla = undefined
  cancelar()
  bandeja()
}
async function confirmarEdicion(operacion: (e: Editor) => boolean, exito: () => void,
  mensaje?: {parcial?:string|null;fallo?:string}, continuar?: PlantillaColocacion) {
  validacionGesto?.abort()
  const controller = validacionGesto = new AbortController()
  const revision = ++revisionGesto, activo = editor
  const vigente = () => revision === revisionGesto && activo === editor && fase === 'edicion'
  validando = !!(creacion || nivel.objetos); indicador()
  if (validando) bandeja()
  try {
    const validada = (e: Editor) => {
      const ok = operacion(e)
      if (ok && autorDesafio && creacion && !jugandoDesafio) actualizarSolucion(autorDesafio.documento,
        { ...creacion.mesa, piezas: e.armado.piezas, conexiones: e.armado.conexiones, secuencias: e.armado.secuencias })
      return ok
    }
    const ok = creacion || nivel.objetos ? await activo.editarValidado(validada, ps => comprobarEnWorker(ps, medidasMesa(nivel), controller.signal), vigente) : operacion(activo)
    if (!vigente()) return
    const fallo = activo.fallo, propuesta = previas[0]
    soltarHerramienta()
    if (continuar && editor.disponibles(continuar.tipo) > 0) {
      plantilla = continuar; herramienta = continuar.tipo; editor.seleccion = null
      bandeja(); redibujar()
    }
    if (ok) { aviso(''); autoguardar(); exito() }
    else {
      sonido.interfaz('invalida')
      if (fallo) { aviso(fallo.mensaje); mesa?.marcarInestable(fallo.pieza,propuesta); return }
      if (mensaje?.fallo) aviso(mensaje.fallo)
    }
    if (mensaje?.parcial && mensaje.parcial !== 'Límite de fichas') aviso(mensaje.parcial)
  } catch (e) {
    if (vigente()) { soltarHerramienta(); aviso(e instanceof Error ? e.message : 'No se pudo comprobar el apoyo.') }
  } finally { if (validacionGesto === controller) validacionGesto = undefined }
}
function conectarEdicion(canvas: HTMLCanvasElement) {
  let finOrbita: { x: number, y: number } | undefined
  canvas.addEventListener('pointerup', ev => {
    if (ev.button === 2 && previas.length) finOrbita = { x: ev.clientX, y: ev.clientY }
  })
  const revisarVista = (ev: { clientX: number; clientY: number }) => {
    const p = previas[0]
    if (validando || !mesa || !p?.apoyo || !herramienta || herramienta === 'fila' || gesto) return
    motivo = mesa.previaVisible(p) ? validarPieza(nivel, p, editor.armado.piezas) : 'Girá la cámara para ver la pieza'
    indicador(ev.clientX, ev.clientY)
    redibujar()
  }
  canvas.addEventListener('wheel', revisarVista, { passive: true })
  canvas.addEventListener('camaracambio', ev => {
    const p = (ev as CustomEvent<{ x: number; y: number }>).detail
    revisarVista({ clientX: p.x, clientY: p.y })
  })
  const conectarBorne = (x: number, y: number) => {
    const id = mesa!.elegirBorne(x, y, !!borneOrigen)
    if (!id) { aviso(borneOrigen ? 'Elegí el borne del receptor.' : 'Elegí el borne de una palanca o un botón.'); return }
    if (!borneOrigen) { borneOrigen = id; bandeja(); return }
    const conectado = editor.armado.conexiones?.some(c => c.mando === borneOrigen && c.receptor === id)
    const origen = borneOrigen
    void confirmarEdicion(e => e.conectar(origen,id),() => aviso(conectado ? 'Cable desconectado.' : 'Cable conectado.'))
  }
  const drop = (ev: PointerEvent) => {
    if (menuInventario.bloqueaMesa || validando || fase !== 'edicion' || !cargado || !mesa) return
    if (ev.buttons & 2) { revisarVista(ev); return }
    if (cableando) return
    const { clientX: x, clientY: y } = ev
    if (finOrbita && previas.length && finOrbita.x === x && finOrbita.y === y) return
    finOrbita = undefined
    if (gesto?.tipo === 'fila') {
      const p = mesa.apuntar(x, y, 'domino')
      const anterior = gesto.muestras.at(-1)!, altura = gesto.alturaTrazo ?? anterior[1]
      // A roof hit at another height would also shift X/Z in an oblique view.
      // Use the accepted layer's plane and let the editor detect steps and obstacles.
      const pos = p && alturasCompatibles(p.posicion[1], altura) ? p.posicion : mesa.superficiePunto(x, y, altura)
      const muestras = pos && Math.hypot(pos[0] - anterior[0], pos[2] - anterior[2]) >= 0.002
        ? [...gesto.muestras, pos] : gesto.muestras
      const tramo = editor.trazar(muestras, gesto.apoyo)
      previas = tramo.piezas
      motivo = tramo.error
      // Keep an invalid endpoint provisional: moving back onto a valid route repairs
      // the same gesture instead of permanently freezing it at the first seam.
      if (!tramo.error) { gesto.muestras = muestras; gesto.alturaTrazo = tramo.altura }
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
      const giroY = o?.giroY ?? plantilla?.giroY ?? nivel.fijos.find(p => p.rol === 'inicio')?.giroY ?? 0
      const configuracion = o?.configuracion ?? plantilla?.configuracion
      const p = mesa.apuntar(x, y, t, o, giroY, o ? pieza => editor.movimiento(pieza).error : undefined, configuracion)
      const pos = p?.posicion ?? mesa.superficiePunto(x, y, o?.posicion[1] ?? 0)
      if (!pos) return
      const nueva: PiezaColocada = {
        id: o?.id ?? '@previa',
        tipo: t,
        ...(configuracion && { configuracion: structuredClone(configuracion) }),
        apoyo: p?.apoyo ?? '',
        posicion: pos,
        giroY,
      }
      previas = [nueva]
      if (o && p) { const move = editor.movimiento(nueva); previas = move.piezas; motivo = move.error }
      else motivo = p ? validarPieza(nivel, nueva, editor.armado.piezas) : mesa.motivoPuntero
    }
    presentacionPrevia.programar(() => { indicador(x, y); redibujar() })
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (dialog.open || menuInventario.bloqueaMesa || validando || ev.button !== 0 || soloLectura() || !mesa || !cargado || gesto) return
    if (fase !== 'edicion') {
      if (fase === 'prueba' || fase === 'resultado') {
        focoMesa()
        intentoSeleccion = { pointer: ev.pointerId, x: ev.clientX, y: ev.clientY }
      }
      return
    }
    if (controlesRapidos()) focoMesa()
    const x = ev.clientX,
      y = ev.clientY
    if (ev.pointerType === 'touch') seleccionAntesDelToque = { pointer: ev.pointerId, seleccion: editor.seleccion }
    if (cableando) {
      if (ev.pointerType === 'touch') toqueCable = { pointer: ev.pointerId, x, y }
      else conectarBorne(x, y)
      return
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
  canvas.addEventListener('pointermove', ev => {
    if (intentoSeleccion?.pointer === ev.pointerId &&
      Math.hypot(ev.clientX-intentoSeleccion.x, ev.clientY-intentoSeleccion.y) >= 10) intentoSeleccion = undefined
    drop(ev)
  })
  canvas.addEventListener('pointerup', (ev) => {
    // Wait for release: camera navigation cancels this candidate when another
    // finger joins, on wheel/right drag, cancellation or loss of focus.
    if (intentoSeleccion?.pointer === ev.pointerId) {
      const intento = intentoSeleccion; intentoSeleccion = undefined
      if (ev.button === 0 && !dialog.open && !menuInventario.bloqueaMesa && !soloLectura() &&
        (fase === 'prueba' || fase === 'resultado') && Math.hypot(ev.clientX-intento.x, ev.clientY-intento.y) < 10) {
        recordarEdicion = true
        bandeja()
      }
      return
    }
    if (seleccionAntesDelToque?.pointer === ev.pointerId) seleccionAntesDelToque = undefined
    if (toqueCable?.pointer === ev.pointerId) {
      const toque = toqueCable; toqueCable = undefined
      if (cableando && !validando && !dialog.open && Math.hypot(ev.clientX-toque.x, ev.clientY-toque.y) < 10)
        conectarBorne(ev.clientX, ev.clientY)
      return
    }
    if (ev.button !== 0 || !gesto || gesto.pointer !== ev.pointerId) return
    drop(ev)
    const {tipo} = gesto, propuestas = previas, error = motivo
    gesto = null
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId)
    if (propuestas.length && (!error || tipo === 'fila')) {
      void confirmarEdicion(e => tipo === 'colocar' || tipo === 'fila' ? e.agregar(propuestas) : e.mover(propuestas[0]),
        () => sonido.edicion(tipo,paneo(propuestas[0].posicion)),{parcial:error},
        tipo === 'colocar' && colocarVarias && plantilla && !plantilla.duplicado ? { ...plantilla } : undefined)
    } else {
      if (tipo === 'colocar' && colocarVarias && plantilla && !plantilla.duplicado) { cancelar(); bandeja() }
      else soltarHerramienta()
      if (error) { aviso(error); sonido.interfaz('invalida') }
    }
  })
  canvas.addEventListener('lostpointercapture', (ev) => {
    if (intentoSeleccion?.pointer === ev.pointerId) intentoSeleccion = undefined
    if (gesto?.pointer === ev.pointerId) cancelar()
  })
  canvas.addEventListener('pointercancel', () => cancelarParaCamara())
  canvas.addEventListener('pointerleave', ev => {
    // Touch emits pointerleave after every lift, including taps between cable ends.
    if (ev.pointerType !== 'touch' && !validando && !gesto && !(ev.buttons & 2)) cancelar()
  })
}
function extremosListos() {
  return !creacion || ['inicio', 'meta'].every(id => editor.armado.piezas.some(p => p.id === id))
}
function probar(repeticion = false) {
  if (validando || !extremosListos() || !cargado || (repeticion ? fase !== 'resultado' : fase !== 'edicion')) return
  cancelar()
  menuInventario.cerrar(false)
  ajusteAbierto = false
  herramienta = null
  plantilla = undefined
  colocarVarias = false
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
  if (!editor.armado.piezas.some(p => p.id === editor.seleccion)) editor.seleccion = null
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
function mostrarEstadoVisual() {
  const state=controlVisual?.state
  const check=aprobaciones.read(),approved=perfiles.filter(q=>check?.profiles[q]?.accepted)
  const busy=!!state?.busy||preparandoInicioCalidad
  const status=dialog.querySelector<HTMLElement>('#pref-visuales-estado')
  if(status)status.textContent=state?.message||mensajeVisual||(check?'La comprobación está guardada.':'Calidad requiere una única comprobación de Alta y Equilibrada.')
  const badge=dialog.querySelector<HTMLElement>('#pref-visuales-aprobacion')
  if(badge){
    badge.hidden=!check
    badge.textContent=check?(approved.length?'✓ Calidad comprobada · '+approved.map(q=>q==='alta'?'Alta':'Equilibrada').join(' y '):'✓ Comprobación realizada · Ningún perfil habilitado')+(aprobaciones.persistent?'':' · Solo en esta pestaña'):''
  }
  const selector=dialog.querySelector<HTMLSelectElement>('#pref-visuales')
  if(selector)selector.value=busy?'fotorealista':state?(state.active?'fotorealista':'actual'):mensajeVisual?'actual':preferencias.visuales
  const quality=dialog.querySelector<HTMLSelectElement>('#pref-calidad')
  if(quality){
    quality.value=preferencias.calidadFotorealista;quality.disabled=busy||!!check&&!approved.length
    for(const option of quality.options)option.disabled=!!check&&!approved.includes(option.value as 'alta'|'equilibrada')
  }
  const retry=dialog.querySelector<HTMLButtonElement>('#pref-visuales-reintentar')
  if(retry)retry.disabled=busy
  const first=dialog.querySelector<HTMLButtonElement>('#pref-visuales-comprobar')
  if(first){first.hidden=!!check;first.disabled=busy}
  const extra=dialog.querySelector<HTMLDetailsElement>('#pref-visuales-opciones')
  if(extra)extra.hidden=!check
  let progress=document.querySelector<HTMLElement>('#progreso-visuales')
  if(!progress){progress=document.createElement('div');progress.id='progreso-visuales';progress.setAttribute('role','status');app.append(progress)}
  progress.hidden=!busy;progress.textContent=busy?(state?.message||(document.hidden?'Calidad se preparará al volver a esta pestaña.':'Preparando Calidad…')):''
  if(busy){
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.setAttribute('aria-label','Cancelar preparación visual')
    cancel.onclick=()=>void elegirVisuales('actual');progress.append(cancel)
  }
}
function pausarVisuales(paused:boolean) {
  pausaDelRender=paused;pausaVisual=paused||preparandoInicioCalidad
  espacio?.pausarAnimaciones(pausaVisual)
  ultimaMarca=0;sonido.visible(!pausaVisual&&!document.hidden)
  canvas.parentElement!.inert=pausaVisual;interfaz.inert=pausaVisual
  document.querySelector<HTMLElement>('#inventario-rapido')!.inert=pausaVisual
  if(pausaVisual)controlesCamara.cancelar()
}
function terminarInicioCalidad() {
  preparandoInicioCalidad=false
  delete canvas.parentElement!.dataset.preparandoCalidad
  pausarVisuales(pausaDelRender)
}
async function elegirVisuales(mode: 'actual'|'fotorealista', repeat=false) {
  const request=++solicitudVisual
  mensajeVisual=''
  if(mode==='actual'){
    visualPendiente=undefined;controlVisual?.stop();pausarVisuales(false);terminarInicioCalidad()
    preferencias.visuales='actual';persistir();mostrarEstadoVisual();return
  }
  preferencias.visuales='fotorealista';persistir()
  if(document.hidden){visualPendiente={repeat};mostrarEstadoVisual();return}
  visualPendiente=undefined
  if(!espacio)return
  try {
    const {ControlVisual}=await import('./render/control')
    if(request!==solicitudVisual)return
    controlVisual??=new ControlVisual(espacio,pausarVisuales,state=>{
      if(!state.active&&!state.busy&&state.message)aviso(state.message)
      mostrarEstadoVisual()
    })
    const accepted=await controlVisual.activate(preferencias.calidadFotorealista,repeat)
    if(request!==solicitudVisual)return
    if(accepted)preferencias.calidadFotorealista=controlVisual.state.quality
    persistir();mostrarEstadoVisual()
  } catch(error) {
    if(request!==solicitudVisual)return
    mensajeVisual='No se pudo preparar Calidad. Se activó Default para esta sesión. '+String(error)
    pausarVisuales(false);aviso(mensajeVisual)
  } finally {if(request===solicitudVisual&&!visualPendiente){terminarInicioCalidad();mostrarEstadoVisual()}}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden||!visualPendiente)return
  const pending=visualPendiente;visualPendiente=undefined
  void elegirVisuales('fotorealista',pending.repeat)
})
function modal(ajustes = false) {
  controlesCamara.cancelar()
  menuInventario.cerrar(false)
  dialog.innerHTML =
    iconButton('cerrar', 'Cerrar', 'cierre') +
    (ajustes
      ? '<h2>Preferencias</h2><label>Apariencia <select id="pref-apariencia"><option value="claro">Claro</option><option value="oscuro">Oscuro</option><option value="sistema">Según el sistema</option></select></label><label>Sonido <input type="checkbox" id="pref-audio" ' +
        (preferencias.audio ? 'checked' : '') +
        '></label>' + controlesVolumen(preferencias) +
        '<label>Movimiento de la interfaz <select id="pref-mov"><option value="sistema">Según el sistema</option><option value="reducido">Reducido</option><option value="completo">Completo</option></select></label>' + button('ayuda', 'Cómo jugar', 'ayuda')
      : ayuda())
  if (ajustes) {
    const visuales=document.createElement('div')
    visuales.innerHTML='<label>Visuales <select id="pref-visuales" aria-label="Visuales"><option value="actual">Default</option><option value="fotorealista">Calidad</option></select></label><label>Perfil <select id="pref-calidad" aria-label="Perfil"><option value="alta">Alta</option><option value="equilibrada">Equilibrada</option></select></label><p id="pref-visuales-aprobacion" role="status" hidden></p><p id="pref-visuales-estado" role="status"></p><button id="pref-visuales-comprobar" type="button">Comprobar Calidad</button><details id="pref-visuales-opciones" hidden><summary>Opciones de comprobación</summary><button id="pref-visuales-reintentar" type="button">Repetir comprobación</button></details>'
    dialog.querySelector('#pref-apariencia')!.parentElement!.after(visuales)
    const camara = document.createElement('label')
    camara.innerHTML = 'Cámara <select id="pref-camara" aria-label="Cámara"><option value="ortografica">Ortográfica</option><option value="perspectiva">Perspectiva suave (30°)</option></select>'
    visuales.after(camara)
    const proyeccion = camara.querySelector('select')!
    proyeccion.value = preferencias.proyeccionCamara
    proyeccion.onchange = () => {
      preferencias.proyeccionCamara = proyeccion.value as typeof preferencias.proyeccionCamara
      espacio?.cambiarProyeccion(preferencias.proyeccionCamara)
      persistir()
    }
    visuales.querySelector<HTMLSelectElement>('#pref-visuales')!.onchange=ev=>void elegirVisuales((ev.target as HTMLSelectElement).value as 'actual'|'fotorealista')
    visuales.querySelector<HTMLSelectElement>('#pref-calidad')!.onchange=ev=>{
      preferencias.calidadFotorealista=(ev.target as HTMLSelectElement).value as 'alta'|'equilibrada';persistir()
      if(preferencias.visuales==='fotorealista')void elegirVisuales('fotorealista')
    }
    visuales.querySelector<HTMLButtonElement>('#pref-visuales-reintentar')!.onclick=()=>void elegirVisuales('fotorealista',true)
    visuales.querySelector<HTMLButtonElement>('#pref-visuales-comprobar')!.onclick=()=>void elegirVisuales('fotorealista')
    mostrarEstadoVisual()
    const aspecto = dialog.querySelector<HTMLSelectElement>('#pref-apariencia')!
    aspecto.value = preferencias.apariencia
    aspecto.onchange = () => {
      preferencias.apariencia = aspecto.value as typeof preferencias.apariencia
      apariencia()
      persistir()
    }
    const select = dialog.querySelector<HTMLSelectElement>('#pref-mov')!
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
  if (!dialog.open) dialog.showModal()
}
document.addEventListener('click', ev => { void accionClick(ev).catch(error => aviso(String((error as Error).message))) })
function confirmarBorrado(id: string, clase: 'mesa' | 'desafio') {
  const entry = (clase === 'mesa' ? biblioteca.listado : retos.listado).get(id)
  if (!entry) return
  dialog.innerHTML = '<h2>¿Borrar «' + html(entry.nombre) + '»?</h2><div class="edit-tools">' + button('cerrar', 'Cancelar') +
    '<button id="confirmar-borrar">Borrar ' + (clase === 'mesa' ? 'mesa' : 'desafío') + '</button></div>'
  dialog.querySelector<HTMLButtonElement>('#confirmar-borrar')!.onclick = async event => {
    const b = event.currentTarget as HTMLButtonElement
    b.disabled = true
    try {
      await guardados.esperar()
      if (clase === 'mesa') await biblioteca.borrar(entry)
      else await retos.borrar(entry)
      dialog.close(); await verBiblioteca()
    } catch (error) { aviso(String((error as Error).message)); b.disabled = false }
  }
  if (!dialog.open) dialog.showModal()
}
async function accionClick(ev: MouseEvent) {
  const solicitudAccion = token
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
  if (tool || b.dataset.level || (a && !['audio', 'empujar', 'repetir', 'retirar', 'retirar-todas', 'deshacer', 'superior', 'encuadrar'].includes(a)))
    sonido.interfaz('navegar')
  if (b.dataset.level) {
    const n = nivelPorId(b.dataset.level as IdNivel)
    if (!libre(n)) { aviso('Completá ' + nivelPorId(n.requiere!).nombre + '.'); return }
    void selector(n)
    return
  }
  if (a?.startsWith('variante-')) {
    const n = nivelPorId(a.slice('variante-'.length) as IdNivel)
    if (n && libre(n)) void selector(n)
    return
  }
  if (b.dataset.creacion) { void verBiblioteca(b.dataset.creacion); return }
  if (a?.startsWith('reto-')) {
    await cargarRuntime()
    if (solicitudAccion !== token) return
    const match = /^reto-(jugar|autor|exportar|solucion|borrar)-(.+)$/.exec(a)
    if (match?.[1] === 'borrar') { confirmarBorrado(match[2], 'desafio'); return }
    if (match?.[1] === 'exportar') { await exportarRegistro(match[2]); return }
    const entry = match && await retos.cargar(match[2])
    if (solicitudAccion !== token) return
    if (!entry || !match) return
    if (match[1] === 'jugar' && entry.documento.estado === 'certificado') void abrirReto(entry)
    if (match[1] === 'autor' && entry.propio) mostrarAutor(entry)
    if (match[1] === 'solucion' && retos.resuelto(entry.documento)) {
      void abrirReto({...entry,intento:armadoSolucion(entry.documento)})
    }

    return
  }
  if (dialog.open && (a?.startsWith('jugar-') || ['exportar','exportar-elegida','retirar-todas','velocidad','editar','biblioteca'].includes(a ?? ''))) dialog.close()
  if (a?.startsWith('borrar-')) { confirmarBorrado(a.slice(7), 'mesa'); return }
  if (a?.startsWith('copiar-') && a !== 'copiar-campana') { await duplicarMesa(a.slice(7)); return }
  if (a?.startsWith('mesa-')) {
    const entry = await biblioteca.cargar(a.slice(a.indexOf('-') + 1))
    if (solicitudAccion !== token) return
    if (!entry) return
    if (a.startsWith('mesa-')) void abrirCreacion(entry)
    if (dialog.open) dialog.close()


    return
  }
  if (tool) {
    elegirPieza(tool)
    return
  }
  if (a?.startsWith('jugar-')) {
    void abrir(nivelPorId(a.slice(6) as IdNivel))
    return
  }
  if ((a === 'empujar' || a === 'repetir') && ev.detail > 0)
    clickDeInicio = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp }
  if (a && accionPartida(a)) return
  switch (a) {
    case 'copiar-campana': dialog.close(); await copiarCampana(); break
    case 'crear-desafio': {
      if (!creacion || soloLectura()) break
      autoguardar()
      await guardados.esperar()
      if (solicitudAccion !== token) break
      const d = desafioDesdeMesa(creacion.mesa)
      const actual = token
      await retos.abrir()
      if (token === actual) { const entry = await retos.guardar(d); if (token === actual) mostrarAutor(entry) }
      break
    }
    case 'volver-autor': await volverAutor(); break
    case 'usar-solucion': {
      if (!autorDesafio || !jugandoDesafio || !victoria) break
      const d = autorDesafio.documento
      const next: DocumentoDesafio = {...d,revision:d.revision+1,estado:'borrador',certificacion:undefined,
        solucion:{piezas:structuredClone(editor.armado.piezas),conexiones:structuredClone(editor.armado.conexiones ?? [])}}
      await guardados.esperar()
      const guardado = await retos.guardar(next, true, autorDesafio.id, autorDesafio.revisionGuardado)
      if (solicitudAccion === token) { autorDesafio = guardado; mostrarAutor(guardado) }
      break
    }
    case 'piezas': abrirInventario(); break
    case 'configurar-dispositivo': configurarDispositivo(); break
    case 'configurar-secuencia': configurarSecuencia(); break
    case 'inicio': void inicio(); break
    case 'opciones-resultado': {
      const acciones = button('velocidad', velocidad === 1 ? 'Cámara lenta' : 'Velocidad normal') +
        (victoria && !controlesRapidos() ? button('editar', 'Editar armado') : '') +
        (victoria ? variantes.filter(v => v.varianteDe === nivel.id && libre(v))
          .map(v => button('jugar-' + v.id, v.id === 'taza-llave' ? 'Probar la llave' : 'Probar ' + v.nombre)).join('') : '') +
        (!creacion && preferencias.completados.includes('recta') ? button('biblioteca', 'Taller libre', 'mesa') : '')
      dialog.innerHTML = iconButton('cerrar', 'Cerrar', 'cierre') + '<h2>Reproducción</h2><div class="acciones">' + acciones + '</div>'
      dialog.showModal()
      break
    }
    case 'opciones-edicion':
    case 'opciones-mesa': {
      const entry = biblioteca.mesas.get(mesaElegida ?? '')
      let opciones = ''
      if (a === 'opciones-edicion') {
        opciones = button('retirar-todas', 'Retirar todas') + (creacion ? button('exportar', 'Exportar mesa') +
          button(autorDesafio ? 'volver-autor' : 'crear-desafio', autorDesafio ? 'Configurar desafío' : 'Crear desafío') : '') +
          (contextoDe(nivel) === 'campana' && preferencias.completados.includes(nivel.id) ? button('copiar-campana','Copiar al taller') : '')
      } else if (entry) {
        if (!faltantes(entry.mesa, preferencias.completados).length)
          opciones = button('copiar-' + entry.id, 'Duplicar') + button('exportar-elegida', 'Exportar mesa')
        opciones += button('borrar-' + entry.id, 'Borrar')
      }
      dialog.innerHTML = iconButton('cerrar', 'Cerrar', 'cierre') + '<h2>Acciones</h2><div class="acciones">' + opciones + '</div>'
      dialog.showModal()
      break
    }
    case 'exportar-elegida': exportarMesa(biblioteca.mesas.get(mesaElegida ?? '')); break
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
      void selector(destino === 'partida' ? nivelElegido : undefined)
      break
    case 'reintentar':
      repetirCarga?.()
      break
    case 'superior':
      controlesCamara.cancelar()
      mesa?.superior()
      break
    case 'encuadrar':
      cambiarModoCamara('orbitar')
      mesa?.encuadrar()
      break
    case 'desplazar-vista':
      if (espacio?.puedeNavegar) cambiarModoCamara(modoCamara === 'orbitar' ? 'desplazar' : 'orbitar')
      break
    case 'cable': {
      if (!edicionDisponible() || !puedeCablear(nivel)) break
      const activar = !cableando
      cancelar(); herramienta = null; plantilla = undefined; cableando = activar; editor.seleccion = null
      bandeja(); redibujar(); break
    }
    case 'velocidad':
      velocidad = velocidad === 1 ? 0.25 : 1
      bandeja()
      break
  }
}
document.addEventListener('keydown', (ev) => {
  if(pausaVisual){if(ev.key==='Escape'&&!dialog.open&&!ev.repeat){ev.preventDefault();void elegirVisuales('actual')}return}
  if (dialog.open || menuInventario.bloqueaMesa || !cargado || ev.isComposing || ev.defaultPrevented) return
  const target = ev.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable=false])')) return
  const key = ev.key.toLowerCase()
  if (key === 'escape' && fase === 'edicion') {
    ev.preventDefault()
    if (ev.repeat) return
    if (ajusteAbierto && !gesto && !herramienta) { ajusteAbierto = false; bandeja() }
    else soltarHerramienta()
    if (controlesRapidos()) focoMesa()
    return
  }
  if (controlesRapidos()) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ['z', 'y', 'd'].includes(key)) {
      const accion = key === 'd' ? 'duplicar' : key === 'y' || ev.shiftKey ? 'rehacer' : 'deshacer'
      if (fase === 'edicion' && !soloLectura()) {
        ev.preventDefault()
        if (!ev.repeat) accionPartida(accion)
      }
      return
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return
    if (ev.code === 'Space' && !target.closest('button, a, [role=button]')) {
      ev.preventDefault()
      if (ev.repeat || gesto || validando) return
      const accion = accionEspacio()
      if (accion.startsWith('jugar-')) void abrir(nivelPorId(accion.slice(6) as IdNivel))
      else accionPartida(accion)
      return
    }
    if (!edicionDisponible()) return
    const numero = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code)?.[1]
    if (numero) {
      ev.preventDefault()
      const opcion = opcionesInventario().find(o => o.atajo === Number(numero))
      if (!ev.repeat && opcion?.habilitada) elegirPieza(opcion.tipo, false)
      return
    }
    const acciones: Record<string, string> = { f: 'trazar', delete: 'retirar',
      arrowup: 'paso-arriba', arrowdown: 'paso-abajo', arrowleft: 'paso-izquierda', arrowright: 'paso-derecha' }
    if (key === 't' || acciones[key]) {
      ev.preventDefault()
      if (ev.repeat) return
      if (key === 't') abrirInventario(true)
      else if (key.startsWith('arrow')) ajustarPieza(acciones[key], ev.shiftKey)
      else accionPartida(acciones[key])
      return
    }
  }
  if (ev.ctrlKey || ev.altKey || ev.metaKey || !['q', 'e'].includes(key)) return
  if (controlesRapidos() && ev.repeat) return
  ajustarPieza(key === 'q' ? 'giro-izquierda' : 'giro-derecha', ev.shiftKey)
})

document.addEventListener('pointerdown', ev => { tactil = ev.pointerType === 'touch' }, true)
document.addEventListener('pointermove', ev => {
  ultimoPuntero = { x: ev.clientX, y: ev.clientY }
  tactil = ev.pointerType === 'touch'
})
function mostrarNombrePieza(ev: Event) {
  const etiqueta = document.querySelector<HTMLElement>('#nombre-pieza')
  if (!etiqueta) return
  const pieza = (ev.target as Element).closest<HTMLElement>('.compact-piece')
  etiqueta.hidden = !pieza
  if (pieza) etiqueta.textContent = nombres[pieza.dataset.tool as TipoColocable]
}
interfaz.addEventListener('pointerover', mostrarNombrePieza)
interfaz.addEventListener('focusin', mostrarNombrePieza)
for (const evento of ['pointerout', 'focusout']) interfaz.addEventListener(evento, () => {
  const etiqueta = document.querySelector<HTMLElement>('#nombre-pieza')
  if (etiqueta) etiqueta.hidden = true
})
document.addEventListener('visibilitychange', () => {
  ultimaMarca = 0
  mesa?.reflejoVisible(!document.hidden, performance.now())
  sonido.visible(!document.hidden)
})
const interpolacion = new Interpolacion()
let relojControlado = false
function fotograma(t: number) {
  requestAnimationFrame(fotograma)
  if (!relojControlado) actualizarFotograma(t)
}
function actualizarFotograma(t: number) {
  if(pausaVisual){ultimaMarca=0;return}
  if (document.hidden || espacio?.contextoPerdido) return
  if (!mesa || !cargado) { espacio?.render(t); return }
  if (fase === 'prueba' && sim) {
    acumulador += ultimaMarca ? Math.max(0, t - ultimaMarca) * 0.001 * velocidad : 0
    ultimaMarca = t
    const intento = sim
    let cayoMeta = false
    acumulador = consumirTiempo(acumulador, perfil.paso, () => {
      antes = ahora
      for (const e of intento.step()) {
        if (modoQA) eventos.push(e)
        sonido.evento(e, paneo)
        if (e.tipo === 'senal-ignorada') aviso('Señal anticipada: el dispositivo todavía no estaba cargado.')
        if (e.tipo === 'bloqueo') aviso(e.materialA === 'elevador' ? 'Elevador detenido: revisá el lastre y los obstáculos.' : 'La salida del dispositivo está bloqueada.')
        if (e.tipo === 'secuencia') {
          mostrarEstadoCircuito()
          if (nivel.instalacion?.secuencias) {
            const receptor = e.b.split('/')[0], estado = intento.secuencias.get(receptor)!
            mesa!.marcarCompuerta(receptor, estado.error.length ? '×' : estado.completa ? '✓' : String(estado.aciertos.length))
          }
        }
        if (e.tipo === 'victoria') {
          cayoMeta = true
          victoria = acreditarVictoria(nivel, preferencias)
          if (jugandoDesafio && !autorDesafio && jugandoDesafio.documento.estado === 'certificado') {
            victoria.primera = !retos.resuelto(jugandoDesafio.documento)
            void retos.completar(jugandoDesafio.documento).catch(error => aviso(error.message))
          }
          sonido.victoria(victoria.primera)
          mesa!.iniciarReflejo(t, victoria.primera)
          document.querySelector('#bandeja .test-state h2')!.textContent = 'Meta alcanzada'
          if (victoria.primera && !victoria.taller) persistir()
        }
      }
      ahora = intento.poses()
      mesa!.mostrarEstadosDispositivos(intento.dispositivos.estados)
      return !cayoMeta && !intento.result
    })
    if (!sim.result) sonido.rodar(sim.rodaduras, paneo)
    redibujar(sim.result || cayoMeta ? ahora : interpolacion.actualizar(antes, ahora, Math.min(1, acumulador / perfil.paso)))
    if (victoria) mesa.actualizarReflejo(t, document.documentElement.dataset.reducido === 'true', !!sim.result)
    espacio?.render(t)
    if (modoQA && !relojControlado) frames.push(performance.now() - inicioReal)
    if (sim.result) {
      duracion = performance.now() - inicioReal
      if (modoQA && !relojControlado) {
        for (let end = 1000; end <= duracion; end += 1000)
          fps.push(frames.filter((x) => x > end - 1000 && x <= end).length)
        if (duracion >= 1000) fps.push(frames.filter((x) => x > duracion - 1000 && x <= duracion).length)
      }
      fase = 'resultado'
      sonido.resultado()
      bandeja()
    }
  } else {
    if (fase === 'resultado' && victoria) mesa.actualizarReflejo(t, document.documentElement.dataset.reducido === 'true', true)
    espacio?.render(t)
  }
}
const controlesCamara = conectarCamara(canvas,
  () => destino === 'partida' && cargado && !dialog.open && !menuInventario.bloqueaMesa && !!espacio?.puedeNavegar,
  () => modoCamara, movimiento => espacio?.mover(movimiento), cancelarParaCamara)
new MutationObserver(() => { if (dialog.open) controlesCamara.cancelar() })
  .observe(dialog, { attributes: true, attributeFilter: ['open'] })
conectarEdicion(canvas)
void inicio()
requestAnimationFrame(fotograma)
async function cargarFixture(nombre: string, rota = false, retirar?: string) {
  await cargarRuntime()
  const armado = await (await import('./revision')).fixture(nombre)
  if (armado.nivel === 'taller') {
    await initPhysics()
    const doc = leerMesa({ ...mesaNueva('Mesa de control'), piezas: armado.piezas, conexiones: armado.conexiones, secuencias: armado.secuencias })
    creacion = { id: 'control', revisionGuardado: 0, mesa: doc }
    await abrir(nivelTaller(doc.nombre), true)
  } else if (fase === 'seleccion' || nivel.id !== armado.nivel || errCarga)
    await abrir(nivelPorId(armado.nivel), true)
  else if (!cargado) await apertura
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
let laboratorioRender: import('./render/laboratorio').LaboratorioRender | undefined
if (modoQA)
  (await import('./revision')).instalar({
      render: {
        entrada: () => ({ ...espacio?.estadoEntrada(), preparando:preparandoInicioCalidad, pausada:pausaVisual }),
        fotorealista: () => controlVisual?.statistics(),
        perderDispositivo: () => controlVisual?.simulateDeviceLoss(),
        grabar: (activo:boolean) => laboratorioRender?.record(activo),
        reproducir: async (backend:'actual'|'webgl2'|'webgpu',calidad:'alta'|'equilibrada',efecto:import('./render/contrato').EfectoComparacion,segundos:number) => {
          if(!laboratorioRender)throw new Error('Primero seleccioná una ruta del laboratorio.')
          relojControlado=true
          try{return await laboratorioRender.replay(backend,calidad,efecto,segundos)}finally{relojControlado=false;ultimaMarca=0}
        },
        seleccionar: async (backend: 'actual' | 'webgl2' | 'webgpu', calidad: 'alta' | 'equilibrada' = 'alta', efecto: import('./render/contrato').EfectoComparacion = 'base') => {
          if (!espacio) throw new Error('Primero cargá una mesa.')
          controlVisual?.stop()
          laboratorioRender ??= new (await import('./render/laboratorio')).LaboratorioRender(espacio)
          return laboratorioRender.select(backend, calidad, efecto)
        },
        continuo: (activo: boolean) => laboratorioRender?.forceFrames(activo),
        medir: (activo: boolean) => laboratorioRender?.measure(activo),
        estado: () => laboratorioRender?.stats(),
      },
      cargar: cargarFixture,
      avanzarHastaResultado: async () => {
        if (relojControlado) throw new Error('Ya hay un reloj de prueba activo.')
        relojControlado = true
        try {
          await (await import('./revision')).avanzarReloj(() => fase === 'prueba', actualizarFotograma, ultimaMarca || performance.now())
        } finally { relojControlado = false; ultimaMarca = 0 }
      },
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
        fase, destino, vista: espacio?.vista, modoCamara,
        camara: espacio && { proyeccion: espacio.proyeccion, distancia: espacio.camera.position.distanceTo(espacio.vista.centro),
          fov: 'fov' in espacio.camera ? espacio.camera.fov : null },
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
        futuro: editor?.futuro.length,
        herramienta, colocarVarias,
        previas, motivo,
        cargado, validando,
        error: errCarga ? mensajeCarga : null,
      }),
  })
if (params.get('sesion') === 'reparar') void cargarFixture('s', true)
if (params.get('sesion') === 'inventar') void abrir(nivelPorId('taza'), true)

async function exportarRegistro(id: string) {
  try {
    const registro = await almacen.leer<Registro<unknown>>('documentos', id)
    if (!registro) throw new Error('El archivo ya no está guardado.')
    const valor = registro.valor
    const doc = valor && typeof valor === 'object' && 'documento' in valor ? valor.documento : valor
    const nombre = doc && typeof doc === 'object' && 'nombre' in doc && typeof doc.nombre === 'string' ? doc.nombre : 'Archivo-recuperado'
    const tipo = doc && typeof doc === 'object' && 'tipo' in doc ? doc.tipo : undefined
    descargarDocumento(doc, nombre, tipo === 'desafio' ? '.tuki-desafio.json' : tipo === 'mesa' ? '.tuki.json' : '.json')
  } catch (error) { aviso(String((error as Error).message)) }
}
let actualizarBiblioteca: ReturnType<typeof setTimeout> | undefined
function bibliotecaCambio() {
  clearTimeout(actualizarBiblioteca)
  actualizarBiblioteca = setTimeout(() => {
    if (destino === 'biblioteca' && !dialog.open && !guardados.pendiente && !importandoArchivo && !copiandoMesa) void verBiblioteca()
  }, 0)
}
almacen.addEventListener('cambio', bibliotecaCambio)
dialog.addEventListener('close', bibliotecaCambio)
window.addEventListener('storage', ev => {
  if(ev.key===claveComprobacion||ev.key?.startsWith('tuki.render.aprobacion.')){mostrarEstadoVisual();return}
  if (ev.key!==null&&!ev.key.startsWith(prefijo)) return
  const oldVisuales=preferencias.visuales,oldCalidad=preferencias.calidadFotorealista
  sincronizar(preferencias); apariencia(); movimiento(); sonido.actualizar()
  espacio?.cambiarProyeccion(preferencias.proyeccionCamara)
  const selectorCamara = dialog.querySelector<HTMLSelectElement>('#pref-camara')
  if (selectorCamara) selectorCamara.value = preferencias.proyeccionCamara
  if(oldVisuales!==preferencias.visuales||oldCalidad!==preferencias.calidadFotorealista)void elegirVisuales(preferencias.visuales)
  for (const familia of familias) sonido.actualizar(familia)
  if (destino === 'partida' && cargado) bandeja()
  else if (destino === 'inicio') pantalla('inicio', portada(preferencias))
  else if (destino === 'desafios') pantalla('desafios', desafios(preferencias, nivelElegido))
  else bibliotecaCambio()
})

canvas.addEventListener('webglcontextlost', () => {
  ultimaMarca = 0; sonido.visible(false); mesa?.reflejoVisible(false, performance.now())
})
canvas.addEventListener('miniaturasvisuales',()=>{
  if(!mesa)return
  for(const image of document.querySelectorAll<HTMLImageElement>('[data-tool] img')) {
    const type=image.closest<HTMLElement>('[data-tool]')?.dataset.tool as TipoColocable|undefined
    const source=type&&mesa.miniatura(type);if(source)image.src=source
  }
})
canvas.addEventListener('webglcontextrestored', () => {
  ultimaMarca = 0; espacio?.invalidar(); sonido.visible(!document.hidden)
  mesa?.reflejoVisible(!document.hidden, performance.now())
})
