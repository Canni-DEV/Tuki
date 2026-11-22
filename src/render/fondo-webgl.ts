import * as THREE from 'three'
import type { FondoVisual } from '../fondo'
import { actualizarFondo, fragmentoFondo, prepararSuelo, uniformesFondo, verticeFondo } from './fondo-glsl'

export class FondoWebGL {
  private uniforms = uniformesFondo()
  readonly suelo = new THREE.ShadowMaterial({transparent:false,toneMapped:false,fog:false})
  readonly pantalla = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
    uniforms:this.uniforms, vertexShader:verticeFondo, fragmentShader:fragmentoFondo,
    depthWrite:false,depthTest:false,toneMapped:false,fog:false,
  }))
  constructor() {
    this.pantalla.name='Fondo continuo';this.pantalla.frustumCulled=false;this.pantalla.renderOrder=-10000
    this.pantalla.userData.tukiFondo=true
    this.suelo.name='Receptor de sombras del fondo'
    this.suelo.onBeforeCompile=shader=>prepararSuelo(shader,this.uniforms)
    this.suelo.customProgramCacheKey=()=> 'tuki-fondo-sombras-v1'
  }
  actualizar(fondo: FondoVisual) { actualizarFondo(this.uniforms,fondo) }
  dispose() { this.pantalla.geometry.dispose();this.pantalla.material.dispose();this.suelo.dispose() }
}
