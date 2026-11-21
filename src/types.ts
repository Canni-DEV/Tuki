import { activoConfigurable, dispositivos, type ConfiguracionDispositivo } from './dispositivos'
export type Vec3 = [number, number, number]
export const piezas = {
  domino: ['domino', 'Dominó', 'recta'], inicio: ['domino', 'Inicio', 'recta'], meta: ['domino', 'Meta', 'recta'],
  vasito: ['tumbler', 'Vasito', 'curva'],
  libro: ['book', 'Libro', 'recta'], bolsillo: ['pocketbook', 'Libro de bolsillo', 'recta'], atlas: ['atlas', 'Atlas', 'recta'],
  cajaGrapas: ['casebox', 'Caja de grapas', 'recta'], cajaZapatos: ['shoebox', 'Caja de zapatos', 'recta'],
  cajaCubica: ['parcel', 'Caja cúbica', 'recta'], mate: ['mate', 'Mate con bombilla', 'recta'],
  pava: ['kettle', 'Pava de acero', 'recta'], posavasos: ['coaster', 'Posavasos de corcho', 'recta'],
  yerbera: ['tin', 'Yerbera', 'recta'], servilletero: ['napkins', 'Servilletero', 'recta'],
  libroGrande: ['bookLarge', 'Libro grande', 'recta'], bolsilloGrande: ['pocketbookLarge', 'Libro de bolsillo grande', 'recta'],
  atlasGrande: ['atlasLarge', 'Atlas grande', 'recta'], cajaGrapasGrande: ['caseboxLarge', 'Caja de grapas grande', 'recta'],
  cajaZapatosGrande: ['shoeboxLarge', 'Caja de zapatos grande', 'recta'], cajaCubicaGrande: ['parcelLarge', 'Caja cúbica grande', 'recta'],
  estuche: ['pencilcase', 'Estuche cerrado', 'recta'], cajaUtiles: ['supplies', 'Caja de útiles', 'recta'],
  cajaTe: ['teabox', 'Caja de té', 'recta'], paquete: ['shipping', 'Paquete rectangular', 'recta'],
  cuaderno: ['notebook', 'Cuaderno', 'recta'], portalibros: ['bookend', 'Portalibros metálico', 'recta'],
  bolita: ['ball', 'Bolita', 'libro'], rampa: ['ramp', 'Rampa', 'libro'],
  embudo: ['funnel', 'Embudo', 'taza'], taza: ['cup', 'Taza', 'taza'], canal: ['channel', 'Canaleta recta', 'taza'],
  curva90: ['bend', 'Canaleta de 90°', 'vuelta'],
  pendulo: ['pendulum', 'Péndulo', 'vuelta'], balancin: ['seesaw', 'Balancín', 'subibaja'],
  taco: ['spacer', 'Taco de madera', 'libro'], palanca: ['switch', 'Palanca lateral', 'puerta'],
  boton: ['button', 'Botón vertical', 'puerta'], compuerta: ['shutter', 'Compuerta corrediza', 'taza-llave'],
  puerta: ['door', 'Puerta con bisagra', 'puerta'], puente: ['drawbridge', 'Puente abatible', 'puente'],
  lanzador: ['launcher45', 'Lanzador', 'salto'], retenedor: ['holder', 'Retenedor', 'espera'],
  placa: ['springplate0', 'Placa impulsora', 'saltos'], elevador: ['lift12', 'Elevador', 'contrapeso'],
} as const
export type TipoColocable = keyof typeof piezas
export const limitePiezasTaller = 200
export const gruposBandeja: { nombre: string; tipos: TipoColocable[] }[] = [
  { nombre: 'Extremos', tipos: ['inicio', 'meta'] },
  { nombre: 'Transmisión', tipos: ['domino', 'bolita', 'pendulo', 'balancin'] },
  { nombre: 'Apoyos', tipos: ['taco'] },
  { nombre: 'Conducción', tipos: ['rampa', 'canal', 'curva90', 'embudo'] },
  { nombre: 'Impulso y elevación', tipos: ['lanzador', 'placa', 'elevador'] },
  { nombre: 'Mandos', tipos: ['palanca', 'boton'] },
  { nombre: 'Receptores', tipos: ['compuerta', 'puerta', 'puente', 'retenedor'] },
  { nombre: 'Libros', tipos: ['libro', 'libroGrande', 'bolsillo', 'bolsilloGrande', 'atlas', 'atlasGrande', 'cuaderno'] },
  { nombre: 'Cajas', tipos: ['cajaGrapas', 'cajaGrapasGrande', 'cajaZapatos', 'cajaZapatosGrande', 'cajaCubica', 'cajaCubicaGrande', 'cajaUtiles', 'cajaTe', 'paquete'] },
  { nombre: 'Objetos de mesa', tipos: ['mate', 'pava', 'posavasos', 'yerbera', 'servilletero', 'taza', 'vasito', 'estuche', 'portalibros'] },
]
export type Saldo = Record<TipoColocable, number>
export const idsNiveles = ['recta','curva','libro','taza','vuelta','bajada','subibaja','salto','recepcion','puerta','disparo','puente','espera','saltos','contrapeso','mate','taza-llave','curva-laberinto','taller'] as const
export type IdNivel = typeof idsNiveles[number]
export const modelosNuevos: TipoColocable[] = ['bolsillo','atlas','cajaGrapas','cajaZapatos','cajaCubica','mate','pava','posavasos','yerbera','servilletero','libroGrande','bolsilloGrande','atlasGrande','cajaGrapasGrande','cajaZapatosGrande','cajaCubicaGrande']
export const tipos = Object.keys(piezas) as TipoColocable[]
export const pieceAsset = (tipo: TipoColocable, configuracion?: ConfiguracionDispositivo) => activoConfigurable(tipo, configuracion) ?? piezas[tipo][0]
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
  apoyos?: string[]
}
export const formatosMesa = {
  compacta: { nombre: 'Compacta · 42 × 26 cm', ancho: .42, fondo: .26 },
  mediana: { nombre: 'Mediana · 60 × 40 cm', ancho: .60, fondo: .40 },
  amplia: { nombre: 'Amplia · 80 × 50 cm', ancho: .80, fondo: .50 },
  cuadrada: { nombre: 'Cuadrada · 90 × 90 cm', ancho: .90, fondo: .90 },
  clasica: { nombre: 'Clásica · 84 × 52 cm', ancho: .84, fondo: .52 },
} as const
export type FormatoMesa = keyof typeof formatosMesa
export type ContextoNivel = 'campana' | 'mesa' | 'desafio'
export interface Nivel {
  version: 1
  revision: number
  id: IdNivel
  nombre: string
  contexto?: ContextoNivel
  identidad?: string
  motivo?: string
  formatoMesa?: FormatoMesa
  ordenFisico?: 'id' | 'geometria'
  permiteCableado?: boolean
  /** Typed source objects, shared by authoring, validation and campaign copies. */
  objetos?: PiezaColocada[]
  objetivo: string
  perfilFisico: string
  requiere: IdNivel | null
  varianteDe?: IdNivel
  inventario: Saldo
  instalacion?: { dispositivos: PiezaColocada[]; conexiones: ConexionInstalada[]; secuencias?: Secuencia[] }
  fijos: ObjetoDeNivel[]
  superficies: {
    id: string
    objeto: string
    zona: string
    admite: TipoColocable[]
    rect?: [number, number, number, number]
    altura?: number
    circular?: boolean
  }[]
  camara: { objetivo: Vec3; azimut: number; elevacion: number; altoVisible: number }
  empujon: { pieza: string; impulsoLocal: Vec3; puntoLocal: Vec3 }
}
export const contextoDe = (n: Nivel): ContextoNivel => n.contexto ?? (n.id === 'taller' ? 'mesa' : 'campana')
export const esMesaLibre = (n: Nivel) => contextoDe(n) === 'mesa'
export const puedeCablear = (n: Nivel) => esMesaLibre(n) || n.permiteCableado === true
export const objetosInstalados = (n: Nivel) => n.objetos ?? n.instalacion?.dispositivos ?? []
export const medidasMesa = (n: Nivel): [number, number] => {
  if (n.formatoMesa) { const m = formatosMesa[n.formatoMesa]; return [m.ancho, m.fondo] }
  const mesa = n.fijos.find(o => o.activo === 'table')
  return [.42 * (mesa?.escala?.[0] ?? 1), .26 * (mesa?.escala?.[2] ?? 1)]
}
export interface PiezaColocada<T extends TipoColocable = TipoColocable> extends Pose {
  id: string
  tipo: T
  apoyo: string
  apoyos?: string[]
  configuracion?: Extract<ConfiguracionDispositivo, { clase: T }>
}
export interface Conexion { mando: string; receptor: string }
export interface Secuencia { receptor: string; mandos: string[] }
export function secuenciasValidas(reglas: Secuencia[], cables: Conexion[]) {
  if (!Array.isArray(reglas)) return false
  const receptores = new Set<string>()
  for (const regla of reglas) {
    if (!regla || receptores.has(regla.receptor) || !Array.isArray(regla.mandos)) return false
    const entradas = cables.filter(c => c.receptor === regla.receptor).map(c => c.mando)
    if (entradas.length < 2 || regla.mandos.length !== entradas.length ||
        new Set(regla.mandos).size !== entradas.length || !entradas.every(id => regla.mandos.includes(id))) return false
    receptores.add(regla.receptor)
  }
  return true
}
export interface ConexionInstalada extends Conexion { guias: { objeto: string; local: Vec3 }[] }
export const esMando = (t: TipoColocable) => !!dispositivos[t]?.entrada
export const esReceptor = (t: TipoColocable) => !!dispositivos[t]?.salida
export const apoyosDe = (p: PiezaColocada) => p.apoyos ?? [p.apoyo]
export interface Armado {
  conexiones?: Conexion[]
  secuencias?: Secuencia[]
  nivel: IdNivel
  revision: number
  perfilFisico: string
  piezas: PiezaColocada[]
  saldo: Saldo
}
export const perfil = {
  id: 'dispositivos-1',
  paso: 1 / 120,
  friccion: 0.5,
  restitucion: 0.05,
  separacion: 0.027,
  descarte: -0.1,
  ventanaReposo: 60,
}
