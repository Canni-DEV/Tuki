import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { colliders, volumeColliders, yaw } from './geometry'
import { bases, escenario, shapes } from './shapes'
import { apoyosDe, perfil, pieceAsset, piezas as catalogo, type Armado, type PiezaColocada } from './types'

export interface FalloEquilibrio { pieza: string; mensaje: string }
const padres = (p: PiezaColocada) => apoyosDe(p).filter(s => s !== 'tablero').map(s => s.split('/')[0])

// The tabletop is a fixed boundary, not a link between independent stacks.
export function piezasParaEnsayo(piezas: PiezaColocada[], antes?: Armado) {
  const red = new Map<string, Set<string>>()
  const vecinos = (id: string) => {
    if (!red.has(id)) red.set(id, new Set())
    return red.get(id)!
  }
  const previas = antes?.piezas ?? []
  for (const p of [...previas, ...piezas]) for (const padre of padres(p)) {
    vecinos(p.id).add(padre); vecinos(padre).add(p.id)
  }
  const actuales = new Map(piezas.map(p => [p.id, p]))
  const prev = new Map(previas.map(p => [p.id, p]))
  const cambios = (antes?.version ?? 2) >= 3
    ? [...piezas.filter(p => p !== prev.get(p.id)), ...previas.filter(p => !actuales.has(p.id))].map(p => p.id)
    : piezas.map(p => p.id)
  const vistos = new Set<string>(), resultado: PiezaColocada[] = []
  for (const id of cambios) {
    if (vistos.has(id)) continue
    const cola = [id], grupo: PiezaColocada[] = []
    vistos.add(id)
    for (let i = 0; i < cola.length; i++) {
      const p = actuales.get(cola[i])
      if (p) grupo.push(p)
      for (const vecino of red.get(cola[i]) ?? []) if (!vistos.has(vecino)) { vistos.add(vecino); cola.push(vecino) }
    }
    if (grupo.some(p => escenario[pieceAsset(p.tipo)])) resultado.push(...grupo)
  }
  return resultado
}

const masas: Record<string, number> = {
  domino: .012, ball: .006, spacer: .011, channel: .025, ramp: .042,
  funnel: .035, pendulum: .048, seesaw: .032, drawbridge: .038, door: .035,
  shutter: .048, button: .014, switch: .014,
}
const longitud = (v: R.Vector) => Math.hypot(v.x, v.y, v.z)

// On a fully supported vertical prism, every downward load on the lid acts inside
// the sole. Its reaction can be transferred exactly to the lower body. Keeping both
// masses in that body prevents solver compression from accumulating up tall stacks.
function cargaConBaseCompleta(p: PiezaColocada, padre?: PiezaColocada) {
  const asset = pieceAsset(p.tipo)
  const tapa = padre && escenario[pieceAsset(padre.tipo)]?.tapa
  if (!padre || !tapa || !escenario[asset]) return false
  const volumen = shapes(asset)
  // Terminal props have no building surface and can only apply their own weight.
  if (escenario[asset]?.tapa && (volumen.length !== 1 || !['box', 'cylinder'].includes(volumen[0].kind))) return false
  const inversa = yaw(padre.giroY).invert()
  const centro = new Vector3(...p.posicion).sub(new Vector3(...padre.posicion)).applyQuaternion(inversa)
  const relativo = inversa.multiply(yaw(p.giroY))
  if (volumen.length === 1 && volumen[0].kind === 'cylinder') {
    const r = volumen[0].size[0] / 2
    return tapa.circular ? Math.hypot(centro.x, centro.z) + r <= tapa.ancho / 2 + 1e-9 :
      Math.abs(centro.x) + r <= tapa.ancho / 2 + 1e-9 && Math.abs(centro.z) + r <= tapa.fondo / 2 + 1e-9
  }
  const huella = bases(asset).flat()
  return huella.length > 0 && huella.every(([x, z]) => {
    const punto = new Vector3(x, 0, z).applyQuaternion(relativo).add(centro)
    return tapa.circular ? Math.hypot(punto.x, punto.z) <= tapa.ancho / 2 + 1e-9 :
      Math.abs(punto.x) <= tapa.ancho / 2 + 1e-9 && Math.abs(punto.z) <= tapa.fondo / 2 + 1e-9
  })
}

function montarCarga(mundo: R.World, cuerpo: R.RigidBody, p: PiezaColocada, propietarios: Map<number, string>) {
  const asset = pieceAsset(p.tipo), ficha = escenario[asset]
  const volumenes = volumeColliders(asset)
  if (ficha) {
    // The mass and centre of mass belong to the whole object, including hollow vessels.
    const base = volumenes[0], inversa = new Quaternion().copy(base.rotation).invert()
    const centro = new Vector3(...ficha.centro).sub(base.translation).applyQuaternion(inversa)
    const [w, d] = ficha.tamanoEnPlanta, h = Math.max(shapes(asset)[0].size[1], 2 * ficha.centro[1])
    const factor = ficha.masa / 12
    const inercia = { x: factor * (h * h + d * d), y: factor * (w * w + d * d), z: factor * (w * w + h * h) }
    base.setMassProperties(ficha.masa, centro, inercia, inversa)
    // Tangent spheres inside each round foot provide distributed contacts from step zero.
    for (const pie of bases(asset)) {
      if (pie.length < 8) continue
      const radio = .0003
      for (let j = 0; j < 8; j++) {
        const [x, z] = pie[Math.floor(j * pie.length / 8)]
        const k = 1 - radio / Math.hypot(x, z)
        volumenes.push(R.ColliderDesc.ball(radio).setTranslation(x * k, radio, z * k))
      }
    }
    for (const c of volumenes.slice(1)) c.setDensity(0)
  }
  const inversa = new Quaternion().copy(cuerpo.rotation()).invert()
  const local = new Vector3(...p.posicion).sub(cuerpo.translation()).applyQuaternion(inversa)
  const rotacion = inversa.multiply(yaw(p.giroY))
  const instalados = volumenes.map(c => {
    const pos = new Vector3().copy(c.translation).applyQuaternion(rotacion).add(local)
    const giro = new Quaternion().copy(c.rotation).premultiply(rotacion)
    c.setTranslation(pos.x, pos.y, pos.z).setRotation(giro)
    c.setFriction(perfil.friccion).setRestitution(0).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS)
    const collider = mundo.createCollider(c, cuerpo)
    propietarios.set(collider.handle, p.id)
    return collider
  })
  if (!ficha && !cuerpo.isFixed()) {
    const volumen = instalados.reduce((total, c) => total + c.volume(), 0)
    const densidad = (masas[asset] ?? .020) / volumen
    for (const c of instalados) c.setDensity(densidad)
  }
}

export function ensayarEquilibrio(piezas: PiezaColocada[]): FalloEquilibrio | null {
  if (!piezas.length) return null
  const mundo = new R.World({ x: 0, y: -9.81, z: 0 })
  const eventos = new R.EventQueue(true)
  try {
    mundo.timestep = perfil.paso
    mundo.lengthUnit = .05
    mundo.numSolverIterations = 12
    // Stiff contacts prevent numerical compression from consuming the 1 mm placement tolerance.
    mundo.integrationParameters.contact_natural_frequency = 240
    mundo.integrationParameters.numInternalPgsIterations = 4
    const suelo = mundo.createRigidBody(R.RigidBodyDesc.fixed())
    const tablero = mundo.createCollider(colliders('table', [2, 1, 2])[0].setFriction(perfil.friccion), suelo)
    const propietarios = new Map([[tablero.handle, 'tablero']])
    const apoyos = new Map(piezas.map(p => [p.id, new Set(apoyosDe(p).map(id => id.split('/')[0]))]))
    const contactos: R.PhysicsHooks = {
      filterContactPair(a, b) {
        const id = propietarios.get(a)!, otro = propietarios.get(b)!
        return apoyos.get(id)?.has(otro) || apoyos.get(otro)?.has(id) ? R.SolverFlags.COMPUTE_IMPULSE : null
      },
      filterIntersectionPair: () => true,
    }
    const orden = [...piezas].sort((a, b) => a.posicion[1] - b.posicion[1] || a.id.localeCompare(b.id))
    const porId = new Map(orden.map(p => [p.id, p]))
    const cuerpos = new Map<string, R.RigidBody>()
    const vigilados: { pieza: PiezaColocada; cuerpo: R.RigidBody; giro: Quaternion; reposo: number; excedido: boolean }[] = []
    for (const p of orden) {
      const padresPieza = padres(p), giro = yaw(p.giroY)
      // Single-support mechanisms are rigid loads at their authored rest pose.
      const cargaRigida = !escenario[pieceAsset(p.tipo)] || cargaConBaseCompleta(p, porId.get(padresPieza[0]))
      let cuerpo = cargaRigida && padresPieza.length <= 1 ? cuerpos.get(padresPieza[0]) ?? suelo : undefined
      if (!cuerpo) {
        cuerpo = mundo.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...p.posicion).setRotation(giro).setCanSleep(false))
        vigilados.push({ pieza: p, cuerpo, giro, reposo: 0, excedido: false })
      }
      cuerpos.set(p.id, cuerpo)
      montarCarga(mundo, cuerpo, p, propietarios)
    }

    let primerDesvio: number | undefined
    const rotacion = new Quaternion()
    for (let paso = 0; paso < 240; paso++) {
      mundo.step(eventos, contactos)
      for (const v of vigilados) {
        const pos = v.cuerpo.translation(), [x, y, z] = v.pieza.posicion
        const distancia = Math.hypot(pos.x - x, pos.y - y, pos.z - z)
        const angulo = rotacion.copy(v.cuerpo.rotation()).normalize().angleTo(v.giro)
        if (distancia > .001 || angulo > Math.PI / 180) {
          v.excedido = true
          primerDesvio ??= paso
        }
        const quieto = longitud(v.cuerpo.linvel()) < .005 && longitud(v.cuerpo.angvel()) < .10
        v.reposo = quieto ? v.reposo + 1 : 0
      }
      // Let the tipping support become observable before its falling load hits another object.
      if (primerDesvio !== undefined && paso - primerDesvio >= 4) break
    }
    const falla = vigilados.find(v => v.excedido) ?? vigilados.find(v => v.reposo < 60)
    if (!falla) return null
    return { pieza: falla.pieza.id, mensaje: catalogo[falla.pieza.tipo][1] + ' pierde el equilibrio. Acercá el peso al apoyo.' }
  } finally {
    eventos.free()
    mundo.free()
  }
}
