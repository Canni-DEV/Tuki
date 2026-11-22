import { describe, expect, it, vi } from 'vitest'
import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { acotarVista, configurarCamara, distanciaPerspectiva, esquinas, limitesCamara, puntoEnPlano, trasladarVista, type ProyeccionCamara, type Vista } from '../src/camara'
import { Espacio } from '../src/espacio'

const tablero = { x: 0, y: 0, z: 0, w: .84, d: .52, ang: 0 }
const contenido = new Box3(new Vector3(-.42, 0, -.26), new Vector3(.42, .24, .26))
const vista = (): Vista => ({ centro: new Vector3(0, .05, 0), azimut: .4, elevacion: .7, alto: .4 })
function proyectar(v: Vista, p: Vector3, width: number, height: number, proyeccion: ProyeccionCamara = 'ortografica') {
  const cam = proyeccion === 'perspectiva' ? new PerspectiveCamera() : new OrthographicCamera()
  configurarCamara(cam,v,width,height)
  const ndc = p.clone().project(cam)
  return { x: (ndc.x+1)*width/2, y: (1-ndc.y)*height/2 }
}

for (const proyeccion of ['ortografica','perspectiva'] as const) describe(`desplazamiento y anclaje ${proyeccion}`, () => {
  for (const [width, height] of [[1366, 768], [390, 844], [844, 390]])
    for (const elevacion of [.21, .7, Math.PI/2]) for (const y of [0, .18])
      it(`sigue el arrastre y la pinza a ${width}×${height}, elevación ${elevacion}, apoyo ${y}`, () => {
        const v = { ...vista(), elevacion, azimut: elevacion === Math.PI/2 ? 0 : 1.8 }
        const anterior = { x: width*.45, y: height*.6 }, actual = { x: anterior.x+38, y: anterior.y-27 }
        const ancla = puntoEnPlano(v, anterior, width, height, y, proyeccion)
        // A support plane above the eye has no forward ray intersection.
        if (!ancla) { expect(proyeccion).toBe('perspectiva'); return }
        const nueva = trasladarVista(v, anterior, actual, v.alto*.72, width, height, y, proyeccion)
        if (!puntoEnPlano({ ...v, alto: v.alto*.72 }, actual, width,height,y,proyeccion)) {
          expect(nueva.centro).toEqual(v.centro); return
        }
        const pantalla = proyectar(nueva, ancla, width, height, proyeccion)
        expect(pantalla.x).toBeCloseTo(actual.x, 7)
        expect(pantalla.y).toBeCloseTo(actual.y, 7)
        expect(nueva.centro.y).toBe(v.centro.y)
        expect(nueva.azimut).toBe(v.azimut)
        expect(nueva.elevacion).toBe(v.elevacion)
      })
})

describe('perspectiva suave y órbita estable', () => {
  it('mantiene el campo vertical en 30° y la escala en el plano del objetivo', () => {
    const v=vista(), ortho=new OrthographicCamera(), camera=new PerspectiveCamera()
    configurarCamara(ortho,v,1366,768);configurarCamara(camera,v,1366,768)
    const point=new Vector3(.08,.04,0).applyQuaternion(camera.quaternion).add(v.centro)
    const a=point.clone().project(ortho),b=point.clone().project(camera)
    expect(a.x).toBeCloseTo(b.x,10);expect(a.y).toBeCloseTo(b.y,10)
    expect(camera.fov).toBe(30)
    expect(camera.position.distanceTo(v.centro)).toBeCloseTo(distanciaPerspectiva(v.alto),12)
    expect(camera.near).toBeCloseTo(distanciaPerspectiva(v.alto)*.05,12)
    expect(camera.far).toBeGreaterThan(24)
  })
  it('no reencuadra ni consulta límites al orbitar una vuelta completa', () => {
    let actual=vista()
    const limites=vi.fn(()=>{throw new Error('Una órbita no debe reencuadrar')})
    const fake={ puedeNavegar:true, automatica:true, vista:actual, limites, aplicar:(v:Vista)=>{actual=v;fake.vista=v} }
    for(let i=0;i<96;i++) Espacio.prototype.mover.call(fake as unknown as Espacio,
      {modo:'orbitar',anterior:{x:0,y:0},actual:{x:Math.PI*2/.006/96,y:i<48?2:-2},zoom:1})
    expect(limites).not.toHaveBeenCalled()
    expect(actual.centro).toEqual(vista().centro);expect(actual.alto).toBe(vista().alto)
    expect(actual.azimut).toBeCloseTo(vista().azimut-Math.PI*2,10)
  })
  it('ignora el ancla por encima del horizonte sin introducir saltos o valores infinitos', () => {
    const v={...vista(),elevacion:Math.PI/15}
    expect(puntoEnPlano(v,{x:683,y:0},1366,768,0,'perspectiva')).toBeNull()
    const next=trasladarVista(v,{x:683,y:0},{x:720,y:0},v.alto,1366,768,0,'perspectiva')
    expect(next.centro).toEqual(v.centro)
  })
  for(const [width,height] of [[1366,768],[390,844],[844,390]]) for(const elevacion of [.21,.7,Math.PI/2])
    it(`encuadra el contenido y acota el desplazamiento en perspectiva ${width}×${height} / ${elevacion}`,()=>{
      const v={...vista(),elevacion}, margins={arriba:56,abajo:74}
      const limits=limitesCamara(v,tablero,contenido,width,height,.64,margins,'perspectiva')
      const lejos=acotarVista({...v,alto:100,centro:new Vector3(20,v.centro.y,-20)},tablero,limits)
      for(const p of esquinas(contenido)) {
        const s=proyectar(lejos,p,width,height,'perspectiva')
        expect(s.x).toBeGreaterThan(0);expect(s.x).toBeLessThan(width)
        expect(s.y).toBeGreaterThan(margins.arriba);expect(s.y).toBeLessThan(height-margins.abajo)
      }
      const cerca=acotarVista({...v,alto:.12,centro:new Vector3(20,v.centro.y,-20)},tablero,limits)
      expect(Math.abs(cerca.centro.x)).toBeLessThanOrEqual(tablero.w/2+.020001)
      expect(Math.abs(cerca.centro.z)).toBeLessThanOrEqual(tablero.d/2+.020001)
    })
})

describe('zona segura y encuadre general', () => {
  for (const [width, height] of [[1366, 768], [390, 844], [320, 640], [844, 390]])
    it(`permite 12 cm y encuadra el contenido con controles a ${width}×${height}`, () => {
      const v = vista(), margenes = { arriba: 104, abajo: 128 }
      const limites = limitesCamara(v, tablero, contenido, width, height, .64, margenes)
      const cerca = acotarVista({ ...v, alto: 0 }, tablero, limites)
      expect(Math.min(cerca.alto, cerca.alto*width/height)).toBeCloseTo(.12, 10)
      const lejos = acotarVista({ ...v, alto: 100, centro: new Vector3(20, v.centro.y, -20) }, tablero, limites)
      expect(lejos.centro.distanceTo(limites.general)).toBeLessThan(1e-10)
      const escala = Math.min(1, height*.5/(margenes.arriba+margenes.abajo))
      for (const p of esquinas(contenido)) {
        const s = proyectar(lejos, p, width, height)
        expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(width)
        expect(s.y).toBeGreaterThan(margenes.arriba*escala)
        expect(s.y).toBeLessThan(height-margenes.abajo*escala)
      }
    })
  it('respeta escala, giro, desplazamiento y los 2 cm de margen en todas las esquinas', () => {
    const t = { ...tablero, w: .42, d: .26, x: .3, z: -.4, ang: .9 }
    const v = { ...vista(), azimut: 0, elevacion: Math.PI/2 }
    const limites = limitesCamara(v, t, contenido, 1366, 768, .64, { arriba: 56, abajo: 74 })
    for (const x of [-100, 100]) for (const z of [-100, 100]) {
      const centro = new Vector3(x, v.centro.y, z).applyAxisAngle(new Vector3(0,1,0), t.ang).add(new Vector3(t.x,0,t.z))
      const segura = acotarVista({ ...v, alto: limites.minimo, centro }, t, limites)
      const local = segura.centro.clone().sub(new Vector3(t.x,0,t.z)).applyAxisAngle(new Vector3(0,1,0), -t.ang)
      expect(Math.abs(local.x)).toBeCloseTo(t.w/2+.02, 10)
      expect(Math.abs(local.z)).toBeCloseTo(t.d/2+.02, 10)
    }
  })
  it('reduce linealmente el recorrido y mantiene acotadas operaciones repetidas', () => {
    let v = vista()
    const limites = limitesCamara(v, tablero, contenido, 1366, 768, .64, { arriba: 56, abajo: 74 })
    for (const fraccion of [0, .25, .5, .75, 1]) {
      v = acotarVista({ ...v, centro: new Vector3(100, v.centro.y, 100), alto: limites.minimo+(limites.maximo-limites.minimo)*fraccion }, tablero, limites)
      expect(v.centro.x).toBeCloseTo((tablero.w/2+.02)*(1-fraccion)+limites.general.x*fraccion, 10)
    }
    for (let i = 0; i < 100; i++) {
      v = acotarVista({ ...v, alto: v.alto*.8, centro: v.centro.clone().add(new Vector3(1,0,-1)) }, tablero, limites)
      expect(Math.abs(v.centro.x)).toBeLessThanOrEqual(.44+1e-10)
      expect(Math.abs(v.centro.z)).toBeLessThanOrEqual(.28+1e-10)
    }
  })
  it('no pierde la tapa a ras de mesa, incluso con un foco elevado y zoom extremo', () => {
    const t = { ...tablero, w: .61, d: .416 }
    for (const altura of [.095, .6]) for (const azimut of [0, .8, 2.5]) for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const v = { ...vista(), azimut, elevacion: Math.PI/15, alto: .12, centro: new Vector3(x, altura, z) }
      const limites = limitesCamara(v, t, contenido, 1366, 768, .64, { arriba: 56, abajo: 74 })
      const segura = acotarVista(v, t, limites)
      expect(segura.centro.y).toBe(altura)
      expect(segura.elevacion).toBe(v.elevacion)
      expect(Math.abs(segura.centro.x)).toBeLessThanOrEqual(t.w/2+.020001)
      expect(Math.abs(segura.centro.z)).toBeLessThanOrEqual(t.d/2+.020001)
      let poligono = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz]) =>
        proyectar(segura, new Vector3(sx*t.w/2, 0, sz*t.d/2), 1366, 768))
      for (const [eje, signo, tope] of [['x',-1,-1],['x',1,1365],['y',-1,-57],['y',1,693]] as const) {
        const entrada = poligono; poligono = []
        for (let i = 0; i < entrada.length; i++) {
          const a = entrada[i], b = entrada[(i+1)%entrada.length], da = a[eje]*signo-tope, db = b[eje]*signo-tope
          if (da <= 0) poligono.push(a)
          if (da*db < 0) poligono.push({ x: a.x+(b.x-a.x)*da/(da-db), y: a.y+(b.y-a.y)*da/(da-db) })
        }
      }
      const area = Math.abs(poligono.reduce((s,p,i) => { const b = poligono[(i+1)%poligono.length]; return s+p.x*b.y-b.x*p.y }, 0))/2
      expect(area).toBeGreaterThan(1)
    }
  })
})
