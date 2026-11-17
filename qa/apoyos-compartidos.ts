import type { DocumentoMesa } from '../src/taller'
import { perfil } from '../src/types'

export const alturaApoyos = .027

export function mesaApoyosCompartidos(cantidad: 2 | 3 = 2): DocumentoMesa {
  const centros = cantidad === 2 ? [[-.145, 0], [.145, 0]] : [[-.145, 0], [.145, -.105], [.145, .105]]
  return { version: 6, formatoMesa: 'clasica', ordenFisico: 'geometria', nombre: 'Piezas sobre varios libros',
    perfilFisico: perfil.id, conexiones: [], piezas: centros.map(([x, z], i) => ({
      id: 'libro-' + i, tipo: 'atlasGrande', posicion: [x, 0, z], giroY: 0, apoyo: 'tablero',
    })) }
}
