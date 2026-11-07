import type { SimEvent } from './simulation'

export class Sonido {
  private ctx?: AudioContext
  private master?: GainNode
  private noise?: AudioBuffer
  private ambiente?: AudioBufferSourceNode
  private roll?: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }
  private impactos = new Set<AudioScheduledSourceNode>()
  activo = true
  iniciar() {
    if (!this.ctx) {
      try {
        const c = new AudioContext()
        this.ctx = c
        this.master = c.createGain()
        this.master.connect(c.destination)
        this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
        const data = this.noise.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        const env = this.ruido(340, 0.012)
        this.ambiente = env.source
      } catch {
        return
      }
    }
    this.audio(this.activo)
    if (document.visibilityState === 'visible') void this.ctx.resume().catch(() => {})
  }
  audio(on: boolean) {
    this.activo = on
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.008)
  }
  private ruido(freq: number, vol: number) {
    const c = this.ctx!,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain()
    source.buffer = this.noise!
    source.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = freq
    gain.gain.value = vol
    source.connect(filter).connect(gain).connect(this.master!)
    source.start()
    source.onended = () => {
      source.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
    return { source, filter, gain }
  }
  private golpe(freq: number, vol: number, duracion: number, delay = 0) {
    if (!this.ctx || !this.activo) return
    const c = this.ctx,
      t = c.currentTime + delay
    const tone = c.createOscillator(),
      env = c.createGain(),
      noise = c.createBufferSource(),
      filter = c.createBiquadFilter()
    tone.type = 'triangle'
    tone.frequency.setValueAtTime(freq, t)
    tone.frequency.exponentialRampToValueAtTime(freq * 0.64, t + duracion)
    noise.buffer = this.noise!
    filter.type = 'bandpass'
    filter.frequency.value = freq * 3
    filter.Q.value = 1
    tone.connect(env)
    noise.connect(filter).connect(env)
    env.connect(this.master!)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(vol, t + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
    for (const s of [tone, noise]) {
      this.impactos.add(s)
      s.start(t)
      s.stop(t + duracion + 0.002)
      s.onended = () => {
        this.impactos.delete(s)
        s.disconnect()
        if (s === tone) env.disconnect()
        else filter.disconnect()
      }
    }
  }
  colocar() {
    this.golpe(540, 0.085, 0.045)
  }
  evento(e: SimEvent) {
    if (e.tipo === 'impacto') {
      const id = e.a + e.b
      const tint = [...id].reduce((v, c) => v + c.charCodeAt(0), 0) % 85
      this.golpe(id.includes('tray') ? 150 : 430 + tint, Math.min(0.3, 0.045 + e.fuerza * 0.12), 0.055)
    } else if (e.tipo === 'llave') this.golpe(1300, 0.3, 0.032)
    else if (e.tipo === 'victoria') {
      this.golpe(570, 0.27, 0.085, 0.08)
      this.golpe(790, 0.23, 0.055, 0.16)
    }
  }
  rodar(velocidad: number, material: string) {
    if (!this.ctx) return
    if (velocidad > 0.015 && !this.roll) this.roll = this.ruido(600, 0)
    if (!this.roll) return
    this.roll.filter.frequency.setTargetAtTime(
      (material === 'channel' ? 1200 : 470) + velocidad * 500,
      this.ctx.currentTime,
      0.025,
    )
    this.roll.gain.gain.setTargetAtTime(Math.min(0.13, velocidad * 0.22), this.ctx.currentTime, 0.016)
  }
  limpiar() {
    for (const s of this.impactos) {
      try {
        s.stop()
      } catch {
        /* voice ended */
      }
    }
    this.impactos.clear()
    this.roll?.source.stop()
    this.roll = undefined
  }
  visible(v: boolean) {
    if (!this.ctx) return
    void (v ? this.ctx.resume() : this.ctx.suspend()).catch(() => {})
  }
}
