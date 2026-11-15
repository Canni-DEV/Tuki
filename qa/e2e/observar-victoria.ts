import type { Page } from '@playwright/test'

declare global {
  interface Window {
    efectoVictoria(): {
      dibujos: { tiempo: number; cantidad: number; fase: string }[]
      frases: { desde: number; duracion: number; instante: number }[]
      inicio?: number
      fuerza: number
    }
  }
}

// Observe actual GPU draws and audio starts in the production build.
export async function observarVictoria(page: Page) {
  await page.addInitScript(() => {
    const registro: ReturnType<Window['efectoVictoria']> = { dibujos: [], frases: [], fuerza: 1 }
    const tiempos = new WeakSet<WebGLUniformLocation>(), fuerzas = new WeakSet<WebGLUniformLocation>()
    const gl = WebGL2RenderingContext.prototype
    const buscar = gl.getUniformLocation, escribir = gl.uniform1f, dibujar = gl.drawArrays
    let tiempo = 0
    gl.getUniformLocation = function (programa, nombre) {
      const lugar = buscar.call(this, programa, nombre)
      if (lugar && nombre === 'tiempoVictoria') tiempos.add(lugar)
      if (lugar && nombre === 'fuerzaLuz') fuerzas.add(lugar)
      return lugar
    }
    gl.uniform1f = function (lugar, valor) {
      if (lugar && tiempos.has(lugar)) tiempo = valor
      if (lugar && fuerzas.has(lugar)) registro.fuerza = valor
      escribir.call(this, lugar, valor)
    }
    gl.drawArrays = function (modo, desde, cantidad) {
      if (modo === this.POINTS) {
        registro.inicio ??= performance.now()
        registro.dibujos.push({ tiempo, cantidad, fase: window.tukiQA.estado().fase })
      }
      dibujar.call(this, modo, desde, cantidad)
    }
    const iniciar = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (cuando, desde, duracion) {
      if (this.buffer && [1.2, 6.9435].some(s => Math.abs(this.buffer!.duration - s) < .001))
        registro.frases.push({ desde: desde ?? 0, duracion: this.buffer.duration, instante: performance.now() })
      iniciar.call(this, cuando, desde, duracion)
    }
    window.efectoVictoria = () => registro
  })
}
