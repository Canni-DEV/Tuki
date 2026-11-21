import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform, uv, vec3, mix, smoothstep, exp } from 'three/tsl'
import type { ObjetoVisual } from '../../../src/render/contrato'

/** Billboard quads avoid WebGPU's one-pixel hardware point-size limit. */
export class Motas {
  readonly group = new THREE.Group()
  private geometry = new THREE.PlaneGeometry(1,1)
  private particles: { mesh: THREE.Mesh; core: { value:number }; halo: { value:number }; color: { value:THREE.Color } }[] = []
  constructor(private gpu: boolean) { this.group.matrixAutoUpdate = false }
  update(d: ObjetoVisual, camera: THREE.Camera) {
    const a = d.geometry!.attributes, count = a.position.array.length / 3
    while (this.particles.length < count) {
      const core = uniform(0), halo = uniform(0), color = uniform(new THREE.Color())
      let material: THREE.Material
      if (this.gpu) {
        const m = new MeshBasicNodeMaterial()
        const r = uv().sub(.5).length().mul(2), center = r.mul(2.6)
        const nucleus = exp(center.mul(center).mul(-4)).mul(smoothstep(.65,1,center).oneMinus())
        const glow = exp(r.mul(r).mul(-3.5)).mul(smoothstep(.65,1,r).oneMinus())
        const ivory = mix(color,vec3(1,.96,.84),.55)
        // Preserve the material's MRT outputs when contact occlusion is enabled.
        m.colorNode = mix(color,ivory,smoothstep(0,.4,r).oneMinus())
        m.opacityNode = nucleus.mul(core).add(glow.mul(halo))
        material = m
      } else material = new THREE.ShaderMaterial({ uniforms:{ core,halo,color },
        vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec2 p;uniform float core;uniform float halo;uniform vec3 color;void main(){float r=length(p-.5)*2.;float c=r*2.6;float n=exp(-4.*c*c)*(1.-smoothstep(.65,1.,c));float h=exp(-3.5*r*r)*(1.-smoothstep(.65,1.,r));gl_FragColor=vec4(mix(color,mix(color,vec3(1.,.96,.84),.55),1.-smoothstep(0.,.4,r)),n*core+h*halo);\n#include <colorspace_fragment>\n}` })
      Object.assign(material,{ transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending })
      const mesh = new THREE.Mesh(this.geometry,material); mesh.frustumCulled = false; this.group.add(mesh)
      this.particles.push({ mesh,core,halo,color })
    }
    this.group.matrix.fromArray(d.matrix); this.group.matrixWorldNeedsUpdate = true
    const t = d.materials[0].tiempoVictoria ?? 0
    for (let i=0;i<count;i++) {
      const p=this.particles[i], age=t-a.demora.array[i], u=THREE.MathUtils.clamp(age/a.vida.array[i],0,1)
      const advance=1-Math.pow(1-THREE.MathUtils.clamp(age*a.rapidez.array[i]/1.8,0,1),4)
      const dx=a.deriva.array[i*3],dy=a.deriva.array[i*3+1],dz=a.deriva.array[i*3+2], swirl=.1*Math.sin(Math.PI*advance)
      p.mesh.position.set(a.position.array[i*3]+dx*advance-dz*swirl,a.position.array[i*3+1]+dy*advance,a.position.array[i*3+2]+dz*advance+dx*swirl)
      p.mesh.quaternion.copy(camera.quaternion); p.mesh.scale.setScalar(a.tamano.array[i]*2.6)
      const fade=THREE.MathUtils.smoothstep(age,0,.12)
      p.core.value=fade*(1-THREE.MathUtils.smoothstep(u,.22,.88))*.62
      p.halo.value=fade*(1-THREE.MathUtils.smoothstep(u,.35,1))*.11
      p.color.value.fromArray(a.tono.array,i*3)
    }
  }
  dispose() { this.group.removeFromParent(); for (const p of this.particles) (p.mesh.material as THREE.Material).dispose(); this.geometry.dispose() }
}
