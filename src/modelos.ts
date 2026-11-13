import * as THREE from 'three'
import type { Vec3 } from './types'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { assemblies, shapes, partRotation } from './shapes'

const models = new Map<string, Promise<THREE.Group>>()
const gltf = new GLTFLoader()
// Small fittings share geometry across the tray thumbnail, the ghost and the physical model.
const laton = new THREE.MeshStandardMaterial({ color: 0xc29852, metalness: .52, roughness: .38 })
const acero = new THREE.MeshStandardMaterial({ color: 0x586967, metalness: .6, roughness: .44 })
function herrajes(asset: string, root: THREE.Group) {
  const cilindro = (radio: number, largo: number, posicion: Vec3, material = laton) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, largo, 16), material)
    m.position.fromArray(posicion)
    root.add(m)
    return m
  }
  if (asset === 'shutter') {
    const perfil = new THREE.Shape()
    for (let i = 0; i < 40; i++) {
      const angulo = 2 * Math.PI * i / 40, radio = i % 4 < 2 ? .004 : .0031
      const x = radio * Math.cos(angulo), y = radio * Math.sin(angulo)
      if (i) perfil.lineTo(x, y)
      else perfil.moveTo(x, y)
    }
    perfil.closePath()
    const pinon = new THREE.Mesh(new THREE.ExtrudeGeometry(perfil, { depth: .0012, bevelEnabled: false }), laton)
    pinon.name = 'pinon'
    pinon.position.set(-.0165, .0148, -.0062)
    root.add(pinon)
    cilindro(.0012, .007, [-.0165, .0148, -.0035], acero).rotation.x = Math.PI / 2
  }
  if (asset === 'door') {
    cilindro(.002, .028, [0, .015, 0])
    cilindro(.0033, .006, [0, .005, 0], acero)
    cilindro(.0025, .006, [0, .003, -.042], acero)
  }
  if (asset === 'drawbridge') {
    const pasador = cilindro(.0015, .011, [.017, .014, .004])
    pasador.name = 'pasador'
    pasador.rotation.z = Math.PI / 2
    const guia = new THREE.Mesh(new THREE.BoxGeometry(.005, .016, .006), acero)
    guia.position.set(.020, .008, .004)
    root.add(guia)
  }
  return root
}

export function loadModel(asset: string): Promise<THREE.Group> {
  let model = models.get(asset)
  if (!model) {
    const parts = assemblies[asset]
    if (parts) {
      model = Promise.all(parts.map(async p => {
        const child = (await loadModel(p.asset)).clone(true)
        child.name = p.key
        child.position.fromArray(p.at)
        child.quaternion.copy(partRotation(p))
        return child
      })).then(children => herrajes(asset, new THREE.Group().add(...children))).catch(error => { models.delete(asset); throw error })
      models.set(asset, model)
      return model
    }
    model = gltf.loadAsync(`${import.meta.env.BASE_URL}models/${asset}.glb`)
      .then(({ scene }) => scene)
      .catch(() => {
        models.delete(asset)
        throw new Error(`No se pudo cargar el modelo «${asset}».`)
      })
    models.set(asset, model)
  }
  return model
}

export function instance(source: THREE.Group, id: string) {
  const root = source.clone(true)
  const variant = Array.from(id).reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0) % 3
  root.traverse(node => {
    if (node.name === 'pipset_1') node.visible = variant >= 1
    if (node.name === 'pipset_2') node.visible = variant === 2
    if (node instanceof THREE.Mesh) {
      node.castShadow = true
      node.receiveShadow = true
      node.userData.piece = id
    }
  })
  return root
}

const joinery = new THREE.MeshStandardMaterial({ color: 0x9c7049, roughness: .9 })
export function tableFrame() {
  const frame = new THREE.Group()
  const [width, thickness, depth] = shapes('table')[0].size
  const beam = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), joinery)
    mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true
    frame.add(mesh)
  }
  const insetX = width/2-.025, insetZ = depth/2-.025
  for (const x of [-insetX,insetX]) for (const z of [-insetZ,insetZ]) {
    beam(x,-thickness-.067,z,.014,.134,.014)
  }
  for (const z of [-insetZ,insetZ]) beam(0,-thickness-.007,z,2*insetX,.014,.007)
  for (const x of [-insetX,insetX]) beam(x,-thickness-.007,0,.007,.014,2*insetZ)
  frame.traverse(node => { if (node instanceof THREE.Mesh) node.userData.generated = true })
  return frame
}
