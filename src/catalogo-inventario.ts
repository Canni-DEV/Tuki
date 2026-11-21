import type { TipoColocable } from './types'
import { html, nombres } from './ui'
import { fichaInventario, type OpcionInventario } from './inventario'
import { asignarFavorito, favoritosIniciales, type Favoritos } from './favoritos'

export interface GestionFavoritos { favoritos: Favoritos; cambiar: (favoritos: Favoritos) => void }
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

/** Large inventories keep their navigation state independently of the editing tray. */
export class CatalogoInventario {
  activo = false
  private focoAnterior?: HTMLElement
  private opciones: OpcionInventario[] = []
  private gestion?: GestionFavoritos
  private busqueda = ''
  private categoria = ''
  private desplazamiento = 0
  private fijar = false
  private editarAccesos = false
  private get escritorio() { return innerWidth >= 960 && innerHeight >= 600 }
  get fijado() { return this.activo && !!this.gestion && this.fijar && this.escritorio }

  constructor(private capa: HTMLElement, private tablero: HTMLElement, private elegir: (t: TipoColocable) => void) {
    capa.addEventListener('click', ev => {
      if (!this.activo) return
      // Do not let the small-inventory listener process this click after closing.
      ev.stopImmediatePropagation()
      const boton = (ev.target as Element).closest<HTMLButtonElement>('button')
      if (boton?.disabled) return
      if (boton?.dataset.tool) this.seleccionar(boton.dataset.tool as TipoColocable)
      else if (boton?.dataset.cerrarInventario !== undefined || ev.target === capa) this.cerrar()
      else if (boton?.dataset.fijar !== undefined) { this.fijar = !this.fijar; this.posicionar() }
      else if (boton?.dataset.editarAccesos !== undefined) {
        this.editarAccesos = !this.editarAccesos
        boton.setAttribute('aria-pressed', String(this.editarAccesos))
        this.capa.querySelector<HTMLElement>('[data-restaurar]')!.hidden = !this.editarAccesos
        this.dibujarPiezas()
      } else if (boton?.dataset.restaurar !== undefined) this.cambiarFavoritos([...favoritosIniciales])
    })
    capa.addEventListener('input', ev => {
      if (!this.activo || !(ev.target as HTMLElement).matches('[data-buscar]')) return
      this.busqueda = (ev.target as HTMLInputElement).value
      this.desplazamiento = 0
      this.dibujarPiezas(false)
      this.posicionar()
    })
    capa.addEventListener('change', ev => {
      if (!this.activo) return
      const select = ev.target as HTMLSelectElement
      if (select.matches('[data-categoria]')) {
        this.categoria = select.value; this.desplazamiento = 0
        this.dibujarPiezas(false); this.posicionar()
      } else if (select.dataset.favorito && this.gestion) {
        const tipo = select.dataset.favorito as TipoColocable
        this.cambiarFavoritos(select.value === ''
          ? asignarFavorito(this.gestion.favoritos, this.gestion.favoritos.indexOf(tipo), null)
          : asignarFavorito(this.gestion.favoritos, Number(select.value), tipo))
      }
    })
    capa.addEventListener('keydown', ev => {
      if (!this.activo) return
      ev.stopImmediatePropagation()
      this.tecla(ev)
    })
    window.addEventListener('resize', () => this.posicionar())
    window.visualViewport?.addEventListener('resize', () => this.posicionar())
    window.visualViewport?.addEventListener('scroll', () => this.posicionar())
  }

  reiniciar() {
    this.cerrar(false)
    this.busqueda = ''; this.categoria = ''; this.desplazamiento = 0
    this.fijar = false; this.editarAccesos = false
  }

  actualizar(opciones: OpcionInventario[], favoritos?: Favoritos) {
    this.opciones = opciones
    if (favoritos && this.gestion) this.gestion.favoritos = favoritos
    if (this.activo) { this.dibujarPiezas(); this.posicionar() }
  }

  abrir(opciones: OpcionInventario[], gestion?: GestionFavoritos) {
    this.opciones = opciones; this.gestion = gestion
    this.focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const categorias = [...new Set(opciones.map(o => o.categoria))]
    this.capa.innerHTML = `<div class="inventory-menu grid-menu catalog-menu" role="dialog" aria-label="Piezas disponibles">
      <div class="inventory-heading"><strong>Piezas</strong>
        ${gestion ? '<button type="button" data-fijar aria-label="Fijar catálogo">Fijar</button>' : ''}
        <button type="button" class="close-catalog" data-cerrar-inventario aria-label="Cerrar inventario">Cerrar <kbd aria-hidden="true">Esc</kbd></button>
      </div><div class="catalog-filters">
        <input type="search" data-buscar aria-label="Buscar piezas" placeholder="Buscar piezas…" value="${html(this.busqueda)}">
        <select data-categoria aria-label="Categoría"><option value="">Todas las categorías</option>${categorias.map(c => `<option${c === this.categoria ? ' selected' : ''}>${html(c)}</option>`).join('')}</select>
        ${gestion ? `<div class="catalog-customize"><button type="button" data-editar-accesos aria-pressed="${this.editarAccesos}">Editar accesos</button><button type="button" data-restaurar ${this.editarAccesos ? '' : 'hidden'}>Restaurar favoritos</button></div>` : ''}
      </div><div class="menu-pieces"></div><p class="catalog-empty" role="status" hidden>No hay piezas que coincidan.</p></div>`
    this.activo = true; this.capa.hidden = false
    this.dibujarPiezas(); this.posicionar()
    document.querySelector('[data-action=piezas]')?.setAttribute('aria-expanded', 'true')
    // Keep the saved scroll and avoid opening the virtual keyboard automatically.
    this.capa.querySelector<HTMLElement>('[data-cerrar-inventario]')!.focus({ preventScroll: true })
  }

  private dibujarPiezas(conservarScroll = true) {
    const lista = this.capa.querySelector<HTMLElement>('.menu-pieces')
    if (!lista) return
    const foco = document.activeElement as HTMLElement
    const restaurar = lista.contains(foco)
    const tipoFoco = foco?.dataset.tool ?? foco?.dataset.favorito
    const selectorFoco = foco?.matches('select') ? 'data-favorito' : 'data-tool'
    const consulta = normalizar(this.busqueda).trim().split(/\s+/)
    const visibles = this.opciones.filter(o => (!this.categoria || this.categoria === o.categoria)
      && consulta.every(q => normalizar(`${nombres[o.tipo]} ${o.categoria}`).includes(q)))
    const scroll = conservarScroll ? this.desplazamiento : 0
    lista.innerHTML = visibles.map(o => {
      const lugar = this.gestion?.favoritos.indexOf(o.tipo) ?? -1
      return `<div class="catalog-card">${fichaInventario(o)}${this.gestion && this.editarAccesos ?
        `<label class="favorite-control">Acceso rápido<select data-favorito="${o.tipo}" aria-label="Acceso rápido para ${html(nombres[o.tipo])}">
        <option value=""${lugar === -1 ? ' selected' : ''}>Sin acceso</option>${this.gestion.favoritos.map((tipo, i) =>
          `<option value="${i}"${lugar === i ? ' selected' : ''}>${i + 1} · ${tipo ? html(nombres[tipo]) : 'Vacío'}</option>`).join('')}</select></label>` : ''}</div>`
    }).join('')
    this.capa.querySelector<HTMLElement>('.catalog-empty')!.hidden = visibles.length > 0
    lista.scrollTop = scroll
    lista.onscroll = () => { this.desplazamiento = lista.scrollTop }
    if (restaurar && tipoFoco) lista.querySelector<HTMLElement>(`[${selectorFoco}="${tipoFoco}"]`)?.focus({ preventScroll: true })
  }

  private posicionar() {
    if (!this.activo) return
    const panel = this.capa.firstElementChild as HTMLElement
    const ancho = document.documentElement.clientWidth
    const viewport = window.visualViewport
    const arriba = viewport?.offsetTop ?? 0
    const fondo = arriba + (viewport?.height ?? innerHeight)
    panel.classList.toggle('compact-catalog', fondo - arriba < 500)
    const limite = Math.min(document.querySelector('#bandeja')?.getBoundingClientRect().top ?? fondo, fondo)
    panel.style.cssText = ''
    const eraFijado = this.capa.classList.contains('inventory-pinned')
    this.capa.classList.toggle('inventory-pinned', this.fijado)
    panel.setAttribute('aria-modal', String(!this.fijado))
    if (eraFijado && !this.fijado && !panel.contains(document.activeElement)) {
      panel.querySelector<HTMLElement>('[data-cerrar-inventario]')!.focus({ preventScroll: true })
    }
    const pin = panel.querySelector<HTMLButtonElement>('[data-fijar]')
    if (pin) { pin.hidden = !this.escritorio; pin.setAttribute('aria-pressed', String(this.fijado)) }
    panel.style.width = Math.min(this.escritorio ? 380 : 360, ancho - 24) + 'px'
    if (this.escritorio) {
      const cabecera = document.querySelector('.game-head')?.getBoundingClientRect().bottom ?? 80
      panel.style.left = '12px'; panel.style.top = cabecera + 12 + 'px'
      panel.style.maxHeight = Math.max(120, limite - cabecera - 24) + 'px'
    } else {
      // A modal sheet may cover the tray. On a short landscape viewport the
      // filters must not squeeze the scroll area below one complete card.
      const visible = fondo - arriba
      panel.style.maxHeight = Math.max(44, Math.min(visible - 24, visible < 500 ? visible : visible * .75)) + 'px'
      panel.style.left = (ancho - panel.offsetWidth) / 2 + 'px'
      panel.style.top = Math.max(arriba + 12, fondo - panel.offsetHeight - 12) + 'px'
    }
  }

  cerrar(devolverFoco = true) {
    if (!this.activo) return
    this.activo = false; this.capa.hidden = true; this.capa.innerHTML = ''
    this.capa.classList.remove('inventory-pinned')
    document.querySelector('[data-action=piezas]')?.setAttribute('aria-expanded', 'false')
    if (devolverFoco) (this.focoAnterior?.isConnected ? this.focoAnterior : this.tablero).focus({ preventScroll: true })
    this.focoAnterior = undefined
  }

  private seleccionar(tipo: TipoColocable) {
    if (!this.opciones.find(o => o.tipo === tipo)?.habilitada) return
    if (!this.fijado) this.cerrar(false)
    this.elegir(tipo)
  }

  private cambiarFavoritos(favoritos: Favoritos) {
    if (!this.gestion) return
    this.gestion.favoritos = favoritos
    this.gestion.cambiar(favoritos)
  }

  private tecla(ev: KeyboardEvent) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return
    const campo = (ev.target as HTMLElement).matches('input, select, textarea')
    const key = ev.key.toLowerCase()
    if (key === 'escape' || (!campo && key === 't')) {
      ev.preventDefault(); if (!ev.repeat) this.cerrar(); return
    }
    if (campo && ev.key !== 'Tab') return
    const numero = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code)?.[1]
    if (numero) {
      ev.preventDefault()
      const opcion = this.opciones.find(o => o.atajo === Number(numero))
      if (!ev.repeat && opcion?.habilitada) this.seleccionar(opcion.tipo)
      return
    }
    if (ev.key === 'Tab' && this.fijado) return
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Tab'].includes(ev.key)) return
    ev.preventDefault()
    const botones = [...this.capa.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')]
      .filter(e => !e.hidden && e.getClientRects().length)
    const actual = botones.indexOf(document.activeElement as HTMLElement)
    const retroceder = ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey)
    let indice = (actual + (retroceder ? -1 : 1) + botones.length) % botones.length
    if (ev.key === 'Home') indice = 0
    if (ev.key === 'End') indice = botones.length - 1
    botones[indice]?.focus({ preventScroll: true })
    botones[indice]?.scrollIntoView({ block: 'nearest' })
  }
}
