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
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      uniform float tiempoVictoria;
      uniform float altoViewport;
      attribute vec3 deriva;
      attribute vec3 tono;
      attribute float tamano;
      attribute float demora;
      varying vec3 colorMota;
      varying float opacidadMota;
      void main() {
        float edad = tiempoVictoria - demora;
        float u = clamp(edad / 1.8, 0.0, 1.0);
        float avance = 1.0 - pow(1.0 - u, 3.0);
        vec3 p = position + deriva * avance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(2.0, tamano * altoViewport * projectionMatrix[1][1] * 0.5);
        colorMota = tono;
        opacidadMota = smoothstep(0.0, 0.12, edad) * (1.0 - smoothstep(0.3, 1.0, u)) * 0.85;
      }
    `,
    fragmentShader: `
      varying vec3 colorMota;
      varying float opacidadMota;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float suavidad = exp(-4.0 * r * r) * (1.0 - smoothstep(0.65, 1.0, r));
        gl_FragColor = vec4(colorMota, suavidad * opacidadMota);
        #include <colorspace_fragment>
      }
    `,
  })
  readonly motas = new THREE.Points(this.geometria, this.material)

  constructor(meta: THREE.Object3D) {
    const posiciones: number[] = [], derivas: number[] = [], tonos: number[] = [], tamanos: number[] = [], demoras: number[] = []
    const crema = new THREE.Color(0xffefcf), ambar = new THREE.Color(0xeeb675)
    meta.updateMatrix()
    for (let i = 0; i < 10; i++) {
      // Uneven spacing avoids a ring or fountain silhouette. The source follows
      // the painted side of the 5 cm domino at the exact pose of the win.
      const f = ((i * 7) % 10) / 9, angulo = i * 2.39996
      const origen = new THREE.Vector3(i % 2 ? .0128 : -.0128, .012 + f * .032, .00285).applyMatrix4(meta.matrix)
      posiciones.push(...origen.toArray())
      const radio = .010 + (i % 4) * .004
      derivas.push(Math.cos(angulo) * radio, .028 + f * .022, Math.sin(angulo) * radio)
      tonos.push(...crema.clone().lerp(ambar, (i % 3) / 2).toArray())
      tamanos.push(.0032 + (i % 3) * .0006)
      demoras.push(.06 + (i % 4) * .035)
    }
    for (const [nombre, valores, dimension] of [
      ['position', posiciones, 3], ['deriva', derivas, 3], ['tono', tonos, 3], ['tamano', tamanos, 1], ['demora', demoras, 1],
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
