import recta from './data/recta.json'
import curva from './data/curva.json'
import libro from './data/libro.json'
import taza from './data/taza.json'
import vuelta from './data/vuelta.json'
import subibaja from './data/subibaja.json'
import puente from './data/puente.json'
import llave from './data/taza-llave.json'
import { assetIds, leverSeat } from './shapes'
import { tipos, perfil, pieceAsset, inventario, type PiezaColocada, type Nivel, type IdNivel, type Vec3, type Armado } from './types'
export { pieceAsset } from './types'

export function validarNivel(n: Nivel): Nivel {
  const fail = (campo: string): never => {
    throw new Error('Nivel ' + n.id + ' · ' + campo)
  }
  const v = (a: unknown): a is Vec3 => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite)
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
        (s.zona === 'tapa' && ['table', 'book'].includes(obj.activo)) ||
        (s.zona === 'asiento' && ['cradle', 'seesaw'].includes(obj.activo))
      ) ||
      !s.admite.every((t) => tipos.includes(t)) ||
      (s.rect &&
        (s.rect.length !== 4 || !s.rect.every(Number.isFinite) || s.rect[2] <= 0 || s.rect[3] <= 0)) ||
      (s.altura !== undefined && !Number.isFinite(s.altura))
    )
      fail(s.id)
  }
  const disponibles = { ...n.inventario }
  for (const p of n.iniciales ?? []) {
    if (ids.has(p.id) || !tipos.includes(p.tipo) || --disponibles[p.tipo] < 0 ||
      !v(p.posicion) || !Number.isFinite(p.giroY)) fail('piezas iniciales')
    ids.add(p.id)
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
export const campana = [recta, curva, libro, taza, vuelta, subibaja, puente].map((n) => validarNivel(n as Nivel))
export const niveles = [...campana, validarNivel(llave as Nivel)]
export const nivelPorId = (id: IdNivel) => niveles.find((n) => n.id === id)!
export function vacio(n: Nivel): Armado {
  const piezas = structuredClone(n.iniciales ?? [])
  const saldo = { ...n.inventario }
  for (const p of piezas) saldo[p.tipo]--
  return {
    nivel: n.id,
    revision: n.revision,
    perfilFisico: n.perfilFisico,
    piezas, saldo,
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

export function conApoyos(n: Nivel, piezas: PiezaColocada[]): Nivel {
  const fijos = [...n.fijos], superficies = [...n.superficies]
  for (const p of piezas) {
    if (!['libro', 'balancin', 'cuna'].includes(p.tipo)) continue
    fijos.push({ ...p, activo: pieceAsset(p.tipo), rol: 'mecanismo' })
    const libro = p.tipo === 'libro', lever = p.tipo === 'balancin'
    superficies.push({
      id: p.id + '/apoyo', objeto: p.id, zona: libro ? 'tapa' : 'asiento', admite: libro ? tipos : ['bolita'],
      rect: libro ? [0, 0, .14, .085] : lever ? [0, leverSeat.z, .029, .020] : [0, 0, .02, .021],
      altura: libro ? .018 : lever ? leverSeat.y : .008
    })
  }
  return { ...n, fijos, superficies }
}
