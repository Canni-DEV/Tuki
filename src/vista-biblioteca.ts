import type { Resumen } from './almacen'
import type { Preferencias } from './progreso'
import { faltantesDeTipos } from './desbloqueos'
import { nivelPorId } from './levels'
import { limitePiezasTaller } from './types'
import { html, button, iconButton, encabezado } from './ui'

export function vistaBiblioteca(entradas: Resumen[], retos: Resumen[], completados: Set<string>, preferencias: Preferencias, elegida?: string) {
  const entry = entradas.find(e => e.id === elegida)
  const locked = entry ? faltantesDeTipos(entry.tipos ?? [], !!entry.secuencias, preferencias.completados) : []
  const fichas = entradas.map(e => '<button data-creacion="' + e.id + '" aria-pressed="' + (e.id === elegida) +
    '">' + html((e.recuperada ? 'Copia recuperada · ' : '') + e.nombre) + '</button>').join('')
  const acciones = button('nueva', 'Nueva mesa', 'mesa', entry ? '' : 'primary') + button('importar', 'Importar archivo')
  return encabezado('Mis mesas', preferencias) +
    '<input type="file" id="archivo-mesa" accept=".tuki.json,.json" hidden><section class="selector biblioteca">' +
    (entry ? '<article class="creation"><h2>' + html(entry.nombre) + '</h2><p>' + entry.objetos + ' / ' + limitePiezasTaller +
      ' objetos</p>' + (locked.length ? '<p>Para editar, completá ' + locked.map(id => nivelPorId(id).nombre).join(', ') + '.</p>' : '') +
      '<div class="acciones">' + button('mesa-' + entry.id, locked.length ? 'Ver y probar' : 'Abrir mesa', 'play', 'primary') +
      iconButton('opciones-mesa', 'Opciones de mesa', 'mas') + '</div></article><nav class="atril creaciones" aria-label="Mesas guardadas">' + fichas + '</nav>'
      : '<div class="acciones">' + acciones + '</div>') + '</section>' +
    (entry ? '<div class="gestion">' + acciones + '</div>' : '') +
    '<section class="retos-locales" aria-label="Mis desafíos"><h2>Mis desafíos</h2>' +
    ([...retos].map(e => '<article><h3>' + html((e.recuperada ? 'Copia recuperada · ' : '') + e.nombre) + '</h3><p>' +
      (e.estado === 'certificado' ? (completados.has(e.victoria ?? '') ? 'Completado' : 'Certificado') : 'Borrador') + '</p><div class="acciones">' +
      (e.estado === 'certificado' ? button('reto-jugar-' + e.id, 'Jugar', 'play') : '') +
      (e.propio ? button('reto-autor-' + e.id, 'Editar desafío') : '') + button('reto-exportar-' + e.id, 'Exportar') +
      (completados.has(e.victoria ?? '') ? button('reto-solucion-' + e.id, 'Ver solución') : '') +
      button('reto-borrar-' + e.id, 'Borrar') + '</div></article>').join('') || '<p>Podés crear un desafío desde una mesa del taller o importar uno.</p>') + '</section>'
}
