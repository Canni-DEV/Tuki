import marca from '../docs/arte/marca/firma.svg'
import simbolo from '../docs/arte/marca/simbolo.svg'
import concepto from '../docs/arte/referencias/concepto-a.png'
import { campana, niveles } from './levels'
import { piezas, tipos } from './types'
import type { IdNivel, Nivel, TipoColocable } from './types'
import { familias, disponible, type Preferencias } from './progreso'

export function html(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
export const nombres = Object.fromEntries(tipos.map(t => [t, piezas[t][1]])) as Record<TipoColocable, string>
const paths: Record<string, string> = {
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
}
export function ico(key: string) {
  return (
    '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths[key] +
    '</svg>'
  )
}
export const button = (id: string, label: string, icon = '', cls = '') =>
  '<button type="button" data-action="' +
  id +
  '" class="' +
  cls +
  '">' +
  (icon ? ico(icon) : '') +
  label +
  '</button>'
export const iconButton = (id: string, label: string, icon: string) =>
  '<button type="button" class="icon" data-action="' +
  id +
  '" title="' +
  label +
  '" aria-label="' +
  label +
  '">' +
  ico(icon) +
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
export const imgMarca = marca
export const imgSimbolo = simbolo
export const nOrden = (n: Nivel) => String(campana.indexOf(n) + 1).padStart(2, '0')
export const detalle: Record<IdNivel, string> = {
  recta: 'Uní las dos fichas.',
  curva: 'Rodeá el vasito.',
  libro: 'Pasá el movimiento de una fila a una bolita.',
  taza: 'Encontrá tu camino entre libros, una taza y una canaleta.',
  vuelta: 'Llevá el movimiento detrás del libro.',
  subibaja: 'Usá una bolita para levantar otra.',
  puerta: 'Presioná el botón para que la puerta empuje una ficha.',
  puente: 'Golpeá la palanca a tiempo para bajar el puente.',
  taller: 'Armá tu propio recorrido.',
  'taza-llave': 'Una rama golpea la palanca y la otra lleva la bolita a la compuerta.',
}
export function menu(p: Preferencias) {
  const done = campana.filter((n) => p.completados.includes(n.id)).length
  const next =
    campana.find(
      (n) => !p.completados.includes(n.id) && disponible(n, p),
    ) ?? campana[0]
  const shown = p.completados.includes('taza') ? niveles : campana
  const cards = shown
    .map((n) => {
      const locked = !disponible(n, p),
        won = p.completados.includes(n.id)
      const label = locked
        ? 'Después de ' + niveles.find((v) => v.id === n.requiere)!.nombre
        : won
          ? 'Completado'
          : 'Disponible'
      return (
        '<button class="level-card" data-level="' +
        n.id +
        '" ' +
        (locked ? 'disabled' : '') +
        '><div class="card-image"><img alt="" src="' +
        import.meta.env.BASE_URL +
        'levels/' +
        n.id +
        '.webp"><span class="level-index">' +
        (n.id === 'taza-llave' ? 'VARIANTE' : 'DESAFÍO ' + nOrden(n)) +
        '</span></div><div class="card-body"><h3>' +
        n.nombre +
        '</h3><p>' +
        detalle[n.id] +
        '</p><div class="card-status">' +
        ico(locked ? 'candado' : won ? 'ok' : 'play') +
        label +
        '</div></div></button>'
      )
    })
    .join('')
  return (
    '<header class="menu-head"><div class="wrap nav"><img class="wordmark" alt="Tuki" src="' +
    marca +
    '"><nav><span class="active-tab">Desafíos</span>' +
    '<button data-action="biblioteca" ' + (p.completados.includes('recta') ? '' : 'disabled title="Ganá La recta para abrir el taller"') + '>Taller libre</button>' +
    button('ayuda', 'Cómo jugar', 'ayuda', 'nav-help') +
    '</nav><div class="utilities">' +
    audioButton(p) +
    iconButton('ajustes', 'Preferencias', 'ajustes') +
    '</div></div></header><div class="wrap menu-content"><section class="hero"><div class="hero-photo"><img src="' +
    concepto +
    '" alt="Dominós de madera pintada, libros y una taza sobre la mesa"></div><div class="hero-copy"><h1>Derribá la<br>última ficha<span>.</span></h1><p>Armá tu recorrido sobre la mesa. Un solo empujón pone toda la cadena en marcha.</p>' +
    button('jugar-' + next.id, 'Jugar ' + next.nombre, 'play', 'primary') +
    '</div></section><section class="challenges"><div class="section-title"><h2>Desafíos</h2><div class="progress-label"><span class="progress-track"><i style="width:' +
    (done * 100) / campana.length +
    '%"></i></span>' +
    done +
    ' de ' + campana.length + ' completados</div></div><div class="card-grid">' +
    cards +
    '</div></section></div>'
  )
}
export function ayuda() {
  return '<h2>Cómo jugar</h2><ol class="help-list"><li><strong>Armá el recorrido</strong>Elegí una pieza y hacé clic para colocarla. Con «Trazar fila», arrastrá desde el comienzo hasta el final de la fila.</li><li><strong>Ajustá una ficha</strong>Seleccionala para moverla, girarla con el aro o retirarla. Con Q y E girás 15°. Mantené Mayús para ajustar de a 1°. Usá el botón derecho para orbitar y la rueda para acercarte.</li><li><strong>Accioná el circuito</strong>En los desafíos, seguí el cable desde la palanca o el botón hasta el mecanismo. Golpeá la palanca de costado o presioná el botón desde arriba. En el Taller, con «Conectar / desconectar», tocá el borne dorado de una palanca o un botón y después el del receptor. Repetí el par para quitar el cable.</li><li><strong>Empujá y observá</strong>La primera ficha recibe un solo empujón. Si la cadena se corta, volvé a editar y corregí el recorrido.</li></ol>'
}
