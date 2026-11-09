export type Vec3 = [number, number, number]
export const piezas = {
  domino: ['domino', 'Dominó', 'recta'], inicio: ['domino', 'Inicio', 'recta'], meta: ['domino', 'Meta', 'recta'],
  vasito: ['tumbler', 'Vasito', 'curva'],
  libro: ['book', 'Libro', 'libro'], cuna: ['cradle', 'Cuna', 'libro'],
  bolita: ['ball', 'Bolita', 'libro'], rampa: ['ramp', 'Rampa', 'libro'],
  embudo: ['funnel', 'Embudo', 'taza'], taza: ['cup', 'Taza', 'taza'], canal: ['channel', 'Canaleta recta', 'taza'],
  llave: ['valve', 'Llave de paso', 'taza-llave'], curva90: ['bend', 'Canaleta de 90°', 'vuelta'],
  pendulo: ['pendulum', 'Péndulo', 'vuelta'], balancin: ['seesaw', 'Balancín', 'subibaja'],
  taco: ['spacer', 'Taco de madera', 'libro'], palanca: ['switch', 'Palanca lateral', 'puerta'],
  boton: ['button', 'Botón vertical', 'puerta'], compuerta: ['shutter', 'Compuerta corrediza', 'taza-llave'],
  puerta: ['door', 'Puerta con bisagra', 'puerta'], puente: ['drawbridge', 'Puente abatible', 'puente'],
  puenteClasico: ['bridge', 'Puente con pestillo integrado', 'puente'],
  cunaClasica: ['oldcradle', 'Cuna clásica', 'libro'],
} as const
export type TipoColocable = keyof typeof piezas
export const limitePiezasTaller = 200
export const gruposBandeja: { nombre: string; tipos: TipoColocable[] }[] = [
  { nombre: 'Extremos', tipos: ['inicio', 'meta'] },
  { nombre: 'Transmisión', tipos: ['domino', 'bolita', 'pendulo', 'balancin'] },
  { nombre: 'Apoyos', tipos: ['taco', 'cuna', 'cunaClasica'] },
  { nombre: 'Conducción', tipos: ['rampa', 'canal', 'curva90', 'embudo'] },
  { nombre: 'Mandos', tipos: ['palanca', 'boton'] },
  { nombre: 'Receptores', tipos: ['compuerta', 'puerta', 'puente', 'llave', 'puenteClasico'] },
  { nombre: 'Escenario', tipos: ['libro', 'taza', 'vasito'] },
]
export type Saldo = Record<TipoColocable, number>
export type IdNivel = typeof piezas[TipoColocable][2] | 'taller'
export const tipos = Object.keys(piezas) as TipoColocable[]
export const pieceAsset = (tipo: TipoColocable) => piezas[tipo][0]
export function inventario(valores: Partial<Saldo> = {}): Saldo {
  return Object.fromEntries(tipos.map(t => [t, valores[t] ?? 0])) as Saldo
}
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
  instalacion?: { dispositivos: PiezaColocada[]; conexiones: ConexionInstalada[] }
  iniciales?: PiezaColocada[]
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
  apoyos?: string[]
}
export interface Conexion { mando: string; receptor: string }
export interface ConexionInstalada extends Conexion { guias: { objeto: string; local: Vec3 }[] }
export const esClasica = (t: TipoColocable) => t === 'llave' || t === 'puenteClasico' || t === 'cunaClasica'
export const esMando = (t: TipoColocable) => t === 'boton' || t === 'palanca'
export const esReceptor = (t: TipoColocable) => t === 'puerta' || t === 'compuerta' || t === 'puente'
export const apoyosDe = (p: PiezaColocada) => p.apoyos ?? [p.apoyo]
export interface Armado {
  version?: 2
  conexiones?: Conexion[]
  nivel: IdNivel
  revision: number
  perfilFisico: string
  piezas: PiezaColocada[]
  saldo: Saldo
}
export const perfil = {
  id: 'mvp-1',
  paso: 1 / 120,
  friccion: 0.5,
  restitucion: 0.05,
  separacion: 0.027,
  descarte: -0.1,
  ventanaReposo: 60,
}
