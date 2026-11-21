import { beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { certificarDesafio, actualizarSolucion, mesaDeAutor, desafioDesdeMesa, huellaDesafio, leerDesafio, nivelDesafio, armadoSolucion } from '../src/desafios'
import { Editor } from '../src/editor'
import { nivelPorId } from '../src/levels'
import { initPhysics } from '../src/simulation'
import { leerMesa, mesaNueva } from '../src/taller'
import { inventario, type PiezaColocada, type Armado } from '../src/types'

beforeAll(initPhysics)
function recta() {
  const n = nivelPorId('recta')
  const a: Armado = JSON.parse(readFileSync(new URL('./fixtures/recta.json',import.meta.url),'utf8')).armado
  const doc = mesaNueva('Ordenando las fichas','compacta')
  doc.piezas = [...n.fijos.filter(p=>p.id!=='mesa').map(p=>({id:p.id,tipo:p.rol,posicion:p.posicion,giroY:p.giroY,apoyo:'tablero'} as PiezaColocada)),...a.piezas]
  const d = desafioDesdeMesa(doc)
  d.motivo = 'Ordenar fichas antes de guardar el juego.'
  return d
}
it('certifica tres repeticiones, conserva el archivo y no acepta un escenario que gana solo',async()=>{
  const d=recta(), antes=structuredClone(d), certificado=await certificarDesafio(d)
  expect(d).toEqual(antes)
  expect(certificado.certificacion?.repeticiones).toBe(3)
  expect(certificado.estado).toBe('certificado')
  expect(certificado.certificacion?.huella).toBe(await huellaDesafio(d))
  const solo=structuredClone(d)
  solo.instalados.push(...solo.solucion.piezas);solo.solucion.piezas=[]
  await expect(certificarDesafio(solo)).rejects.toThrow(/completar/)
})
it('la huella cambia con geometría, inventario o permisos, pero no con los textos',async()=>{
  const d=recta(), firma=await huellaDesafio(d)
  expect(await huellaDesafio({...d,nombre:'Nuevo título',motivo:'Otro motivo'})).toBe(firma)
  expect(await huellaDesafio({...d,permiteCableado:true})).not.toBe(firma)
  expect(await huellaDesafio({...d,inventario:inventario({domino:100})})).not.toBe(firma)
})
it('el autor puede instalar fichas físicas y el jugador sólo edita el resto',()=>{
  const d=recta(), p=d.solucion.piezas.shift()!
  d.instalados.push(p)
  const e=new Editor(nivelDesafio(d));e.cargar(armadoSolucion(d))
  e.seleccion=p.id
  expect(e.retirar()).toBe(false)
  expect(e.mover({...p,posicion:[0,0,0]})).toBe(false)
})
it('rechaza escalas, inventario insuficiente, ids duplicados y exceso total',()=>{
  const d=recta()
  expect(()=>leerDesafio({...d,inventario:inventario()})).toThrow(/piezas/)
  expect(()=>leerDesafio({...d,instalados:[...d.instalados,d.instalados[0]]})).toThrow(/Pieza/)
  expect(()=>leerDesafio({...d,instalados:[{...d.instalados[0],escala:[1,2,1]},...d.instalados.slice(1)]})).toThrow(/Pieza/)
  expect(()=>leerDesafio({...d,inventario:inventario({domino:200})})).toThrow(/200/)
})
it('rechaza archivos antiguos sin modificarlos y respeta las dimensiones de cada mesa',()=>{
  const original={...mesaNueva('Anterior'),version:5}, antes=structuredClone(original)
  expect(() => leerMesa(original)).toThrow(/incompatible/)
  expect(original).toEqual(antes)
  const d=mesaNueva('Pequeña','compacta')
  d.piezas=[{id:'libro',tipo:'libro',apoyo:'tablero',posicion:[.3,0,0],giroY:0}]
  expect(()=>leerMesa(d)).toThrow()
  expect(leerMesa({...d,formatoMesa:'cuadrada'}).piezas).toHaveLength(1)
})
it('certifica un desafío compuesto sólo por cableado y protege los cables del autor',async()=>{
  const n=nivelPorId('puerta')
  const a:Armado=JSON.parse(readFileSync(new URL('./fixtures/puerta.json',import.meta.url),'utf8')).armado
  const m={...mesaNueva(n.nombre,n.formatoMesa),piezas:[...n.objetos!,...a.piezas],conexiones:n.instalacion!.conexiones}
  const d=desafioDesdeMesa(m)
  d.motivo='Guardar los útiles y conectar el mecanismo de la puerta.'
  d.instalados.push(...d.solucion.piezas); d.solucion.piezas=[];d.inventario=inventario()
  d.solucion.conexiones=d.conexionesInstaladas.map(({mando,receptor})=>({mando,receptor}))
  d.conexionesInstaladas=[];d.permiteCableado=true
  const certificado=await certificarDesafio(d)
  expect(certificado.estado).toBe('certificado')
  const editor=new Editor(nivelDesafio(d)),c=d.solucion.conexiones[0]
  expect(editor.conectar(c.mando,c.receptor)).toBe(true)
  expect(editor.retirarTodas()).toBe(true)
  expect(editor.armado.conexiones).toEqual([])
  editor.deshacer();expect(editor.armado.conexiones).toEqual([c])
  editor.deshacer();expect(editor.armado.conexiones).toEqual([])
  const fijo={...d,conexionesInstaladas:[{...c,guias:[]}],solucion:{piezas:[],conexiones:[]}}
  expect(new Editor(nivelDesafio(fijo)).conectar(c.mando,c.receptor)).toBe(false)
  expect(()=>leerDesafio({...d,permiteCableado:false})).toThrow(/cablear/)
})

it('instala extremos agregados a un borrador y conserva un documento legible', () => {
  const d = desafioDesdeMesa(mesaNueva('Vacía')), m = mesaDeAutor(d)
  m.piezas = ['inicio', 'meta'].map((tipo, i) => ({ id: tipo, tipo, apoyo: 'tablero', posicion: [i * .1, 0, 0], giroY: 0 })) as PiezaColocada[]
  const actualizado = actualizarSolucion(d, m)
  expect(actualizado.instalados.map(p => p.tipo)).toEqual(['inicio', 'meta'])
  expect(actualizado.inventario.inicio + actualizado.inventario.meta).toBe(0)
  expect(leerDesafio(actualizado)).toEqual(actualizado)
})
it('no aumenta el inventario por encima del cupo ni modifica el borrador anterior', () => {
  const d = desafioDesdeMesa(mesaNueva('Al límite')); d.inventario.domino = 200
  const antes = structuredClone(d), m = mesaDeAutor(d)
  m.piezas.push({ id: 'libro', tipo: 'libro', apoyo: 'tablero', posicion: [0, 0, 0], giroY: 0 })
  expect(() => actualizarSolucion(d, m)).toThrow(/200/)
  expect(d).toEqual(antes)
})
it('un cable nuevo requiere permiso del jugador o dos extremos ya instalados', () => {
  const m = mesaNueva('Circuito')
  m.piezas = [{ id: 'mando', tipo: 'palanca', apoyo: 'tablero', posicion: [-.12, 0, 0], giroY: 0 },
    { id: 'receptor', tipo: 'puerta', apoyo: 'tablero', posicion: [.12, 0, 0], giroY: 0 }]
  const d = desafioDesdeMesa(m), autor = mesaDeAutor(d)
  autor.conexiones = [{ mando: 'mando', receptor: 'receptor' }]
  expect(() => actualizarSolucion(d, autor)).toThrow(/Instalá ambos/)
  const permitido = actualizarSolucion({ ...d, permiteCableado: true }, autor)
  expect(permitido.solucion.conexiones).toHaveLength(1)
  const fijo = actualizarSolucion({ ...d, instalados: m.piezas, solucion: { piezas: [], conexiones: [] } }, autor)
  expect(fijo.conexionesInstaladas).toHaveLength(1)
  expect(fijo.permiteCableado).toBe(false)
})
