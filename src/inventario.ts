import type { TipoColocable } from './types'
import { html, nombres } from './ui'
import { CatalogoInventario, type GestionFavoritos } from './catalogo-inventario'
import type { Favoritos } from './favoritos'

export interface OpcionInventario {
  tipo: TipoColocable
  imagen?: string
  cantidad: number
  activa: boolean
  habilitada: boolean
  categoria: string
  detalle?: string
  motivo?: string
  atajo?: number
}

export function fichaInventario(opcion: OpcionInventario, compacta = false) {
  const nombre = nombres[opcion.tipo]
  const detalle = opcion.detalle ? opcion.motivo || opcion.detalle : `× ${opcion.cantidad}`
  const descripcion = detalle + (opcion.motivo && opcion.motivo !== detalle ? ' · ' + opcion.motivo : '')
  const tecla = opcion.atajo
  return `<button type="button" class="piece${compacta ? ' compact-piece' : ''}" data-tool="${opcion.tipo}"
    aria-label="${html(nombre + ' · ' + descripcion)}" title="${html(nombre + ' · ' + descripcion)}"
    ${tecla ? `aria-keyshortcuts="${tecla}"` : ''} aria-pressed="${opcion.activa}" ${opcion.habilitada ? '' : 'disabled'}>
    <span class="piece-content">${tecla ? `<kbd aria-hidden="true">${tecla}</kbd>` : ''}
    ${opcion.imagen ? `<img alt="" src="${opcion.imagen}">` : ''}
    <span class="piece-name">${html(nombre)}</span><b>${html(detalle)}</b></span></button>`
}

function sectorCircular(indice: number, total: number) {
  if (total === 1) return 'none'
  const inicio = (indice - .5) * 2 * Math.PI / total - Math.PI / 2 + .004
  const amplitud = 2 * Math.PI / total - .008
  const puntos = ['50% 50%']
  const pasos = Math.ceil(180 / total)
  for (let paso = 0; paso <= pasos; paso++) {
    const angulo = inicio + amplitud * paso / pasos
    puntos.push(`${50 + 50 * Math.cos(angulo)}% ${50 + 50 * Math.sin(angulo)}%`)
  }
  return `polygon(${puntos.join(',')})`
}

export class MenuInventario {
  private catalogo: CatalogoInventario
  private focoAnterior?: HTMLElement
  private opciones: OpcionInventario[] = []
  private origen = { x: 0, y: 0, tactil: false }
  get abierto() { return !this.capa.hidden }
  get fijado() { return this.catalogo.fijado }
  get bloqueaMesa() { return this.abierto && !this.fijado }

  constructor(private capa: HTMLElement, private tablero: HTMLElement,
    private elegir: (tipo: TipoColocable) => void) {
    this.catalogo = new CatalogoInventario(capa, tablero, elegir)
    // Keep the entire outside gesture on this layer until its click closes it.
    capa.addEventListener('pointerdown', ev => ev.stopPropagation())
    capa.addEventListener('contextmenu', ev => ev.preventDefault())
    capa.addEventListener('click', ev => {
      if (this.catalogo.activo) return
      ev.stopPropagation()
      const boton = (ev.target as Element).closest<HTMLButtonElement>('button')
      if (boton?.disabled) return
      if (boton?.dataset.tool) {
        const tipo = boton.dataset.tool as TipoColocable
        this.cerrar(false)
        this.elegir(tipo)
      } else if (boton?.dataset.cerrarInventario !== undefined || ev.target === capa) this.cerrar()
    })
    capa.addEventListener('keydown', ev => { if (!this.catalogo.activo) this.tecla(ev) })
    window.addEventListener('resize', () => {
      if (!this.abierto || this.catalogo.activo) return
      const limite = document.querySelector('#bandeja')?.getBoundingClientRect().top ?? window.innerHeight
      this.abrir(this.opciones, this.origen.x, this.origen.y, this.origen.tactil, limite)
    })
  }

  reiniciar() {
    this.cerrar(false)
    this.catalogo.reiniciar()
  }

  actualizar(opciones: OpcionInventario[], favoritos?: Favoritos) {
    this.opciones = opciones
    this.catalogo.actualizar(opciones, favoritos)
  }

  abrir(opciones: OpcionInventario[], x: number, y: number, tactil: boolean, limiteInferior: number, gestion?: GestionFavoritos) {
    if (gestion || opciones.length > 9) { this.catalogo.abrir(opciones, gestion); return }
    this.opciones = opciones
    this.origen = { x, y, tactil }
    if (!this.abierto) this.focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const ancho = document.documentElement.clientWidth
    const alto = Math.max(44, limiteInferior - 20)
    const circular = !tactil && ancho >= 384 && alto >= 360
    this.capa.innerHTML = `<div class="inventory-menu ${circular ? 'radial-menu' : 'grid-menu'}"
      role="dialog" aria-modal="true" aria-label="Piezas disponibles">
      <button type="button" class="close-inventory" data-cerrar-inventario aria-label="Cerrar inventario">
      <span>Cerrar</span><kbd aria-hidden="true">Esc</kbd></button>
      <div class="menu-pieces">${opciones.map(o => fichaInventario(o)).join('')}</div></div>`
    const panel = this.capa.firstElementChild as HTMLElement
    this.capa.hidden = false
    if (circular) {
      panel.style.left = Math.max(12, Math.min(ancho - 372, x - 180)) + 'px'
      panel.style.top = Math.max(12, Math.min(limiteInferior - 372, y - 180)) + 'px'
      panel.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((boton, i) => {
        const angulo = i * 2 * Math.PI / opciones.length - Math.PI / 2
        boton.style.clipPath = sectorCircular(i, opciones.length)
        boton.style.setProperty('--pieza-x', 180 + 122 * Math.cos(angulo) + 'px')
        boton.style.setProperty('--pieza-y', 180 + 122 * Math.sin(angulo) + 'px')
      })
    } else {
      panel.style.width = Math.min(360, ancho - 24) + 'px'
      panel.style.maxHeight = alto + 'px'
      panel.style.left = Math.max(12, Math.min(ancho - panel.offsetWidth - 12, x - panel.offsetWidth / 2)) + 'px'
      panel.style.top = Math.max(12, limiteInferior - panel.offsetHeight - 8) + 'px'
    }
    document.querySelector('[data-action=piezas]')?.setAttribute('aria-expanded', 'true')
    const activa = panel.querySelector<HTMLButtonElement>('[aria-pressed=true]:not(:disabled)')
    const foco = activa ?? panel.querySelector<HTMLButtonElement>('[data-tool]:not(:disabled)') ?? panel.querySelector<HTMLButtonElement>('.close-inventory')
    if (foco) this.enfocar(foco)
  }

  cerrar(devolverFoco = true) {
    if (this.catalogo.activo) { this.catalogo.cerrar(devolverFoco); return }
    if (!this.abierto) return
    this.capa.hidden = true
    this.capa.innerHTML = ''
    document.querySelector('[data-action=piezas]')?.setAttribute('aria-expanded', 'false')
    if (devolverFoco) (this.focoAnterior?.isConnected ? this.focoAnterior : this.tablero).focus({ preventScroll: true })
    this.focoAnterior = undefined
  }

  private enfocar(boton: HTMLButtonElement) {
    boton.focus({ preventScroll: true })
    const panel = this.capa.querySelector<HTMLElement>('.grid-menu')
    if (!panel || boton.classList.contains('close-inventory')) return
    const ficha = boton.getBoundingClientRect()
    const cabecera = panel.querySelector('.close-inventory')!.getBoundingClientRect()
    const limite = panel.getBoundingClientRect().bottom - 8
    if (ficha.top < cabecera.bottom + 5) panel.scrollTop += ficha.top - cabecera.bottom - 5
    else if (ficha.bottom > limite) panel.scrollTop += ficha.bottom - limite
  }

  private tecla(ev: KeyboardEvent) {
    ev.stopPropagation()
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.isComposing) return
    const key = ev.key.toLowerCase()
    if (key === 'escape' || key === 't') {
      ev.preventDefault()
      if (!ev.repeat) this.cerrar()
      return
    }
    const numero = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code)?.[1]
    if (numero) {
      ev.preventDefault()
      const opcion = this.opciones.find(o => o.atajo === Number(numero))
      if (!ev.repeat && opcion?.habilitada) {
        this.cerrar(false)
        this.elegir(opcion.tipo)
      }
      return
    }
    const teclas = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Tab']
    if (!teclas.includes(ev.key)) return
    ev.preventDefault()
    const botones = [...this.capa.querySelectorAll<HTMLButtonElement>('[data-tool]:not(:disabled)'),
      this.capa.querySelector<HTMLButtonElement>('.close-inventory')!]
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
    const retroceder = ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey)
    let indice = (actual + (retroceder ? -1 : 1) + botones.length) % botones.length
    if (ev.key === 'Home') indice = 0
    if (ev.key === 'End') indice = botones.length - 1
    if (botones[indice]) this.enfocar(botones[indice])
  }
}
