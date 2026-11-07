export type Vec3 = [number, number, number]
export type TipoColocable = 'domino' | 'bolita' | 'rampa' | 'embudo'
export type Saldo = Record<TipoColocable, number>
export type IdNivel = 'curva' | 'libro' | 'taza' | 'taza-llave'
export interface Pose {
  posicion: Vec3
  giroY: number
}
export interface ObjetoDeNivel extends Pose {
  id: string
  activo: string
  rol: 'escenario' | 'inicio' | 'meta' | 'mecanismo'
  apoyo: string | null
  escala?: Vec3
}
export interface Nivel {
  version: 1
  revision: number
  id: IdNivel
  nombre: string
  objetivo: string
  perfilFisico: string
  requiere: IdNivel | null
  inventario: Saldo
  fijos: ObjetoDeNivel[]
  superficies: {
    id: string
    objeto: string
    zona: string
    admite: TipoColocable[]
    rect?: [number, number, number, number]
    altura?: number
  }[]
  camara: { objetivo: Vec3; azimut: number; elevacion: number; altoVisible: number }
  empujon: { pieza: string; impulsoLocal: Vec3; puntoLocal: Vec3 }
}
export interface PiezaColocada extends Pose {
  id: string
  tipo: TipoColocable
  apoyo: string
}
export interface Armado {
  nivel: IdNivel
  revision: number
  perfilFisico: string
  piezas: PiezaColocada[]
  saldo: Saldo
}
export const tipos: TipoColocable[] = ['domino', 'bolita', 'rampa', 'embudo']
export const pieceAsset = (tipo: TipoColocable) =>
  ({ domino: 'domino', bolita: 'ball', rampa: 'ramp', embudo: 'funnel' })[tipo]
export const perfil = {
  id: 'mvp-1',
  paso: 1 / 120,
  friccion: 0.5,
  restitucion: 0.05,
  separacion: 0.027,
  descarte: -0.1,
  ventanaReposo: 60,
}
