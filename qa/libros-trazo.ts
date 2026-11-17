import type { DocumentoMesa } from '../src/taller'
import { perfil } from '../src/types'

export function mesaLibrosTrazo(desnivel = false) {
  const mesa: DocumentoMesa = { version: 6, formatoMesa: 'clasica', ordenFisico: 'geometria',
    nombre: 'Fila entre tres libros', perfilFisico: perfil.id, piezas: [], conexiones: [] }
  const distancia = desnivel ? .155 : .14
  mesa.piezas = [-distancia, 0, distancia].map((x, i) => ({
    id: 'libro-' + i, tipo: desnivel && i === 1 ? 'bolsilloGrande' : 'libro',
    posicion: [x, 0, 0], giroY: 0, apoyo: 'tablero',
  }))
  return mesa
}
