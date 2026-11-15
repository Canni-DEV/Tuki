import * as THREE from 'three'

export const duracionVictoria = 2000

// A single, local puff of warm dust. Positions stay in the table's coordinates
// after emission so the falling goal does not drag the particles along with it.
export class SuspiroVictoria {
  private readonly geometria = new THREE.BufferGeometry()
  private readonly tiempo = { value: 0 }
  private readonly alto = { value: 1 }
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { tiempoVictoria: this.tiempo, altoViewport: this.alto },
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float tiempoVictoria;
      uniform float altoViewport;
      attribute vec3 deriva;
      attribute vec3 tono;
      attribute float tamano;
      attribute float demora;
      attribute float vida;
      attribute float rapidez;
      varying vec3 colorMota;
      varying float opacidadNucleo;
      varying float opacidadHalo;
      void main() {
        float edad = tiempoVictoria - demora;
        float u = clamp(edad / vida, 0.0, 1.0);
        float vuelo = clamp(edad * rapidez / 1.8, 0.0, 1.0);
        float avance = 1.0 - pow(1.0 - vuelo, 4.0);
        vec3 p = position + deriva * avance;
        p += vec3(-deriva.z, 0.0, deriva.x) * 0.10 * sin(3.14159 * avance);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        // Enlarge only the halo's canvas; the core keeps its original diameter.
        gl_PointSize = max(2.0, tamano * altoViewport * projectionMatrix[1][1] * 0.5) * 2.6;
        colorMota = tono;
        float entrada = smoothstep(0.0, 0.12, edad);
        opacidadNucleo = entrada * (1.0 - smoothstep(0.22, 0.88, u)) * 0.62;
        opacidadHalo = entrada * (1.0 - smoothstep(0.35, 1.0, u)) * 0.11;
      }
    `,
    fragmentShader: `
      varying vec3 colorMota;
      varying float opacidadNucleo;
      varying float opacidadHalo;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float centro = r * 2.6;
        float nucleo = exp(-4.0 * centro * centro) * (1.0 - smoothstep(0.65, 1.0, centro));
        float halo = exp(-3.5 * r * r) * (1.0 - smoothstep(0.65, 1.0, r));
        vec3 marfil = mix(colorMota, vec3(1.0, 0.96, 0.84), 0.55);
        vec3 color = mix(colorMota, marfil, 1.0 - smoothstep(0.0, 0.4, r));
        gl_FragColor = vec4(color, nucleo * opacidadNucleo + halo * opacidadHalo);
        #include <colorspace_fragment>
      }
    `,
  })
  readonly motas = new THREE.Points(this.geometria, this.material)

  constructor(meta: THREE.Object3D) {
    const posiciones: number[] = [], derivas: number[] = [], tonos: number[] = [], tamanos: number[] = [], demoras: number[] = []
    const vidas: number[] = [], rapideces: number[] = []
    const crema = new THREE.Color(0xffedcf), ambar = new THREE.Color(0xf2ca95)
    meta.updateMatrix()
    for (let i = 0; i < 10; i++) {
      // Uneven spacing avoids a ring or fountain silhouette. The source follows
      // the painted side of the 5 cm domino at the exact pose of the win.
      const f = ((i * 7) % 10) / 9, angulo = i * 2.39996
      const origen = new THREE.Vector3(i % 2 ? .0128 : -.0128, .012 + f * .032, .00285).applyMatrix4(meta.matrix)
      posiciones.push(...origen.toArray())
      const radio = .010 + (i % 4) * .004
      derivas.push(Math.cos(angulo) * radio, .028 + f * .022, Math.sin(angulo) * radio)
      tonos.push(...crema.clone().lerp(ambar, (i % 3) * .22).toArray())
      tamanos.push(.0032 + (i % 3) * .0006)
      demoras.push(.06 + (i % 4) * .035)
      // Smaller motes rise a little faster; a few halos linger after the cores.
      vidas.push(1.5 + f * .3)
      rapideces.push(1.15 - (i % 3) * .15)
    }
    for (const [nombre, valores, dimension] of [
      ['position', posiciones, 3], ['deriva', derivas, 3], ['tono', tonos, 3], ['tamano', tamanos, 1], ['demora', demoras, 1],
      ['vida', vidas, 1], ['rapidez', rapideces, 1],
    ] as const) this.geometria.setAttribute(nombre, new THREE.Float32BufferAttribute(valores, dimension))
    this.motas.name = 'suspiro-victoria'
    // Shader motion extends beyond the source geometry's bounding sphere.
    this.motas.frustumCulled = false
  }

  actualizar(transcurrido: number, altoViewport: number) {
    this.tiempo.value = transcurrido / 1000
    this.alto.value = altoViewport
  }

  dispose() {
    this.motas.removeFromParent()
    this.geometria.dispose()
    this.material.dispose()
  }
}
