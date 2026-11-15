import type { PiezaColocada, TipoColocable, Vec3 } from './types'

export type ModoDispositivo = 'automatico' | 'cable'
export type Potencia = 'baja' | 'media' | 'alta'
export interface ConfiguracionLanzador { clase: 'lanzador'; modo: ModoDispositivo; inclinacion: 30 | 45 | 60; potencia: Potencia; demora: .5 | 1 | 2 }
export interface ConfiguracionRetenedor { clase: 'retenedor'; modo: ModoDispositivo; demora: .5 | 1 | 2 }
export interface ConfiguracionPlaca { clase: 'placa'; inclinacion: 0 | 15 | 30; potencia: Potencia }
export interface ConfiguracionElevador { clase: 'elevador'; modo: ModoDispositivo; lastre: 6 | 12 | 24 }
export type ConfiguracionDispositivo = ConfiguracionLanzador | ConfiguracionRetenedor | ConfiguracionPlaca | ConfiguracionElevador
export const predeterminadas = {
  lanzador: { clase: 'lanzador', modo: 'automatico', inclinacion: 45, potencia: 'media', demora: .5 } as ConfiguracionLanzador,
  retenedor: { clase: 'retenedor', modo: 'automatico', demora: .5 } as ConfiguracionRetenedor,
  placa: { clase: 'placa', inclinacion: 0, potencia: 'media' } as ConfiguracionPlaca,
  elevador: { clase: 'elevador', modo: 'automatico', lastre: 12 } as ConfiguracionElevador,
}
export const velocidades: Record<Potencia, number> = { baja: 1.2, media: 1.6, alta: 2 }
export const alturasPlaca: Record<Potencia, number> = { baja: .04, media: .08, alta: .12 }
export const rigidezPlaca: Record<Potencia, number> = { baja: 62, media: 150, alta: 265 }
export const recorridoElevador = .12
export const asientoLanzador: Vec3 = [0, .018, 0]
export const asientoRetenedor: Vec3 = [0, .019, -.009]

type Definicion = {
  entrada?: string
  salida?: string
  contacto?: 'lateral' | 'superior'
  borne: [Vec3, Vec3]
  comportamiento: 'mando' | 'motor' | 'gravedad' | 'lanzador' | 'retenedor' | 'placa' | 'elevador'
  motor?: { angular: boolean; destino: number; rigidez: number; amortiguacion: number }
  retorno?: { rigidez: number; amortiguacion: number }
  masa?: number
  apoyo?: { zona: 'asiento'|'tapa'; rect: [number,number,number,number]; altura: number; admite?: TipoColocable[]; soloCable?: boolean }
}
/** Signal terminals and physical actors share this registry. */
export const dispositivos: Partial<Record<TipoColocable, Definicion>> = {
  palanca: { entrada: 'paddle', contacto: 'lateral', borne: [[0,.0035,-.0168],[0,0,-1]], comportamiento: 'mando' },
  boton: { entrada: 'press', contacto: 'superior', borne: [[.0104,.0035,.003],[1,0,0]], comportamiento: 'mando', retorno:{rigidez:1800,amortiguacion:50}, apoyo:{zona:'tapa',rect:[0,0,.0218,.0218],altura:.014,admite:['domino','bolita']} },
  puerta: { salida: 'doorleaf', borne: [[-.0175,.006,-.009],[-1,0,0]], comportamiento: 'motor', motor:{angular:true,destino:1.48,rigidez:.028,amortiguacion:.0008} },
  compuerta: { salida: 'slider', borne: [[-.039,.006,.0225],[0,0,1]], comportamiento: 'motor', motor:{angular:false,destino:-.031,rigidez:14,amortiguacion:.22} },
  puente: { salida: 'leaf', borne: [[.011,.006,-.0265],[0,0,-1]], comportamiento: 'gravedad' },
  lanzador: { salida: 'base', borne: [[-.033,.006,0],[-1,0,0]], comportamiento: 'lanzador', masa:.05, apoyo:{zona:'asiento',rect:[asientoLanzador[0],asientoLanzador[2],.02,.02],altura:asientoLanzador[1],admite:['bolita'],soloCable:true} },
  retenedor: { salida: 'stop', borne: [[-.023,.006,0],[-1,0,0]], comportamiento: 'retenedor', masa:.035, apoyo:{zona:'asiento',rect:[asientoRetenedor[0],asientoRetenedor[2],.02,.02],altura:asientoRetenedor[1],admite:['bolita'],soloCable:true} },
  placa: { borne: [[0,.004,-.024],[0,0,-1]], comportamiento: 'placa', masa:.025 },
  elevador: { salida: 'platform', borne: [[-.039,.006,0],[-1,0,0]], comportamiento: 'elevador', masa:.058, apoyo:{zona:'tapa',rect:[-.022,0,.033,.040],altura:.0185} },
}
export function masaDispositivo(p: PiezaColocada) {
  const c=configuracion(p),masa=dispositivos[p.tipo]?.masa
  return masa===undefined ? undefined : masa+(c?.clase==='elevador'?c.lastre/1000:0)
}
export const configurable = (tipo: TipoColocable): tipo is keyof typeof predeterminadas => Object.hasOwn(predeterminadas, tipo)
export function configuracion(p: Pick<PiezaColocada, 'tipo' | 'configuracion'>): ConfiguracionDispositivo | undefined {
  return p.configuracion ?? (configurable(p.tipo) ? predeterminadas[p.tipo] : undefined)
}
export function configuracionValida(tipo: TipoColocable, valor: unknown): boolean {
  if (valor === undefined) return true
  if (!configurable(tipo) || !valor || typeof valor !== 'object' || Array.isArray(valor)) return false
  const c = valor as Record<string, unknown>, d = predeterminadas[tipo]
  if (Object.keys(c).length !== Object.keys(d).length || Object.keys(c).some(k => !Object.hasOwn(d,k)) || c.clase !== tipo) return false
  if ('modo' in d && !['automatico','cable'].includes(c.modo as string)) return false
  if ('demora' in d && ![.5,1,2].includes(c.demora as number)) return false
  if ('potencia' in d && !['baja','media','alta'].includes(c.potencia as string)) return false
  if (tipo === 'lanzador' && ![30,45,60].includes(c.inclinacion as number)) return false
  if (tipo === 'placa' && ![0,15,30].includes(c.inclinacion as number)) return false
  return tipo !== 'elevador' || [6,12,24].includes(c.lastre as number)
}
export function activoConfigurable(tipo: TipoColocable, config?: ConfiguracionDispositivo) {
  const c = configuracion({ tipo, configuracion: config })
  if (c?.clase === 'lanzador') return 'launcher' + c.inclinacion
  if (c?.clase === 'placa') return 'springplate' + c.inclinacion
  if (c?.clase === 'elevador') return 'lift' + c.lastre
  if (c?.clase === 'retenedor') return 'holder'
}
export function direccionLanzador(giroY: number, inclinacion: number): Vec3 {
  const y = giroY * Math.PI / 180, a = inclinacion * Math.PI / 180
  return [Math.sin(y)*Math.cos(a), Math.sin(a), Math.cos(y)*Math.cos(a)]
}
