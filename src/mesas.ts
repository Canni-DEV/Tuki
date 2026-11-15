import { formatosMesa, inventario, limitePiezasTaller, perfil, tipos, type FormatoMesa, type Nivel } from './types'

export function baseMesa(nombre: string, formato: FormatoMesa = 'clasica'): Nivel {
  const { ancho, fondo } = formatosMesa[formato]
  const saldo = inventario()
  for (const t of tipos) saldo[t] = t === 'inicio' || t === 'meta' ? 1 : limitePiezasTaller
  return {
    version: 1, revision: 1, id: 'taller', contexto: 'mesa', nombre,
    formatoMesa: formato, ordenFisico: 'geometria', objetivo: 'Armá tu recorrido en la mesa.',
    perfilFisico: perfil.id, requiere: 'recta', inventario: saldo,
    fijos: [{ id: 'mesa', activo: 'table', rol: 'escenario', posicion: [0, 0, 0], giroY: 0,
      escala: [ancho / .42, 1, fondo / .26], apoyo: null }],
    superficies: [{ id: 'tablero', objeto: 'mesa', zona: 'tapa', admite: tipos }],
    camara: { objetivo: [0, .05, 0], azimut: 16, elevacion: 48, altoVisible: Math.max(.4, fondo + .12) },
    empujon: { pieza: 'inicio', impulsoLocal: [0, 0, .003], puntoLocal: [0, .04, 0] },
  }
}
