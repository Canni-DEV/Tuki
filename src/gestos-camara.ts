import type { ModoCamara, MovimientoCamara, PuntoCamara } from './camara'

export function conectarCamara(canvas: HTMLCanvasElement, habilitada: () => boolean,
  modo: () => ModoCamara, mover: (movimiento: MovimientoCamara) => void, cancelarEdicion: () => void) {
  const dedos = new Map<number, PuntoCamara>(), ignorados = new Set<number>()
  let multiple = false, modoTactil: ModoCamara = 'orbitar'
  let mouse: { id: number; punto: PuntoCamara; modo: ModoCamara } | undefined
  let anterior: ReturnType<typeof par> | undefined, frame = 0
  const punto = (ev: MouseEvent) => ({ x: ev.clientX, y: ev.clientY })
  function par() {
    const [a, b] = dedos.values()
    return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, distancia: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)) }
  }
  const consumir = (ev: Event) => { ev.preventDefault(); ev.stopImmediatePropagation() }
  function aplicar(m: MovimientoCamara) {
    if (!habilitada()) { cancelar(); return }
    mover(m)
    canvas.dispatchEvent(new CustomEvent('camaracambio', { detail: m.actual }))
  }
  function actualizar() {
    cancelAnimationFrame(frame); frame = 0
    if (!anterior || dedos.size !== 2) return
    const actual = par()
    if (actual.x !== anterior.x || actual.y !== anterior.y || actual.distancia !== anterior.distancia)
      aplicar({ modo: modoTactil, anterior, actual, zoom: anterior.distancia/actual.distancia })
    anterior = dedos.size === 2 ? actual : undefined
  }
  function cancelar() {
    cancelAnimationFrame(frame); frame = 0
    const ids = [...dedos.keys(), ...(mouse ? [mouse.id] : [])]
    for (const id of dedos.keys()) ignorados.add(id)
    dedos.clear(); mouse = undefined; anterior = undefined; multiple = false
    cancelarEdicion()
    for (const id of ids) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
  }
  function empezarMouse(ev: PointerEvent) {
    mouse = { id: ev.pointerId, punto: punto(ev), modo: ev.ctrlKey ? 'desplazar' : modo() }
    cancelarEdicion()
    canvas.setPointerCapture(ev.pointerId)
  }
  canvas.addEventListener('contextmenu', ev => ev.preventDefault())
  canvas.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'touch' && ignorados.size) { ignorados.add(ev.pointerId); consumir(ev); return }
    if (!habilitada()) return
    if (ev.pointerType === 'touch') {
      actualizar()
      dedos.set(ev.pointerId, punto(ev))
      canvas.setPointerCapture(ev.pointerId)
      if (dedos.size > 1 || multiple) {
        if (!multiple) { modoTactil = modo(); cancelarEdicion() }
        multiple = true
        anterior = dedos.size === 2 ? par() : undefined
        consumir(ev)
      }
    } else if (ev.button === 2) {
      empezarMouse(ev)
      consumir(ev)
    }
  }, true)
  canvas.addEventListener('pointermove', ev => {
    if (ignorados.has(ev.pointerId)) { consumir(ev); return }
    if (!habilitada() && (dedos.size || mouse)) { cancelar(); consumir(ev); return }
    if (ev.pointerType === 'touch' && dedos.has(ev.pointerId)) {
      dedos.set(ev.pointerId, punto(ev))
      if (!multiple) return
      if (dedos.size === 2 && !frame) frame = requestAnimationFrame(actualizar)
      consumir(ev)
    } else if (ev.pointerType !== 'touch' && ev.buttons & 2 && habilitada()) {
      // Chording right while left is held produces pointermove, not pointerdown.
      if (!mouse) empezarMouse(ev)
      if (mouse!.id !== ev.pointerId) return
      aplicar({ modo: mouse!.modo, anterior: mouse!.punto, actual: punto(ev), zoom: 1 })
      if (mouse) mouse.punto = punto(ev)
      ev.preventDefault()
    } else if (mouse?.id === ev.pointerId) mouse = undefined
  }, true)
  const terminar = (ev: PointerEvent) => {
    if (ignorados.has(ev.pointerId)) {
      if (ev.type !== 'lostpointercapture') ignorados.delete(ev.pointerId)
      consumir(ev); return
    }
    if (mouse?.id === ev.pointerId) mouse = undefined
    if (!dedos.has(ev.pointerId)) return
    if (ev.type === 'pointerup') actualizar()
    else cancelarEdicion()
    dedos.delete(ev.pointerId)
    cancelAnimationFrame(frame); frame = 0
    if (multiple) consumir(ev)
    anterior = dedos.size === 2 ? par() : undefined
    if (!dedos.size) multiple = false
  }
  for (const tipo of ['pointerup','pointercancel','lostpointercapture'] as const) canvas.addEventListener(tipo, terminar, true)
  canvas.addEventListener('wheel', ev => {
    if (!habilitada()) return
    ev.preventDefault()
    actualizar(); cancelarEdicion()
    const px = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? canvas.clientHeight : 1)
    aplicar({ modo: 'orbitar', anterior: punto(ev), actual: punto(ev),
      zoom: Math.exp(Math.sign(px) * Math.min(Math.abs(px), 160) * .0018) })
  }, { passive: false })
  window.addEventListener('blur', cancelar)
  window.addEventListener('focus', () => ignorados.clear())
  // A cancelled capture can finish over a DOM control or outside the canvas.
  for (const tipo of ['pointerup', 'pointercancel'] as const) document.addEventListener(tipo, ev => {
    if (ignorados.delete(ev.pointerId)) consumir(ev)
  }, true)
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelar() })
  return { cancelar }
}
