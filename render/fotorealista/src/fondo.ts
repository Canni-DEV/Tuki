import * as THREE from 'three'
import * as GPU from 'three/webgpu'
import { float, mix, output, positionLocal, screenUV, smoothstep, uniform, vec4 } from 'three/tsl'
import { rgbLineal, type FondoVisual } from '../../../src/fondo'
import { actualizarFondo, fragmentoFondo, prepararSuelo, uniformesFondo, verticeFondo } from '../../../src/render/fondo-glsl'

/** Opaque matte: keeps depth/contact and is included in the glass transmission pass. */
export class FondoRender {
  private superior=uniform(new THREE.Vector3())
  private inferior=uniform(new THREE.Vector3())
  private sombra=uniform(0)
  private gl=uniformesFondo()
  private actual?: FondoVisual
  readonly pantalla: THREE.Mesh
  readonly suelo: THREE.ShadowMaterial | GPU.ShadowNodeMaterial
  constructor(gpu: boolean) {
    let material: THREE.Material
    if (gpu) {
      const gradiente=mix(this.superior,this.inferior,smoothstep(0,1,screenUV.y))
      const fondo=new GPU.NodeMaterial()
      fondo.vertexNode=vec4(positionLocal.xy,1,1);fondo.colorNode=gradiente
      fondo.depthTest=false;fondo.depthWrite=false;fondo.toneMapped=false;fondo.fog=false
      const suelo=new GPU.ShadowNodeMaterial({transparent:false,toneMapped:false,fog:false})
      suelo.outputNode=vec4(gradiente.mul(float(1).sub(output.a.mul(this.sombra))),1)
      material=fondo;this.suelo=suelo
    } else {
      material=new THREE.ShaderMaterial({uniforms:this.gl,vertexShader:verticeFondo,fragmentShader:fragmentoFondo,
        depthTest:false,depthWrite:false,toneMapped:false,fog:false})
      const suelo=new THREE.ShadowMaterial({transparent:false,toneMapped:false,fog:false})
      suelo.onBeforeCompile=shader=>prepararSuelo(shader,this.gl)
      suelo.customProgramCacheKey=()=> 'tuki-fondo-sombras-v1'
      this.suelo=suelo
    }
    material.name='Fondo continuo';this.suelo.name='Receptor de sombras del fondo'
    this.pantalla=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material)
    this.pantalla.frustumCulled=false;this.pantalla.renderOrder=-10000;this.pantalla.visible=false
  }
  actualizar(f?: FondoVisual) {
    this.pantalla.visible=!!f
    if(!f||this.actual&&f.superior===this.actual.superior&&f.inferior===this.actual.inferior&&f.sombra===this.actual.sombra)return
    this.actual={...f}
    this.superior.value.fromArray(rgbLineal(f.superior));this.inferior.value.fromArray(rgbLineal(f.inferior));this.sombra.value=f.sombra
    actualizarFondo(this.gl,f)
  }
  dispose() {
    this.pantalla.geometry.dispose();(this.pantalla.material as THREE.Material).dispose();this.suelo.dispose()
  }
}
