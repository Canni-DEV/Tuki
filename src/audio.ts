import { Musica } from './musica'
import { familias, type Familia, type Preferencias } from './progreso'
import type { Rodadura, SimEvent } from './simulation'
import type { Vec3 } from './types'

// Frequency, decay in seconds, noise proportion and final pitch ratio.
type Timbre = readonly [number, number, number, number]
const timbres = {
  colocar: [600, .045, .35, .72], fila: [780, .105, .68, .46],
  mover: [380, .09, .86, .72], girar: [510, .065, .75, 1.22],
  retirar: [460, .06, .45, 1.35], deshacer: [490, .085, .32, .53],
  empujon: [230, .048, .7, .65], domino: [690, .049, .46, .70],
  mesa: [235, .085, .56, .62], libro: [175, .039, .83, .55],
  ceramica: [1780, .22, .06, .994], vidrio: [1340, .082, .15, .91], aterrizaje: [790, .065, .39, .74],
  cuna: [810, .035, .59, 1.13], canal: [970, .088, .32, .92],
  embudo: [1190, .115, .34, .93], bandeja: [180, .098, .38, .75],
  llave: [1480, .03, .43, .62], pestillo: [1040, .052, .6, .50],
  tablero: [210, .12, .59, .70], pendulo: [510, .105, .25, .91],
  balancin: [385, .071, .51, .70], navegar: [680, .026, .22, .86],
  invalida: [275, .081, .30, .68], premio: [985, .115, .13, 1.30],
  firma1: [570, .085, .38, .64], firma2: [790, .055, .38, .64],
} as const satisfies Record<string, Timbre>
type Efecto = keyof typeof timbres
type Edicion = 'colocar' | 'fila' | 'mover' | 'girar' | 'retirar' | 'deshacer'

function impacto(a: string, b: string): Efecto {
  const piezas = [a, b]
  if (piezas.includes('tray')) return 'bandeja'
  if (piezas.includes('cup') || piezas.includes('tumbler')) return 'ceramica'
  if (piezas.includes('bob')) return 'pendulo'
  if (piezas.includes('lever')) return 'balancin'
  if (piezas.includes('book')) return 'libro'
  if (piezas.includes('funnel')) return 'embudo'
  if (piezas.includes('channel') || piezas.includes('bend') || piezas.includes('diverter')) return 'canal'
  if (piezas.includes('ball') && (piezas.includes('table') || piezas.includes('ramp'))) return 'aterrizaje'
  if (piezas.includes('table') || piezas.includes('block')) return 'mesa'
  if (piezas.includes('ball')) return 'vidrio'
  return 'domino'
}

const superficies: Record<string, number> = { book: 285, ramp: 640, funnel: 1620, channel: 1140, bend: 1320, tray: 340 }
type Ruido = { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode }

export class Sonido {
  private ctx?: AudioContext
  private master?: GainNode
  private canales = new Map<Familia, GainNode>()
  private noise?: AudioBuffer
  private musica?: Musica
  private rodando = new Map<string, Ruido>()
  private voces = new Map<OscillatorNode, { parar: () => void; intento: boolean; prioridad: boolean }>()
  private contactos = new Map<string, number>()
  private ultimoContacto = -Infinity
  private enPrueba = false

  constructor(private preferencias: Preferencias) {}

  iniciar() {
    if (document.hidden) return
    if (!this.ctx) {
      if (typeof AudioContext === 'undefined') return
      let c: AudioContext
      try { c = new AudioContext() } catch { return }
      this.ctx = c
      this.master = c.createGain()
      this.master.gain.value = this.preferencias.audio ? .75 : 0
      const limitador = c.createDynamicsCompressor()
      limitador.threshold.value = -5
      limitador.knee.value = 3
      limitador.ratio.value = 12
      this.master.connect(limitador).connect(c.destination)
      for (const familia of familias) {
        const canal = c.createGain()
        canal.gain.value = this.preferencias.volumenes[familia] / 100
        canal.connect(this.master)
        this.canales.set(familia, canal)
      }
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.ruido('ambiente', 345, .055)
      this.musica = new Musica(c, this.canales.get('musica')!)
      if (this.enPrueba) this.musica.mezclar(true)
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {})
    this.musica?.visible(true)
  }
  actualizar(familia?: Familia) {
    if (!this.ctx) return
    if (familia) this.canales.get(familia)!.gain.setTargetAtTime(this.preferencias.volumenes[familia] / 100, this.ctx.currentTime, .008)
    else this.master!.gain.setTargetAtTime(this.preferencias.audio ? .75 : 0, this.ctx.currentTime, .006)
  }
  private ruido(familia: Familia, frecuencia: number, volumen: number): Ruido {
    const c = this.ctx!, source = c.createBufferSource(), filter = c.createBiquadFilter()
    const gain = c.createGain(), pan = c.createStereoPanner()
    source.buffer = this.noise!
    source.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = frecuencia
    gain.gain.value = volumen
    source.connect(filter).connect(gain).connect(pan).connect(this.canales.get(familia)!)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect() }
    source.start(0, Math.random() * this.noise!.duration)
    return { source, filter, gain, pan }
  }
  private golpe(efecto: Efecto, canal: 'mesa' | 'interfaz', volumen: number,
    opciones: { pan?: number; cuando?: number; variacion?: number } = {}) {
    const c = this.ctx
    if (!c || !this.preferencias.audio || !this.preferencias.volumenes[canal]) return
    // Limit simultaneous transients but keep an arriving mechanism or signature audible.
    const prioridad = ['llave', 'pestillo', 'tablero', 'pendulo', 'balancin', 'bandeja', 'firma1', 'firma2'].includes(efecto)
    if (this.voces.size >= (canal === 'mesa' ? 20 : 24)) {
      if (!prioridad) return
      const reemplazo = [...this.voces].find(([, voz]) => !voz.prioridad)
      if (!reemplazo) return
      reemplazo[1].parar()
      this.voces.delete(reemplazo[0])
    }
    const [base, duracion, textura, final] = timbres[efecto]
    const hz = base * (opciones.variacion ?? 1), t = opciones.cuando ?? c.currentTime, fin = t + duracion
    const tono = c.createOscillator(), noise = c.createBufferSource(), filter = c.createBiquadFilter()
    const cuerpo = c.createGain(), roce = c.createGain(), env = c.createGain(), pan = c.createStereoPanner()
    tono.type = efecto === 'ceramica' || efecto === 'vidrio' ? 'sine' : 'triangle'
    tono.frequency.setValueAtTime(hz, t)
    tono.frequency.exponentialRampToValueAtTime(hz * final, fin)
    cuerpo.gain.value = 1 - textura
    roce.gain.value = textura * 2
    noise.buffer = this.noise!
    filter.type = 'bandpass'
    filter.frequency.value = hz * 2.4
    tono.connect(cuerpo).connect(env)
    noise.connect(filter).connect(roce).connect(env)
    env.connect(pan).connect(this.canales.get(canal)!)
    pan.pan.value = opciones.pan ?? 0
    env.gain.setValueAtTime(.0001, t)
    env.gain.exponentialRampToValueAtTime(volumen, t + .002)
    env.gain.exponentialRampToValueAtTime(.0001, fin)
    this.voces.set(tono, { prioridad, intento: canal === 'mesa' || ['premio', 'firma1', 'firma2'].includes(efecto),
      parar: () => { env.disconnect(); tono.stop(); noise.stop() } })
    tono.onended = () => {
      this.voces.delete(tono)
      for (const node of [tono, noise, filter, cuerpo, roce, env, pan]) node.disconnect()
    }
    tono.start(t)
    noise.start(t, Math.random() * (this.noise!.duration - duracion))
    tono.stop(fin)
    noise.stop(fin)
  }
  edicion(gesto: Edicion, pan = 0) { this.golpe(gesto, 'mesa', .23, { pan }) }
  interfaz(accion: 'navegar' | 'invalida' | 'premio') {
    this.golpe(accion, 'interfaz', accion === 'navegar' ? .12 : .19)
  }
  empezar() {
    this.enPrueba = true
    this.musica?.mezclar(true)
  }
  evento(e: SimEvent, paneo: (pos: Vec3) => number) {
    if (!this.ctx) return
    let efecto: Efecto
    let volumen = .31, variacion = 1
    switch (e.tipo) {
      case 'empujon': efecto = 'empujon'; break
      case 'salida-cuna': efecto = 'cuna'; break
      case 'llave': efecto = e.materialB === 'leaf' ? 'pestillo' : 'llave'; break
      case 'tope': efecto = e.materialA === 'leaf' || e.materialA === 'doorleaf' ? 'tablero' : e.materialA === 'slider' ? 'pestillo' : 'balancin'; break
      case 'impacto': {
        const par = [e.a, e.b].sort().join('|')
        if (e.paso - (this.contactos.get(par) ?? -Infinity) < 6) return
        this.contactos.set(par, e.paso)
        efecto = impacto(e.materialA, e.materialB)
        volumen = Math.min(.46, .075 + .18 * Math.sqrt(e.fuerza))
        variacion = 1 + .07 * Math.sin(e.paso + par.length)
        break
      }
      default: return
    }
    this.ultimoContacto = this.ctx.currentTime
    this.golpe(efecto, 'mesa', volumen, { pan: e.posicion ? paneo(e.posicion) : 0, variacion })
  }
  rodar(bolitas: ReadonlyMap<string, Rodadura>, paneo: (pos: Vec3) => number) {
    const c = this.ctx
    if (!c) return
    const audibles = this.preferencias.audio && this.preferencias.volumenes.mesa
      ? [...bolitas].filter(([, r]) => r.velocidad > .015).sort((a, b) => b[1].velocidad - a[1].velocidad).slice(0, 6) : []
    const activas = new Set(audibles.map(([id]) => id))
    for (const [id, voz] of this.rodando) {
      if (activas.has(id)) continue
      voz.gain.gain.setTargetAtTime(0, c.currentTime, .003)
      voz.source.stop(c.currentTime + .015)
      this.rodando.delete(id)
    }
    for (const [id, r] of audibles) {
      let voz = this.rodando.get(id)
      if (!voz) { voz = this.ruido('mesa', 600, 0); this.rodando.set(id, voz) }
      voz.filter.frequency.setTargetAtTime((superficies[r.material] ?? 470) + r.velocidad * 540, c.currentTime, .02)
      voz.filter.Q.value = r.material === 'funnel' ? 3 : 1
      voz.gain.gain.setTargetAtTime(Math.min(.23, r.velocidad * .48), c.currentTime, .012)
      voz.pan.pan.setTargetAtTime(paneo(r.posicion), c.currentTime, .02)
    }
  }
  resultado(victoria: boolean) {
    if (!this.ctx) { this.enPrueba = false; return }
    for (const voz of this.rodando.values()) voz.source.stop()
    this.rodando.clear()
    let espera = Math.max(0, this.ultimoContacto + .35 - this.ctx.currentTime)
    if (victoria) {
      const origen = this.ctx.currentTime
      this.golpe('firma1', 'interfaz', .35, { cuando: origen + .08 })
      this.golpe('firma2', 'interfaz', .32, { cuando: origen + .16 })
      espera = .215
    }
    this.musica?.mezclar(false, espera)
  }
  limpiar() {
    for (const [tono, voz] of this.voces) {
      if (voz.intento) { voz.parar(); this.voces.delete(tono) }
    }
    for (const voz of this.rodando.values()) voz.source.stop()
    this.rodando.clear()
    this.contactos.clear()
    this.ultimoContacto = -Infinity
    if (this.enPrueba) this.musica?.mezclar(false)
    this.enPrueba = false
  }
  visible(v: boolean) {
    if (!this.ctx) return
    void (v ? this.ctx.resume() : this.ctx.suspend()).catch(() => {})
    this.musica?.visible(v)
  }
}
