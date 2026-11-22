import { describe,it,expect,vi,afterEach } from 'vitest'
import * as THREE from 'three'
import { PresentacionRender } from '../src/render/presentacion'
import { habilitable,resumir } from '../src/render/metricas'
import { leer,guardar,sincronizar } from '../src/progreso'
import { segmentosBucle } from '../render/fotorealista/src/lineas'

afterEach(()=>vi.unstubAllGlobals())
describe('contrato entre renderizadores',()=>{
  it('conserva el cierre del aro de selección al convertir LineLoop a segmentos WebGPU',()=>{
    const geometry={id:'aro',attributes:{position:{array:new Float32Array(12),itemSize:3,normalized:false}},
      index:{array:new Uint16Array([3,2,1,0]),itemSize:1,normalized:false},groups:[],drawRange:{start:1,count:3}}
    const converted=segmentosBucle(geometry)
    expect([...converted.index!.array]).toEqual([2,1,1,0,0,2])
    expect([...geometry.index.array]).toEqual([3,2,1,0])
    expect(segmentosBucle(geometry)).toBe(converted)
  })
  it('copia geometría y matrices sin modificar los recursos originales; conserva su revisión',()=>{
    vi.stubGlobal('devicePixelRatio',2)
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10)
    const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({color:0x765432})
    const mesh=new THREE.Mesh(geometry,material),parent=new THREE.Group()
    parent.userData.tukiAsset='launcher-base';parent.position.x=2;mesh.position.y=3;parent.add(mesh);scene.add(parent)
    const presentation=new PresentacionRender(),first=presentation.capture(scene,camera,800,600,false)
    expect(first.objects[0].asset).toBe('launcher-base')
    expect(first.objects[0].matrix.slice(12,15)).toEqual([2,3,0])
    const captured=first.objects[0].geometry!,positions=geometry.getAttribute('position')
    expect(captured.attributes.position.array).not.toBe(positions.array)
    const original=captured.attributes.position.array[0]
    positions.setX(0,9);positions.needsUpdate=true
    const second=presentation.capture(scene,camera,800,600,true)
    expect(captured.attributes.position.array[0]).toBe(original)
    expect(second.objects[0].geometry!.id).not.toBe(captured.id)
    expect(second.objects[0].geometry!.attributes.position.array[0]).toBe(9)
    expect(mesh.material).toBe(material);expect(material.color.getHex()).toBe(0x765432)
    const initialColor=first.objects[0].materials[0].color.slice()
    material.color.setHex(0xff0000)
    const recolored=presentation.capture(scene,camera,800,600,false)
    expect(recolored.objects[0].materials[0].color).toEqual([1,0,0])
    expect(first.objects[0].materials[0].color).toEqual(initialColor)
    expect(first.camera.matrix).not.toBe(camera.matrixWorld.elements)
    parent.visible=false
    expect(presentation.capture(scene,camera,800,600,false).objects).toEqual([])
  })
})
describe('habilitación por estabilidad',()=>{
  it('rechaza latencias sostenidas y mediciones inválidas, aunque el promedio sea atractivo',()=>{
    expect(habilitable(Array(300).fill(16.7))).toBe(true)
    expect(habilitable(Array(150).fill(33.3))).toBe(false)
    expect(habilitable([...Array(296).fill(6.9),100,100,100,100])).toBe(false)
    expect(habilitable(Array(100).fill(7))).toBe(false)
    expect(habilitable([...Array(300).fill(7),NaN])).toBe(false)
    expect(resumir([]).p95).toBe(null)
  })
})
describe('preferencias visuales',()=>{
  const storage=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}}}
  it('mantiene Actual para perfiles anteriores o datos inválidos y guarda campos independientes',()=>{
    const s=storage(),p=leer(()=>s)
    expect(p.visuales).toBe('actual');expect(p.calidadFotorealista).toBe('alta')
    p.visuales='fotorealista';guardar(p,()=>s)
    expect([...s.values.keys()]).toEqual(['tuki.v1.preferencias.visuales'])
    expect(leer(()=>s).visuales).toBe('fotorealista')
    s.setItem('tuki.v1.preferencias.visuales','"desconocido"')
    expect(leer(()=>s).visuales).toBe('actual')
  })
  it('preserva una edición local de calidad al sincronizar otra pestaña',()=>{
    const s=storage();vi.stubGlobal('localStorage',s)
    const local=leer(),remote=leer();local.calidadFotorealista='equilibrada';remote.apariencia='oscuro';guardar(remote)
    sincronizar(local)
    expect(local.calidadFotorealista).toBe('equilibrada');expect(local.apariencia).toBe('oscuro')
    guardar(local);expect(leer().calidadFotorealista).toBe('equilibrada')
  })
})
