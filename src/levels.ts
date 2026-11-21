import salto from './data/salto.json'
import recepcion from './data/recepcion.json'
import disparo from './data/disparo.json'
import espera from './data/espera.json'
import saltos from './data/saltos.json'
import contrapeso from './data/contrapeso.json'
import { configurable, configuracionValida, dispositivos } from './dispositivos'
import recta from './data/recta.json'
import curva from './data/curva.json'
import laberinto from './data/curva-laberinto.json'
import libro from './data/libro.json'
import taza from './data/taza.json'
import vuelta from './data/vuelta.json'
import subibaja from './data/subibaja.json'
import mate from './data/mate.json'
import bajada from './data/bajada.json'
import puente from './data/puente.json'
import puerta from './data/puerta.json'
import llave from './data/taza-llave.json'
import { assetIds, escenario } from './shapes'
import { compilarEscenario, apoyoDeObjeto } from './escenarios'
import { objetosInstalados, secuenciasValidas, esMando, esReceptor, type ObjetoDeNivel, tipos, perfil, pieceAsset, inventario, type PiezaColocada, type Nivel, type IdNivel, type Vec3, type Armado } from './types'
export { pieceAsset } from './types'

export function objetosDeNivel(n: Nivel): ObjetoDeNivel[] {
  if (n.objetos) return n.fijos
  return [...n.fijos, ...(n.instalacion?.dispositivos ?? []).map(p => ({ ...p, activo: pieceAsset(p.tipo, p.configuracion), rol: 'mecanismo' as const }))]
}

export function validarNivel(n: Nivel): Nivel {
  const fail = (campo: string): never => {
    throw new Error('Nivel ' + n.id + ' · ' + campo)
  }
  const v = (a: unknown): a is Vec3 => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)
  if (n.objetos) {
    if (!n.formatoMesa || !n.motivo?.trim()) fail('formato o motivo ausente')
    for(const p of n.objetos) if(!tipos.includes(p.tipo) || Object.hasOwn(p,'escala') || !v(p.posicion) || !Number.isFinite(p.giroY) || !configuracionValida(p.tipo,p.configuracion)) fail('objeto de catálogo')
    const compilado = compilarEscenario(n.nombre,n.formatoMesa!,n.objetos,n.instalacion?.conexiones,n.instalacion?.secuencias)
    n = {...n,fijos:compilado.fijos,superficies:compilado.superficies,instalacion:compilado.instalacion,contexto:'campana'}
  }
  if (n.version !== 1 || !Number.isInteger(n.revision) || n.perfilFisico !== perfil.id)
    fail('versión o perfil físico')
  if (!n.inventario || !['domino', 'bolita', 'rampa', 'embudo'].every(t => Object.hasOwn(n.inventario, t))) fail('inventario')
  n = { ...n, inventario: inventario(n.inventario) }
  if (tipos.some((t) => !Number.isInteger(n.inventario[t]) || n.inventario[t] < 0)) fail('inventario')
  const ids = new Set(n.fijos.map((o) => o.id)),
    apoyos = new Set(n.superficies.map((s) => s.id))
  if (ids.size !== n.fijos.length || apoyos.size !== n.superficies.length) fail('identificadores repetidos')
  for (const o of n.fijos)
    if (
      !assetIds.includes(o.activo) ||
      !v(o.posicion) ||
      !Number.isFinite(o.giroY) ||
      (o.escala && (!v(o.escala) || o.escala.some((x) => x <= 0))) ||
      (o.apoyo && !apoyos.has(o.apoyo))
    )
      fail(o.id)
  for (const s of n.superficies) {
    const obj = n.fijos.find((o) => o.id === s.objeto)
    if (
      !obj ||
      !(
        (n.objetos?.some(p=>p.id===s.objeto && dispositivos[p.tipo]?.apoyo)) ||
        (s.zona === 'tapa' && (!!escenario[obj.activo]?.tapa || ['table', 'spacer'].includes(obj.activo))) ||
        (s.zona === 'asiento' && ['seesaw'].includes(obj.activo))
      ) ||
      !s.admite.every((t) => tipos.includes(t)) ||
      (s.rect &&
        (s.rect.length !== 4 || !s.rect.every(Number.isFinite) || s.rect[2] <= 0 || s.rect[3] <= 0)) ||
      (s.altura !== undefined && !Number.isFinite(s.altura))
    )
      fail(s.id)
  }
  if (!n.objetos && (n.fijos.some(o => o.rol === 'mecanismo' ||
    (o.rol === 'escenario' && !escenario[o.activo] && !['table', 'pencilcase'].includes(o.activo))))) fail('escenario de campaña')
  if (tipos.some(t => (esMando(t) || (esReceptor(t) && !configurable(t))) && n.inventario[t])) fail('dispositivos en bandeja')
  if (n.instalacion) {
    const { dispositivos, conexiones } = n.instalacion
    const pares = new Set<string>()
    for (const p of dispositivos) {
      if (!configuracionValida(p.tipo,p.configuracion) || (!n.objetos && ids.has(p.id)) || !(esMando(p.tipo) || esReceptor(p.tipo) || configurable(p.tipo)) || !v(p.posicion) ||
          !Number.isFinite(p.giroY) || !apoyos.has(p.apoyo)) fail('dispositivo ' + p.id)
      ids.add(p.id)
    }
    for (const c of conexiones) {
      const par = JSON.stringify([c.mando, c.receptor])
      if (pares.has(par) || !dispositivos.some(p => p.id === c.mando && esMando(p.tipo)) ||
          !dispositivos.some(p => p.id === c.receptor && esReceptor(p.tipo)) ||
          !c.guias.every(g => n.fijos.some(o => o.id === g.objeto) && v(g.local))) fail('circuito instalado')
      pares.add(par)
    }
    if (!secuenciasValidas(n.instalacion.secuencias ?? [], conexiones)) fail('secuencia instalada')
  }
  for (const rol of ['inicio', 'meta'])
    if (
      n.fijos.filter((o) => o.rol === rol).length !== 1 ||
      !n.fijos.some((o) => o.id === rol && o.rol === rol && o.activo === 'domino')
    )
      fail(rol)
  if (n.empujon.pieza !== 'inicio' || !v(n.empujon.impulsoLocal) || !v(n.empujon.puntoLocal)) fail('empujón')
  if (
    !v(n.camara.objetivo) ||
    ![n.camara.altoVisible, n.camara.azimut, n.camara.elevacion].every(Number.isFinite) ||
    n.camara.altoVisible <= 0
  )
    fail('cámara')
  return n
}
export const campana = [recta, curva, libro, taza, vuelta, bajada, subibaja, salto, recepcion, puerta, disparo, puente, espera, saltos, contrapeso, mate].map((n) => validarNivel(n as Nivel))
export const variantes = [llave, laberinto].map(n => validarNivel(n as Nivel))
export const niveles = [...campana, ...variantes]
export const nivelPorId = (id: IdNivel) => niveles.find((n) => n.id === id)!
export function vacio(n: Nivel): Armado {
  const piezas: PiezaColocada[] = []
  const saldo = { ...n.inventario }
  return {
    nivel: n.id,
    revision: n.revision,
    perfilFisico: n.perfilFisico,
    piezas, saldo, conexiones: [],
  }
}
// Expanded levels are immutable snapshots of a placement proposal. Share the transformed
// surfaces while checking all its pieces, without caching mutable campaign definitions.
type RectApoyo = ReturnType<typeof medirSuperficie>
const rectangulos = new WeakMap<Nivel, Map<string, RectApoyo>>()
export function surfaceRect(n: Nivel, id: string): RectApoyo {
  const cache = rectangulos.get(n)
  let rect = cache?.get(id)
  if (!rect) { rect = medirSuperficie(n,id); cache?.set(id,rect) }
  return rect
}
function medirSuperficie(n: Nivel, id: string) {
  const s = n.superficies.find((a) => a.id === id)!
  const o = n.fijos.find((a) => a.id === s.objeto)!
  const [sx, sy, sz] = o.escala ?? [1, 1, 1]
  const tapa = escenario[o.activo]?.tapa
  const [lx, lz, w, d] =
    s.rect ??
    (tapa
      ? [0, 0, tapa.ancho, tapa.fondo]
      : [0, 0, 0.42, 0.26])
  const ang = (o.giroY * Math.PI) / 180,
    c = Math.cos(ang),
    sin = Math.sin(ang)
  return {
    x: o.posicion[0] + lx * sx * c + lz * sz * sin,
    z: o.posicion[2] - lx * sx * sin + lz * sz * c,
    y: o.posicion[1] + sy * (s.altura ?? tapa?.altura ?? 0),
    w: w * sx,
    d: d * sz,
    ang,
  }
}

export function ofreceApoyo(tipo: PiezaColocada['tipo']) {
  return !!escenario[pieceAsset(tipo)]?.tapa || !!dispositivos[tipo]?.apoyo || ['taco', 'balancin'].includes(tipo)
}

export function conApoyos(n: Nivel, piezas: PiezaColocada[]): Nivel {
  const fijos = [...n.fijos], superficies = [...n.superficies]
  const instalados = objetosInstalados(n)
  for (const p of [...instalados, ...piezas]) {
    const apoyo = ofreceApoyo(p.tipo)
    if (!apoyo && !instalados.includes(p)) continue
    if (!fijos.some(o => o.id === p.id)) fijos.push({ ...p, activo: pieceAsset(p.tipo, p.configuracion), rol: 'mecanismo' })
    if (!apoyo) continue
    if (superficies.some(s => s.id === p.id + '/apoyo')) continue
    const superficie = apoyoDeObjeto(p)
    if (superficie) superficies.push(superficie)
  }
  const expandido = { ...n, fijos, superficies }
  rectangulos.set(expandido,new Map())
  return expandido
}
