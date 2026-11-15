import { Editor } from './editor'
import { baseMesa } from './mesas'
import { type PiezaColocada, type FormatoMesa } from './types'
export { compilarEscenario } from './escenarios'
import { armadoDeMesa, leerMesa, type DocumentoMesa } from './taller'

export function validarConstruccion(piezas: PiezaColocada[], formato: FormatoMesa, diferirEquilibrio = false) {
  const doc: DocumentoMesa = { version: 6, nombre: 'Construcción', formatoMesa: formato, perfilFisico: 'dispositivos-1', piezas, conexiones: [] }
  // The decoder checks references/cycles and the editor checks every occupied volume.
  if (!diferirEquilibrio) return leerMesa(doc).piezas
  const n = baseMesa(doc.nombre, formato), editor = new Editor(n)
  editor.cargar(armadoDeMesa(n, doc), true)
  return editor.armado.piezas
}
