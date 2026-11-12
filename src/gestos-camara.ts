type Punto = { x: number; y: number }
export function conectarCamara(canvas: HTMLCanvasElement, habilitada: () => boolean,
  mover: (dx: number, dy: number, zoom?: number) => void, cancelarEdicion: () => void) {
  const dedos = new Map<number, Punto>()
  let multiple = false
  let orbita: Punto | undefined
  const punto = (ev: PointerEvent) => ({ x: ev.clientX, y: ev.clientY })
  const par = () => {
    const [a, b] = dedos.values()
    return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, distancia: Math.max(1, Math.hypot(a.x-b.x, a.y-b.y)) }
  }
  const consumir = (ev: PointerEvent) => { ev.preventDefault(); ev.stopImmediatePropagation() }
  canvas.addEventListener('contextmenu', ev => ev.preventDefault())
  canvas.addEventListener('pointerdown', ev => {
    if (!habilitada()) return
    if (ev.pointerType === 'touch') {
      dedos.set(ev.pointerId, punto(ev))
      canvas.setPointerCapture(ev.pointerId)
      if (dedos.size > 1) {
        multiple = true
        cancelarEdicion()
        consumir(ev)
      }
    } else if (ev.button === 2) {
      orbita = punto(ev)
      canvas.setPointerCapture(ev.pointerId)
      consumir(ev)
    }
  }, true)
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch' && dedos.has(ev.pointerId)) {
      const antes = dedos.size === 2 ? par() : undefined
      dedos.set(ev.pointerId, punto(ev))
      if (!multiple) return
      if (antes && habilitada()) {
        const despues = par()
        mover(despues.x-antes.x, despues.y-antes.y, antes.distancia/despues.distancia)
      }
      consumir(ev)
    } else if (orbita && ev.buttons & 2) {
      mover(ev.clientX-orbita.x, ev.clientY-orbita.y)
      orbita = punto(ev)
      // Let the editor recheck whether its existing placement preview is still visible.
      ev.preventDefault()
    }
  }, true)
  const terminar = (ev: PointerEvent) => {
    if (ev.button === 2 || ev.type !== 'pointerup') orbita = undefined
    if (!dedos.delete(ev.pointerId)) return
    if (multiple) consumir(ev)
    if (!dedos.size) multiple = false
  }
  for (const tipo of ['pointerup','pointercancel','lostpointercapture'] as const) canvas.addEventListener(tipo, terminar, true)
  canvas.addEventListener('wheel', ev => {
    if (!habilitada()) return
    ev.preventDefault()
    const px = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? canvas.clientHeight : 1)
    mover(0, 0, Math.exp(Math.sign(px) * Math.min(Math.abs(px), 160) * .0018))
  }, { passive: false })
}
