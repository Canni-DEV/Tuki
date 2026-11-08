import { beforeAll, expect, it } from 'vitest'
import * as THREE from 'three'
import { Mesa } from '../src/scene'
import { surfaceRect } from '../src/levels'
import { initPhysics } from '../src/simulation'
import { nivelTaller } from '../src/taller'
import type { Vec3 } from '../src/types'

beforeAll(initPhysics)

// Exercise the production screen ray and support resolver without a WebGL context.
function escenario(alturaPantalla: number) {
  const n = nivelTaller('Prueba de visibilidad')
  const solido = (id: string, medida: Vec3, centro: Vec3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...medida))
    m.position.fromArray(centro)
    m.userData.piece = id
    m.updateMatrixWorld()
    return m
  }
  const fijos = [solido('mesa', [.84, .012, .52], [0, -.006, 0]), solido('guia', [.026, .013, .09], [0, .0065, 0])]
  n.fijos.push({ id: 'guia', activo: 'channel', posicion: [0, 0, 0], giroY: 0, apoyo: 'tablero', rol: 'mecanismo' })
  if (alturaPantalla) {
    fijos.push(solido('pantalla', [.16, alturaPantalla, .008], [0, alturaPantalla / 2, .05]))
    n.fijos.push({
      id: 'pantalla', activo: 'casebox', posicion: [0, 0, .05], giroY: 0,
      escala: [.16 / .14, alturaPantalla / .018, .008 / .085], apoyo: 'tablero', rol: 'escenario'
    })
  }
  const camera = new THREE.OrthographicCamera(-.2, .2, .15, -.15, .001, 3)
  const mesa: Mesa = Object.assign(Object.create(Mesa.prototype), {
    nivel: n, camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0)),
    surfaces: n.superficies.map(s => ({ ...s, ...surfaceRect(n, s.id) })),
    lastPieces: [], pickables: new Map(), fixedOccluders: fijos, limitesModelo: new Map(),
    loaded: new Map([['funnel', solido('embudo', [.054, .048, .054], [0, .024, 0])]]),
  })
  return (ojo: Vec3) => {
    camera.position.fromArray(ojo)
    camera.up.set(0, ojo[2] ? 1 : 0, ojo[2] ? 0 : -1)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const puntero = mesa.proyectar([0, 0, 0])
    const visible = mesa.previaVisible({ tipo: 'embudo', id: 'previa', giroY: 0, apoyo: 'tablero', posicion: [0,0,0] })
    return { pose: mesa.apuntar(puntero.x, puntero.y, 'embudo', undefined, 0), motivo: mesa.motivoPuntero, visible }
  }
}

it('el rayo atraviesa el espacio entre las patas aunque la canaleta fija sea la primera intersección', () => {
  const apuntar = escenario(0)
  for (const ojo of [[0, .5, 0], [0, .2, .25], [.2, .15, -.17], [-.2, .32, .1]] as Vec3[]) {
    const { pose } = apuntar(ojo)
    expect(pose?.apoyo).toBe('tablero')
    for (const valor of pose!.posicion) expect(valor).toBeCloseTo(0, 6)
  }
})
it('admite patas tapadas con la boca a la vista y rechaza un embudo completamente oculto', () => {
  const ojo: Vec3 = [0, .20, .25]
  expect(escenario(.055)(ojo).pose?.apoyo).toBe('tablero')
  const rotar = escenario(.16)
  expect(rotar([0,.5,0]).visible).toBe(true)
  expect(rotar(ojo)).toEqual({ pose: null, motivo: 'Girá la cámara para ver la pieza', visible: false })
  expect(rotar([0,.5,0]).visible).toBe(true)
})
