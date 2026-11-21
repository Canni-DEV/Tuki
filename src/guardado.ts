/** Serializes durable writes independently of screen lifetime. Failed snapshots remain retryable. */
export class Guardados {
  private pendientes = new Map<object, { guardar: () => Promise<void>; exportar: () => void }>()
  private ejecucion?: Promise<void>
  error?: unknown
  constructor(private cambio: () => void) {}
  get pendiente() { return this.pendientes.size > 0 }
  agregar(clave: object, guardar: () => Promise<void>, exportar: () => void) {
    this.pendientes.set(clave, { guardar, exportar })
    this.cambio()
    if (!this.error) void this.esperar().catch(() => {})
  }
  esperar(): Promise<void> {
    if (this.error) return Promise.reject(this.error)
    return this.ejecucion ??= this.procesar().finally(() => {
      this.ejecucion = undefined
      if (this.pendiente && !this.error) void this.esperar().catch(() => {})
    })
  }
  private async procesar() {
    while (this.pendientes.size) {
      const [clave, tarea] = this.pendientes.entries().next().value!
      try {
        await tarea.guardar()
        if (this.pendientes.get(clave) === tarea) this.pendientes.delete(clave)
        this.cambio()
      } catch (error) { this.error = error; this.cambio(); throw error }
    }
  }
  reintentar() { this.error = undefined; this.cambio(); void this.esperar().catch(() => {}) }
  exportar() { for (const tarea of this.pendientes.values()) tarea.exportar() }
}
