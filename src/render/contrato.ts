// The two Three.js versions meet only through browser primitives and plain data.
// No Object3D, Material, Texture, Camera or renderer crosses this boundary.
export type Calidad = 'alta' | 'equilibrada'
export type BackendComparacion = 'webgl2' | 'webgpu'
export type EfectoComparacion = 'base' | 'contacto' | 'ssgi' | 'ssr'
export type Numeros = Float32Array | Float64Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array | Uint8ClampedArray
export interface Atributo { array: Numeros; itemSize: number; normalized: boolean }
export interface Geometria {
  id: string
  attributes: Record<string, Atributo>
  index?: Atributo
  groups: { start: number; count: number; materialIndex?: number }[]
  drawRange: { start: number; count: number }
}
export interface Textura {
  id: string; version: number; image: TexImageSource
  flipY: boolean; colorSpace: string; wrapS: number; wrapT: number
  repeat: number[]; offset: number[]; rotation: number; center: number[]
}
export interface MaterialVisual {
  id: string; name: string; type: string; color: number[]; emissive: number[]
  roughness: number; metalness: number; opacity: number; transparent: boolean
  depthWrite: boolean; depthTest: boolean; side: number; blending: number
  toneMapped: boolean; vertexColors: boolean; map?: Textura
  rotation?: number; dashSize?: number; gapSize?: number
  canto?: { recorrido: number; fuerza: number }
  tiempoVictoria?: number
}
export interface ObjetoVisual {
  id: string; name: string; asset: string; piece: string; type: string
  matrix: number[]; renderOrder: number; castShadow: boolean; receiveShadow: boolean
  geometry?: Geometria; materials: MaterialVisual[]; center?: number[]
}
export interface LuzVisual {
  type: string; position: number[]; target: number[]
  shadow: { near: number; far: number; left?: number; right?: number; top?: number; bottom?: number; focus: number }
}
export interface CuadroVisual {
  objects: ObjetoVisual[]; lights: LuzVisual[]; dark: boolean
  camera: { matrix: number[]; projection: number[]; near: number; far: number; zoom: number } & (
    { type: 'orthographic'; left: number; right: number; top: number; bottom: number } |
    { type: 'perspective'; fov: number; aspect: number })
  width: number; height: number; dpr: number
}
export interface OpcionesVisuales {
  canvas: HTMLCanvasElement; backend: BackendComparacion; quality: Calidad
  resourceURL: string; onFailure: (reason: string) => void
  effect?: EfectoComparacion
  signal?: AbortSignal
  onFirstFrame?: () => void
}
export interface SesionVisual {
  update(frame: CuadroVisual): void
  compile(): Promise<void>
  render(): void
  setProbe(active: boolean): void
  waitForGPU(): Promise<void>
  thumbnail(frame: CuadroVisual): Promise<string>
  simulateDeviceLoss(): void
  dispose(): void
  statistics(): { backend: string; revision: string; objects: number; geometries: number; materials: number; textures: number; width: number; height: number;
    timing: { resourcesMs:number; environmentMs:number; compileMs:number; firstFrameAt:number }; memory:{geometries:number;textures:number} }
}
export interface ModuloVisual { create(options: OpcionesVisuales): Promise<SesionVisual> }
