// Measured at -15.2 and -15.7 LUFS integrated. Match both at -16.7 LUFS before mixing.
const pistas = [
  { archivo: 'Pregunta y Respuesta.mp3', ajusteDb: -1.5 },
  { archivo: 'Una ficha mas.mp3', ajusteDb: -1 },
]

/** One transport for the entire session. Track trim and gameplay fades never change the user's fader. */
export class Musica {
  private elemento = new Audio()
  private pista = 0
  private fallidas = new Set<number>()
  private ajuste: GainNode
  private atenuacion: GainNode

  constructor(private ctx: AudioContext, salida: GainNode) {
    this.ajuste = ctx.createGain()
    this.atenuacion = ctx.createGain()
    ctx.createMediaElementSource(this.elemento).connect(this.ajuste).connect(this.atenuacion).connect(salida)
    this.elemento.addEventListener('ended', () => this.siguiente())
    this.elemento.addEventListener('error', () => {
      if (!this.elemento.error) return
      this.fallidas.add(this.pista)
      this.siguiente()
    })
    this.cargar()
  }

  private cargar() {
    const { archivo, ajusteDb } = pistas[this.pista]
    this.ajuste.gain.value = 10 ** (ajusteDb / 20)
    this.elemento.src = import.meta.env.BASE_URL + 'music/' + encodeURIComponent(archivo)
  }
  private siguiente() {
    if (this.fallidas.size === pistas.length) return
    const otra = (this.pista + 1) % pistas.length
    this.pista = this.fallidas.has(otra) ? this.pista : otra
    this.cargar()
    this.visible(!document.hidden)
  }
  visible(visible: boolean) {
    if (!visible) this.elemento.pause()
    else if (this.elemento.paused && this.fallidas.size < pistas.length) {
      // A blocked play can be retried on the next gesture. Media errors advance via the error event.
      void this.elemento.play().catch(() => {})
    }
  }
  mezclar(enPrueba: boolean, espera = 0) {
    const ahora = this.ctx.currentTime
    const gain = this.atenuacion.gain
    const actual = gain.value
    gain.cancelScheduledValues(ahora)
    gain.setValueAtTime(actual, ahora)
    if (espera > 0) gain.setValueAtTime(actual, ahora + espera)
    gain.linearRampToValueAtTime(enPrueba ? 10 ** (-12 / 20) : 1, ahora + espera + (enPrueba ? .15 : .8))
  }
}
