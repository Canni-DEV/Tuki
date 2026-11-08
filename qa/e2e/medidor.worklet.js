// Measure on the audio rendering thread, including during slow WebGL frames.
class Medidor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pico = 0
    this.muestras = 0
    this.leer = false
    this.port.onmessage = () => { this.leer = true }
  }
  process(entradas, salidas) {
    for (const canal of entradas[0]) {
      for (const valor of canal) this.pico = Math.max(this.pico, Math.abs(valor))
    }
    this.muestras += salidas[0][0].length
    if (this.leer && this.muestras >= 2048) {
      this.port.postMessage(this.pico)
      this.pico = 0
      this.muestras = 0
      this.leer = false
    }
    // Leave the output silent. The game's mixer already sends the signal to the speakers.
    return true
  }
}
registerProcessor('medidor-mesa', Medidor)
