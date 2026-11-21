import type { Editor } from './editor'
import type { Creacion, DocumentoMesa } from './taller'
import type { Armado } from './types'
import type { Biblioteca } from './biblioteca'
import type { BibliotecaDesafios, DesafioGuardado } from './biblioteca-desafios'
import type { Guardados } from './guardado'
import { descargarDocumento } from './descargas'

interface Sesion {
  editor: Editor; autor?: DesafioGuardado; mesa?: Creacion; jugador?: DesafioGuardado; soloLectura: boolean
  actualizarSolucion: typeof import('./desafios').actualizarSolucion
  mesaDeAutor: typeof import('./desafios').mesaDeAutor
  confirmado: (recuperada?: boolean) => void
}
/** Keeps queued snapshots and their revision identity independent of navigation. */
export class GuardadoCreaciones {
  private encolados = new WeakMap<Editor, Armado>()
  constructor(private biblioteca: Biblioteca, private retos: BibliotecaDesafios, private guardados: Guardados) {}
  comenzar(editor: Editor) { this.encolados.set(editor, editor.armado) }
  edicion(sesion: Sesion) {
    if (this.encolados.get(sesion.editor) === sesion.editor.armado) return
    const { editor: activo, autor, mesa: mesaLocal, jugador, soloLectura, actualizarSolucion, mesaDeAutor, confirmado } = sesion
    const armado = activo.armado
    if (jugador) {
      this.encolados.set(activo, armado)
      this.guardados.agregar(jugador, async () => {
        const anterior = jugador.id
        const siguiente = await this.retos.guardarIntento(jugador.id, jugador.referencia, armado)
        Object.assign(jugador, siguiente); confirmado(anterior !== siguiente.id)
      }, () => descargarDocumento({ ...mesaDeAutor(jugador.documento), piezas: [...jugador.documento.instalados, ...armado.piezas],
        conexiones: [...jugador.documento.conexionesInstaladas, ...(armado.conexiones ?? [])] }, jugador.documento.nombre, '.tuki.json'))
      return
    }
    if (!mesaLocal || soloLectura) return
    const doc = { ...mesaLocal.mesa, piezas: armado.piezas, conexiones: armado.conexiones, secuencias: armado.secuencias }
    const desafio = autor ? actualizarSolucion(autor.documento, doc) : undefined
    mesaLocal.mesa = doc
    if (!autor) this.biblioteca.retener(mesaLocal)
    if (autor && desafio) autor.documento = desafio
    this.encolados.set(activo, armado)
    this.guardados.agregar(autor ?? mesaLocal, async () => {
      const anterior = (autor ?? mesaLocal).id
      if (autor && desafio) {
        const siguiente = await this.retos.guardar(desafio, true, autor.id, autor.revisionGuardado)
        autor.id = siguiente.id; autor.revisionGuardado = siguiente.revisionGuardado; autor.referencia = siguiente.referencia
        mesaLocal.id = siguiente.id; mesaLocal.revisionGuardado = siguiente.revisionGuardado
      } else {
        const siguiente = await this.biblioteca.guardar(doc, mesaLocal.id, mesaLocal.revisionGuardado)
        mesaLocal.id = siguiente.id; mesaLocal.revisionGuardado = siguiente.revisionGuardado; mesaLocal.recuperada = siguiente.recuperada
        this.biblioteca.confirmar(anterior, mesaLocal, doc)
      }
      confirmado(anterior !== (autor ?? mesaLocal).id)
    }, () => descargarDocumento(desafio ?? doc, doc.nombre, desafio ? '.tuki-desafio.json' : '.tuki.json'))
  }
  nueva(doc: DocumentoMesa) {
    const entry = this.biblioteca.borrador(doc)
    doc = entry.mesa
    this.guardados.agregar(entry, async () => {
      const anterior = entry.id
      const guardada = await this.biblioteca.guardar(doc, entry.id, entry.revisionGuardado)
      entry.id = guardada.id; entry.revisionGuardado = guardada.revisionGuardado
      this.biblioteca.confirmar(anterior, entry, doc)
    }, () => descargarDocumento(doc, doc.nombre, '.tuki.json'))
    return entry
  }
}
