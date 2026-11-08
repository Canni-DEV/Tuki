import recta from './data/recta.json'
import curva from './data/curva.json'
import libro from './data/libro.json'
import taza from './data/taza.json'
import llave from './data/taza-llave.json'
import { assetIds } from './shapes'
import { tipos, perfil, type Nivel, type IdNivel, type Vec3, type Armado } from './types'
export { pieceAsset } from './types'

export function validarNivel(n: Nivel): Nivel {
  const fail = (campo: string): never => {
    throw new Error('Nivel ' + n.id + ' · ' + campo)
  }
  const v = (a: unknown): a is Vec3 => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)
  if (n.version !== 1 || !Number.isInteger(n.revision) || n.perfilFisico !== perfil.id)
    fail('versión o perfil físico')
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
        (s.zona === 'tapa' && ['table', 'book'].includes(obj.activo)) ||
        (s.zona === 'asiento' && obj.activo === 'cradle')
      ) ||
      !s.admite.every((t) => tipos.includes(t)) ||
      (s.rect &&
        (s.rect.length !== 4 || !s.rect.every(Number.isFinite) || s.rect[2] <= 0 || s.rect[3] <= 0)) ||
      (s.altura !== undefined && !Number.isFinite(s.altura))
    )
      fail(s.id)
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
export const campana = [recta, curva, libro, taza].map((n) => validarNivel(n as Nivel))
export const niveles = [...campana, validarNivel(llave as Nivel)]
export const nivelPorId = (id: IdNivel) => niveles.find((n) => n.id === id)!
export function vacio(n: Nivel): Armado {
  return {
    nivel: n.id,
    revision: n.revision,
    perfilFisico: n.perfilFisico,
    piezas: [],
    saldo: { ...n.inventario },
  }
}
export function surfaceRect(n: Nivel, id: string) {
  const s = n.superficies.find((a) => a.id === id)!
  const o = n.fijos.find((a) => a.id === s.objeto)!
  const [sx, sy, sz] = o.escala ?? [1, 1, 1]
  const [lx, lz, w, d] =
    s.rect ??
    (o.activo === 'book'
      ? [0, 0, 0.14, 0.085]
      : o.activo === 'cradle'
        ? [0, 0, 0.02, 0.021]
        : [0, 0, 0.42, 0.26])
  const ang = (o.giroY * Math.PI) / 180,
    c = Math.cos(ang),
    sin = Math.sin(ang)
  return {
    x: o.posicion[0] + lx * sx * c + lz * sz * sin,
    z: o.posicion[2] - lx * sx * sin + lz * sz * c,
    y: o.posicion[1] + sy * (s.altura ?? (o.activo === 'book' ? 0.018 : o.activo === 'cradle' ? 0.008 : 0)),
    w: w * sx,
    d: d * sz,
    ang,
  }
}
