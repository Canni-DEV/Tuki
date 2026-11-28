import * as THREE from 'three'
import type { Atributo, CuadroVisual, Geometria, MaterialVisual, ObjetoVisual, Textura } from './contrato'

export class PresentacionRender {
  private geometries = new WeakMap<THREE.BufferGeometry, { versions: string; value: Geometria }>()
  private attribute(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Atributo {
    // Deinterleave once; mutable buffers are rebuilt when their version changes.
    if (a instanceof THREE.InterleavedBufferAttribute) {
      const data = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) data[i * a.itemSize + c] = a.getComponent(i, c)
      return { array: data, itemSize: a.itemSize, normalized: false }
    }
    return { array: a.array.slice(), itemSize: a.itemSize, normalized: a.normalized }
  }
  private geometry(g: THREE.BufferGeometry): Geometria {
    const versions = Object.entries(g.attributes).map(([n, a]) => `${n}:${a instanceof THREE.InterleavedBufferAttribute ? a.data.version : a.version}`).join('|') + ':' + g.index?.version
    let saved = this.geometries.get(g)
    if (!saved || saved.versions !== versions) {
      saved = { versions, value: { id: g.uuid + ':' + versions,
        attributes: Object.fromEntries(Object.entries(g.attributes).map(([n, a]) => [n, this.attribute(a)])),
        index: g.index ? this.attribute(g.index) : undefined, groups: g.groups.map(x => ({ ...x })), drawRange: { ...g.drawRange } } }
      this.geometries.set(g, saved)
    }
    return saved.value
  }
  private texture(t: THREE.Texture): Textura {
    return { id: t.uuid, version: t.version, image: t.image, flipY: t.flipY, colorSpace: t.colorSpace,
      wrapS: t.wrapS, wrapT: t.wrapT, repeat: t.repeat.toArray(), offset: t.offset.toArray(), rotation: t.rotation, center: t.center.toArray() }
  }
  private material(m: THREE.Material): MaterialVisual {
    const p = m as THREE.MeshStandardMaterial & THREE.SpriteMaterial & THREE.LineDashedMaterial
    const canto = m.userData.tukiCanto as { recorrido: { value: number }; fuerza: { value: number } } | undefined
    return { id: m.uuid, name: m.name, type: m.type, color: p.color?.toArray() ?? [1, 1, 1], emissive: p.emissive?.toArray() ?? [0, 0, 0],
      roughness: p.roughness ?? 1, metalness: p.metalness ?? 0, opacity: m.opacity, transparent: m.transparent,
      depthWrite: m.depthWrite, depthTest: m.depthTest, side: m.side, blending: m.blending, toneMapped: m.toneMapped,
      vertexColors: m.vertexColors, map: p.map ? this.texture(p.map) : undefined, rotation: p.rotation,
      dashSize: p.dashSize, gapSize: p.gapSize, canto: canto ? { recorrido: canto.recorrido.value, fuerza: canto.fuerza.value } : undefined,
      tiempoVictoria: m instanceof THREE.ShaderMaterial ? m.uniforms.tiempoVictoria?.value : undefined }
  }
  capture(scene: THREE.Scene, camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, width: number, height: number, dark: boolean): CuadroVisual {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true)
    const objects: ObjetoVisual[] = []
    // A shared GLB material/geometry is serialized once per frame, including animated uniforms.
    const materials=new Map<THREE.Material,MaterialVisual>(),geometries=new Map<THREE.BufferGeometry,Geometria>()
    const material=(m:THREE.Material)=>{let d=materials.get(m);if(!d){d=this.material(m);materials.set(m,d)}return d}
    const geometry=(g:THREE.BufferGeometry)=>{let d=geometries.get(g);if(!d){d=this.geometry(g);geometries.set(g,d)}return d}
    scene.traverseVisible(o => {
      if (o.userData.tukiFondo) return // Each renderer owns its full-screen background.
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite)) return
      let asset = '', piece = '', parent: THREE.Object3D | null = o, grupoPuntos: string | undefined
      while (parent) {
        asset ||= parent.userData.tukiAsset ?? ''; piece ||= parent.userData.piece ?? ''
        if (parent.name.startsWith('pipset_')) grupoPuntos = parent.name
        parent = parent.parent
      }
      objects.push({ id: o.uuid, name: o.name, type: o.type, asset, piece,
        ...(grupoPuntos && { grupoPuntos }),
        matrix: o.matrixWorld.toArray(), renderOrder: o.renderOrder, castShadow: o.castShadow, receiveShadow: o.receiveShadow,
        geometry: o instanceof THREE.Sprite ? undefined : geometry(o.geometry),
        materials: (Array.isArray(o.material) ? o.material : [o.material]).map(material),
        center: o instanceof THREE.Sprite ? o.center.toArray() : undefined })
    })
    const lights = scene.children.filter(o => o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight)
      .map(l => { const c = l.shadow.camera as THREE.OrthographicCamera; return { type: l.type, position: l.position.toArray(), target: l.target.position.toArray(),
        shadow: { near: c.near, far: c.far, left: c.left, right: c.right, top: c.top, bottom: c.bottom, focus: l instanceof THREE.SpotLight ? l.shadow.focus : 1 } } })
    return { objects, lights, dark, width, height, dpr: devicePixelRatio || 1,
      fondo: scene.userData.tukiFondo ? {...scene.userData.tukiFondo} : undefined,
      camera: { matrix: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray(), near: camera.near, far: camera.far, zoom: camera.zoom,
        ...(camera instanceof THREE.PerspectiveCamera ? { type: 'perspective' as const, fov: camera.fov, aspect: camera.aspect }
          : { type: 'orthographic' as const, left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom }) } }
  }
}
