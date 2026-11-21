import { almacen, type Registro, type Resumen } from './almacen'
import type { DocumentoDesafio } from './desafios'
import type { Armado } from './types'

interface Contenido { documento: DocumentoDesafio; propio: boolean; firma: string }
export interface DesafioGuardado {
  id: string; revisionGuardado: number; documento: DocumentoDesafio; propio: boolean
  intento?: Armado; referencia: object; recuperada?: boolean
}
export const claveVictoria = (d: DocumentoDesafio) => `${d.id}:${d.revision}:${d.certificacion?.huella ?? ''}`
const resumen = (c: Contenido): Omit<Resumen, 'id' | 'revisionGuardado'> => ({ clase: 'desafio',
  nombre: c.documento.nombre, objetos: c.documento.instalados.length + c.documento.solucion.piezas.length,
  propio: c.propio, estado: c.documento.estado, victoria: claveVictoria(c.documento) })

export class BibliotecaDesafios {
  readonly listado = new Map<string, Resumen>()
  readonly entradas = new Map<string, DesafioGuardado>()
  readonly completados = new Set<string>()
  private referencias = new WeakMap<object, { registro: Registro<Contenido>; revisionIntento: number }>()
  async abrir() {
    const [indice, victorias] = await Promise.all([almacen.listar(), almacen.victorias()])
    this.listado.clear()
    for (const r of indice) if (r.clase === 'desafio') this.listado.set(r.id, r)
    this.completados.clear(); for (const key of victorias) this.completados.add(key)
  }
  private recordar(registro: Registro<Contenido>, revisionIntento: number, intento?: Armado) {
    const referencia = {}
    this.referencias.set(referencia, { registro, revisionIntento })
    const entry = { id: registro.id, revisionGuardado: registro.revisionGuardado, documento: registro.valor.documento,
      propio: registro.valor.propio, intento, referencia, recuperada: registro.recuperada }
    this.entradas.set(entry.id, entry)
    return entry
  }
  async cargar(id: string) {
    const [registro, intento] = await Promise.all([
      almacen.leer<Registro<Contenido>>('documentos', id),
      almacen.leer<Registro<{ firma: string; armado: Armado }>>('intentos', id),
    ])
    if (!registro) throw new Error('El desafío ya no está guardado.')
    const { validarDesafio } = await import('./desafios')
    registro.valor.documento = await validarDesafio(registro.valor.documento)
    return this.recordar(registro, intento?.revisionGuardado ?? 0,
      intento?.valor.firma === registro.valor.firma ? intento.valor.armado : undefined)
  }
  async guardar(documento: DocumentoDesafio, propio = true, id: string = crypto.randomUUID(), esperada = 0) {
    const { validarDesafio, huellaDesafio } = await import('./desafios')
    const valido = await validarDesafio(documento)
    const valor = { documento: valido, propio, firma: await huellaDesafio(valido) }
    const registro = await almacen.guardar(id, esperada, valor, resumen(valor))
    const intento = await almacen.leer<Registro<{ firma: string; armado: Armado }>>('intentos', registro.id)
    return this.recordar(registro, intento?.revisionGuardado ?? 0, intento?.valor.firma === valor.firma ? intento.valor.armado : undefined)
  }
  async guardarIntento(id: string, referencia: object, armado: Armado) {
    const previa = this.referencias.get(referencia)
    if (!previa || previa.registro.id !== id) throw new Error('La sesión del desafío ya no está disponible.')
    const { registro, revisionIntento } = previa
    if (armado.revision !== registro.valor.documento.revision || armado.nivel !== 'taller' || armado.perfilFisico !== registro.valor.documento.perfilFisico)
      throw new Error('El intento pertenece a otra revisión del desafío.')
    const result = await almacen.guardarIntento(registro, registro.valor.firma, revisionIntento, armado,
      resumen(registro.valor), valor => valor.firma)
    this.referencias.delete(referencia)
    return this.recordar(result.registro, result.intento.revisionGuardado, result.intento.valor.armado)
  }
  async completar(d: DocumentoDesafio) {
    const key = claveVictoria(d)
    await almacen.completar(key); this.completados.add(key)
  }
  resuelto(d: DocumentoDesafio) { return this.completados.has(claveVictoria(d)) }
  async borrar(entry: Pick<DesafioGuardado, 'id' | 'revisionGuardado'>) {
    await almacen.borrar(entry.id, entry.revisionGuardado)
    this.entradas.delete(entry.id); this.listado.delete(entry.id)
  }
}
