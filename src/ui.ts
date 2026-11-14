import marca from '../docs/arte/marca/firma.svg'
import { campana, niveles } from './levels'
import { piezas, tipos } from './types'
import { escenario } from './shapes'
import type { Nivel, TipoColocable } from './types'
import { familias, disponible, type Preferencias } from './progreso'

export function html(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
export const nombres = Object.fromEntries(tipos.map(t => [t, piezas[t][1]])) as Record<TipoColocable, string>
const cm = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
export function medidasDeEscenario(tipo: TipoColocable) {
  const tapa = escenario[piezas[tipo][0]]?.tapa
  if (!tapa) return ''
  const medidas = tapa.circular ? [tapa.ancho, tapa.altura] : [tapa.ancho, tapa.fondo, tapa.altura]
  return (tapa.circular ? 'Ø ' : '') + medidas.map(m => cm.format(m * 100)).join(' × ') + ' cm'
}
const paths: Record<string, string> = {
  desplazar: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  play: '<path d="m8 4 11 8-11 8z" fill="currentColor" stroke="none"/>',
  flecha: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  atras: '<path d="m14 6-6 6 6 6"/>',
  sonido: '<path d="m3 9 4 0 5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mudo: '<path d="m3 9 4 0 5-4v14l-5-4H3zm13 0 6 6m0-6-6 6"/>',
  ajustes:
    '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  ayuda:
    '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.5 2.2c-1 .6-1.2 1.2-1.2 2.1m0 3h.01"/>',
  candado: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  ok: '<path d="m4 12 5 5 11-11"/>',
  cierre: '<path d="m5 5 14 14m0-14L5 19"/>',
  mesa: '<path d="m3 9 9-5 9 5-9 5zm0 0v5l9 6 9-6V9"/>',
  planta: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8m-8 4h5"/>',
  trazar:
    '<path d="M3 18c2-10 5 2 9-6s6-6 9-6"/><circle cx="3" cy="18" r="1.2"/><circle cx="21" cy="6" r="1.2"/>',
  deshacer: '<path d="M9 4 4 9l5 5M5 9h9a6 6 0 0 1 0 12"/>',
  retirar: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  repetir: '<path d="M4 11a8 8 0 1 1 1.9 6M4 4v7h7"/>',
  bandera: '<path d="M5 21V4m0 1q4-3 8 0t7 0v9q-3 3-7 0t-8 0"/>',
  seleccionar: '<path d="m5 3 14 10-7 1-3 7z"/>',
}
export function ico(key: string) {
  return (
    '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths[key] +
    '</svg>'
  )
}
const teclasAria: Record<string, string> = { Espacio: 'Space', Supr: 'Delete', 'Ctrl+Z': 'Control+Z Meta+Z', 'Cmd+Z': 'Control+Z Meta+Z' }
const indicioTecla = (tecla: string) => tecla ? '<kbd aria-hidden="true">' + html(tecla) + '</kbd>' : ''
export const button = (id: string, label: string, icon = '', cls = '', nombre = '', tecla = '') =>
  '<button type="button" ' + (nombre ? 'aria-label="' + html(nombre) + '" title="' + html(nombre) + '" ' : '') +
  (tecla ? 'aria-keyshortcuts="' + (teclasAria[tecla] ?? tecla) + '" ' : '') + 'data-action="' +
  id +
  '" class="' +
  cls +
  '">' +
  (icon ? ico(icon) : '') +
  label + indicioTecla(tecla) +
  '</button>'
export const iconButton = (id: string, label: string, icon: string, tecla = '') =>
  '<button type="button" class="icon" data-action="' +
  id +
  '" title="' +
  label +
  '" aria-label="' +
  label +
  '"' + (tecla ? ' aria-keyshortcuts="' + (teclasAria[tecla] ?? tecla) + '"' : '') + '>' +
  ico(icon) + indicioTecla(tecla) +
  '</button>'
export const audioButton = (p: Preferencias) =>
  iconButton('audio', p.audio ? 'Apagar sonido' : 'Activar sonido', p.audio ? 'sonido' : 'mudo')
const etiquetas = { musica: 'Música', mesa: 'Mesa', ambiente: 'Ambiente', interfaz: 'Interfaz' }
export function controlesVolumen(p: Preferencias) {
  return familias.map(familia => {
    const valor = p.volumenes[familia]
    return `<div class="volumen"><label for="vol-${familia}">${etiquetas[familia]}</label>
      <input type="range" id="vol-${familia}" min="0" max="100" value="${valor}" aria-valuetext="${valor} %">
      <span id="porcentaje-${familia}" aria-hidden="true">${valor} %</span></div>`
  }).join('')
}
export const nOrden = (n: Nivel) => String(campana.indexOf(n) + 1).padStart(2, '0')
export const proximo = (p: Preferencias) => campana.find(n => !p.completados.includes(n.id) && disponible(n, p))
export const ajustes = () => iconButton('ajustes', 'Preferencias', 'ajustes')
export const utilidades = (p: Preferencias) => '<div class="utilities">' + audioButton(p) + ajustes() + '</div>'

function jugar(n?: Nivel) {
  return '<button class="primary jugar" data-action="' + (n ? 'jugar-' + n.id : 'selector') +
    '" aria-label="' + (n ? 'Jugar ' + html(n.nombre) : 'Jugar') + '">' + ico('play') + 'Jugar</button>'
}
export function portada(p: Preferencias) {
  const taller = p.completados.includes('recta')
  return utilidades(p) + '<section class="portada"><h1><img alt="Tuki" src="' + marca +
    '"></h1><nav class="inicio-opciones" aria-label="Inicio">' + jugar(proximo(p)) +
    '<div class="secundarias">' + button('selector', 'Desafíos', '', 'texto') +
    '<button class="texto" data-action="biblioteca"' + (taller ? '' : ' aria-disabled="true"') + '>' +
    (taller ? '' : ico('candado')) + 'Taller libre</button></div></nav></section>'
}
export function encabezado(titulo: string, p: Preferencias) {
  return '<header class="game-head"><div class="game-id">' + iconButton('inicio', 'Volver al inicio', 'atras') +
    '<h1>' + titulo + '</h1></div>' + utilidades(p) + '</header>'
}
export function desafios(p: Preferencias, n: Nivel) {
  const base = n.id === 'taza-llave' ? niveles.find(v => v.id === 'taza')! : n
  const fichas = campana.map(v => {
    const libre = disponible(v, p), hecho = p.completados.includes(v.id)
    const nombre = libre ? v.nombre : 'Bloqueado'
    return '<button data-level="' + v.id + '" class="ficha" aria-pressed="' + (base.id === v.id) +
      '" aria-label="' + nOrden(v) + ' · ' + html(nombre) + (hecho ? ', completado' : '') + '"' +
      (libre ? '' : ' data-bloqueada') + '><b>' + nOrden(v) + '</b>' +
      (libre ? hecho ? ico('ok') : '' : ico('candado')) + '</button>'
  }).join('')
  const variante = base.id === 'taza' && p.completados.includes('taza')
    ? button('variante', n.id === 'taza' ? 'La llave de paso' : 'Alrededor de la taza', '', 'alternativa') : ''
  return encabezado('Desafíos', p) + '<section class="selector"><div class="eleccion"><h2>' +
    (n.id === 'taza-llave' ? '' : nOrden(n) + ' · ') + html(n.nombre) + '</h2>' + jugar(n) + variante +
    '</div><nav aria-label="Desafíos de campaña" class="atril">' + fichas + '</nav></section>'
}

export function ayuda() {
  return '<h2>Cómo jugar</h2><ol class="help-list"><li><strong>Armá el recorrido</strong>Elegí una pieza y tocá la mesa para colocarla. Con «Trazar fila», arrastrá desde el comienzo hasta el final de la fila. En los desafíos, elegí piezas con los números de la bandeja o abrí el menú con T o «Piezas». F activa «Trazar fila». Escape cancela la herramienta o cierra el menú.</li><li><strong>Ajustá una ficha</strong>Seleccionala para moverla, girarla con el aro o retirarla. Con Q y E girás 15°. Mantené Mayús para ajustar de a 1°. En los desafíos, las flechas mueven la pieza 2 mm según la vista, o 0,5 mm con Mayús. El botón «Ajustar» ofrece esos controles y el modo «Fino» para pantalla táctil. Supr retira la pieza y Ctrl+Z o Cmd+Z deshace la última edición. «Seleccionar» vuelve al clic individual sobre la mesa.</li><li><strong>Mirá desde otro ángulo</strong>Con mouse, orbitá con el botón derecho y desplazá la vista con Ctrl + botón derecho. La rueda acerca hacia el cursor. «Desplazar vista» cambia el arrastre del derecho o de dos dedos a desplazamiento; desactivalo para volver a orbitar. En pantalla táctil, mové dos dedos para orbitar y hacé pinza para acercarte hacia su centro. «Ver mesa» recupera el encuadre inicial. El movimiento queda limitado a la mesa y sus bordes.</li><li><strong>Apilá en el Taller</strong>Los parches verdes muestran dónde apoya cada objeto. Podés hacer un puente entre cajas o dejar un libro al borde. Al soltar, se comprueba el equilibrio con todo el peso de la pila.</li><li><strong>Accioná el circuito</strong>En los desafíos, seguí el cable desde la palanca o el botón hasta el mecanismo. Golpeá la palanca de costado o presioná el botón desde arriba. En el Taller, con «Conectar / desconectar», tocá el borne dorado de una palanca o un botón y después el del receptor. Repetí el par para quitar el cable. Al ganar «La mesa del mate», seleccioná un receptor con dos o más mandos y elegí «Configurar secuencia».</li><li><strong>Empujá y observá</strong>La primera ficha recibe un solo empujón. En los desafíos, Espacio empuja durante la edición. Otra pulsación durante la caída o después de fallar vuelve a editar. Después de ganar, Espacio abre el siguiente desafío. En la última mesa o la variante, vuelve a editar. Soltá la tecla entre acciones. Los botones también permiten repetir y volver a editar.</li></ol>'
}
