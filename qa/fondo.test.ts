import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { colorFondo, cssFondo, fondoVisual, fondos, rgbLineal, rgbPantalla } from '../src/fondo'
import { FondoWebGL } from '../src/render/fondo-webgl'
import { PresentacionRender } from '../src/render/presentacion'

describe('fondo independiente de la iluminación',()=>{
  it('reproduce los extremos sRGB y mantiene una transición continua en luz lineal',()=>{
    for(const f of Object.values(fondos)) {
      expect(colorFondo(f,0)).toEqual(rgbLineal(f.superior))
      expect(rgbPantalla(colorFondo(f,1))).toEqual(rgbPantalla(rgbLineal(f.inferior)))
      let anterior=rgbPantalla(colorFondo(f,0))
      for(let y=1;y<=1000;y++) {
        const rgb=rgbPantalla(colorFondo(f,y/1000))
        expect(Math.max(...rgb.map((v,i)=>Math.abs(v-anterior[i])))).toBeLessThanOrEqual(1)
        anterior=rgb
      }
    }
  })
  it('el fondo CSS de carga coincide con el gradiente 3D dentro de un nivel por canal',()=>{
    for(const f of Object.values(fondos)) {
      expect(cssFondo(f)).toContain('linear-gradient(180deg')
      const stops=Array.from({length:33},(_,i)=>rgbPantalla(colorFondo(f,i/32)))
      for(let i=0;i<1000;i++) {
        const scaled=i/1000*32, index=Math.floor(scaled),t=scaled-index
        const css=stops[index].map((v,c)=>Math.round(v+(stops[index+1][c]-v)*t))
        const render=rgbPantalla(colorFondo(f,i/1000))
        expect(Math.max(...css.map((v,c)=>Math.abs(v-render[c])))).toBeLessThanOrEqual(1)
      }
    }
  })
  it('serializa datos de fondo y el suelo explícito; excluye el quad local y no añade fondo a miniaturas',()=>{
    vi.stubGlobal('devicePixelRatio',1)
    try {
      const scene=new THREE.Scene(),bg=new FondoWebGL(),camera=new THREE.OrthographicCamera()
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(24,24),bg.suelo)
      const otherPlane=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial())
      floor.userData.tukiAsset='floor'
      scene.userData.tukiFondo=fondoVisual(true);bg.actualizar(scene.userData.tukiFondo)
      scene.add(bg.pantalla,floor,otherPlane)
      const capture=new PresentacionRender(),frame=capture.capture(scene,camera,800,600,true)
      expect(frame.fondo).toEqual(fondos.oscuro);expect(frame.fondo).not.toBe(scene.userData.tukiFondo)
      expect(frame.objects.map(o=>o.asset)).toEqual(['floor',''])
      expect(frame.objects[0].materials[0]).toMatchObject({type:'ShadowMaterial',transparent:false,depthWrite:true,toneMapped:false})
      expect(capture.capture(new THREE.Scene(),camera,120,120,false).fondo).toBeUndefined()
      scene.userData.tukiFondo=fondoVisual(false)
      expect(frame.fondo).toEqual(fondos.oscuro)
      bg.dispose();floor.geometry.dispose();otherPlane.geometry.dispose();otherPlane.material.dispose()
    } finally {vi.unstubAllGlobals()}
  })
})
