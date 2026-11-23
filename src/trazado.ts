import { alturasCompatibles, type SuperficiesTrazo } from './superficies-trazo'
import { perfil, type PiezaColocada, type Vec3 } from './types'

type Detalle = { objeto?: string }
export interface ContextoTrazo {
  superficies: SuperficiesTrazo
  colision(pieza: PiezaColocada, detalle: Detalle, transicion: Set<string>): string | null
  validar(pieza: PiezaColocada, anteriores: PiezaColocada[], detalle: Detalle): string | null
  registrar(pieza: PiezaColocada): PiezaColocada
}
export interface ResultadoTrazo {
  piezas: PiezaColocada[]
  error: string | null
  altura?: number
  inicio?: PiezaColocada
}
interface PuntoRestauracion {
  cantidad: number
  altura: number
  recorrido: number
  siguiente: number
  aplazado: number | null
  errorJunta: string | null
}
const distancia = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])

/** A gesture owns these checkpoints; returned previews are immutable snapshots. */
export class SesionTrazo {
  private puntos: Vec3[] = []
  private piezas: PiezaColocada[] = []
  private restauraciones: PuntoRestauracion[] = []
  private transiciones = new Map<number, Set<string>>()
  constructor(private contexto: ContextoTrazo, private apoyo: string, private saldo: number,
    private vigente: () => boolean = () => true) {}

  evaluar(muestras: Vec3[]): ResultadoTrazo {
    if (!this.vigente()) return { piezas: [], error: 'El armado cambió' }
    const { superficies, colision, validar, registrar } = this.contexto
    const inicial = superficies.tapas.find(s => s.id === this.apoyo)
    if (!inicial) return { piezas: [], error: 'Elegí un apoyo compatible' }
    const raw: Vec3[] = []
    for (const p of muestras) if (!raw.length || distancia(p, raw.at(-1)!) >= .002) raw.push(p)
    const pts = raw.map((p, i): Vec3 => i === 0 || i === raw.length - 1 ? [...p] : [
      (raw[i - 1][0] + 2 * p[0] + raw[i + 1][0]) / 4, p[1],
      (raw[i - 1][2] + 2 * p[2] + raw[i + 1][2]) / 4,
    ])
    let comunes = 0
    while (comunes < pts.length && this.puntos[comunes]?.every((v, k) => v === pts[comunes][k])) comunes++
    // Appending a sample changes the old endpoint through the three-point filter.
    // Restore before that segment, including any deferred step placement.
    const reutilizar = Math.max(0, Math.min(comunes - 1, this.restauraciones.length - 1))
    const estado = this.restauraciones[reutilizar] ?? {
      cantidad: 0, altura: inicial.y, recorrido: 0, siguiente: 0, aplazado: null, errorJunta: null,
    }
    let { altura, recorrido, siguiente, aplazado, errorJunta } = estado
    const piezas = this.piezas.slice(0, estado.cantidad)
    this.restauraciones = this.restauraciones.slice(0, reutilizar + 1)
    this.restauraciones[0] = { cantidad: 0, altura: inicial.y, recorrido: 0, siguiente: 0, aplazado: null, errorJunta: null }
    this.puntos = pts
    this.piezas = piezas
    let inicio: PiezaColocada | undefined
    const resultado = (error: string | null): ResultadoTrazo => ({ piezas, error, altura, ...(inicio && { inicio }) })
    for (let i = reutilizar + 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = distancia(a, b)
      if (d) {
        const giroY = Math.atan2(b[0] - a[0], b[2] - a[2]) * 180 / Math.PI
        const cortes = superficies.cortes(a, b).map(t => t * d)
        let corte = 0
        for (let t = 0; t <= d + 1e-8;) {
          if (piezas.length >= this.saldo) return resultado('Límite de fichas')
          const posicion: Vec3 = [a[0] + (b[0] - a[0]) * t / d, altura, a[2] + (b[2] - a[2]) * t / d]
          const superficie = superficies.en(posicion)
          if (!superficie) return resultado('Falta superficie de apoyo')
          if (!alturasCompatibles(superficie.y, altura)) return resultado('El desnivel supera los 2 mm')
          altura = posicion[1] = superficie.y
          const p: PiezaColocada = { tipo: 'domino', id: '@fila-' + piezas.length, apoyo: superficie.id, posicion, giroY }
          if (!piezas.length) inicio = { ...p, id: '@inicio-fila' }
          let transicion = this.transiciones.get(altura)
          if (!transicion) {
            transicion = new Set(superficies.tapas.filter(s => alturasCompatibles(s.y, altura)).map(s => s.objeto))
            this.transiciones.set(altura, transicion)
          }
          // Probe the whole segment, including surface boundaries and their interiors.
          const obstaculo: Detalle = {}
          let error = colision(p, obstaculo, transicion)
          if (error) return resultado(superficies.tapas.some(s => s.objeto === obstaculo.objeto && !alturasCompatibles(s.y, altura))
            ? 'El desnivel supera los 2 mm' : error)
          if (recorrido + t >= siguiente - 1e-8) {
            const choque: Detalle = {}
            error = validar(p, piezas, choque)
            if (error) {
              // The first centre belongs to the user. Only later tiles may advance at a seam.
              if (!piezas.length || (error !== 'Apoyá toda la base' && !(choque.objeto && transicion.has(choque.objeto))))
                return resultado(error)
              aplazado ??= recorrido + t
              if (recorrido + t - aplazado >= .008 - 1e-8) return resultado(error)
              errorJunta = error
              siguiente = recorrido + t + .001
            } else {
              piezas.push(registrar(p))
              inicio = undefined
              aplazado = null; errorJunta = null
              siguiente = recorrido + t + perfil.separacion
            }
          }
          if (t >= d) break
          while (corte < cortes.length && cortes[corte] <= t + 1e-10) corte++
          t = Math.min(t + .004, d, siguiente - recorrido, cortes[corte] ?? d)
        }
        recorrido += d
      }
      this.restauraciones.push({ cantidad: piezas.length, altura, recorrido, siguiente, aplazado, errorJunta })
    }
    return resultado(piezas.length === this.saldo ? 'Límite de fichas' : errorJunta)
  }
}
