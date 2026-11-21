import { almacen, type Registro, type Resumen } from './almacen'
import type { Creacion, DocumentoMesa } from './taller'

export class Biblioteca {
  readonly listado = new Map<string, Resumen>()
  readonly mesas = new Map<string, Creacion>()
  private pendientes = new Map<string, Creacion>()
  private resumen(entry: Creacion): Resumen {
    return { id: entry.id, revisionGuardado: entry.revisionGuardado, clase: 'mesa', nombre: entry.mesa.nombre,
      objetos: entry.mesa.piezas.length, tipos: [...new Set(entry.mesa.piezas.map(p => p.tipo))],
      secuencias: !!entry.mesa.secuencias?.length, recuperada: entry.recuperada }
  }
  borrador(mesa: DocumentoMesa) {
    const entry: Creacion = { id: crypto.randomUUID(), revisionGuardado: 0, mesa: structuredClone(mesa) }
    this.retener(entry)
    return entry
  }
  retener(entry: Creacion) {
    this.pendientes.set(entry.id, entry); this.mesas.set(entry.id, entry); this.listado.set(entry.id, this.resumen(entry))
  }
  confirmar(idAnterior: string, entry: Creacion, guardada: DocumentoMesa) {
    this.pendientes.delete(idAnterior)
    if (idAnterior !== entry.id) this.mesas.delete(idAnterior)
    this.mesas.set(entry.id, entry); this.listado.set(entry.id, this.resumen(entry))
    if (entry.mesa !== guardada) this.retener(entry)
  }
  async abrir() {
    const indice = await almacen.listar()
    this.listado.clear()
    for (const r of indice) if (r.clase === 'mesa') this.listado.set(r.id, r)
    for (const e of this.pendientes.values()) this.retener(e)
    for (const [id, e] of this.mesas) if (!this.pendientes.has(id) && this.listado.get(id)?.revisionGuardado !== e.revisionGuardado) this.mesas.delete(id)
  }
  async cargar(id: string): Promise<Creacion> {
    const pendiente = this.pendientes.get(id)
    if (pendiente) return pendiente
    const record = await almacen.leer<Registro<DocumentoMesa>>('documentos', id)
    if (!record) throw new Error('La mesa ya no está guardada.')
    const cached = this.mesas.get(id)
    if (cached?.revisionGuardado === record.revisionGuardado) return cached
    const { leerMesaAsync } = await import('./taller')
    const mesa = await leerMesaAsync(record.valor)
    const entry = { id, revisionGuardado: record.revisionGuardado, mesa, recuperada: record.recuperada }
    this.mesas.set(id, entry)
    return entry
  }
  async guardar(mesa: DocumentoMesa, id: string = crypto.randomUUID(), esperada = 0): Promise<Creacion> {
    const { leerMesaAsync } = await import('./taller')
    const valido = await leerMesaAsync(mesa)
    const result = await almacen.guardar(id, esperada, valido,
      { clase: 'mesa', nombre: valido.nombre, objetos: valido.piezas.length,
        tipos: [...new Set(valido.piezas.map(p => p.tipo))], secuencias: !!valido.secuencias?.length })
    const entry = { id: result.id, revisionGuardado: result.revisionGuardado, mesa: result.valor, recuperada: result.recuperada }
    if (!this.pendientes.has(entry.id)) this.mesas.set(entry.id, entry)
    return entry
  }
  async borrar(entry: Pick<Creacion, 'id' | 'revisionGuardado'>) {
    await almacen.borrar(entry.id, entry.revisionGuardado)
    this.mesas.delete(entry.id); this.listado.delete(entry.id)
  }
}
