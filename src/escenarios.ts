import { configuracion, dispositivos } from './dispositivos'
import { baseMesa } from './mesas'
import { escenario, leverSeat } from './shapes'
import { esMando, esReceptor, inventario, pieceAsset, tipos, type ConexionInstalada, type Nivel, type PiezaColocada, type Secuencia, type FormatoMesa } from './types'

export function apoyoDeObjeto(p: PiezaColocada): Nivel['superficies'][number] | undefined {
  const id = p.id + '/apoyo', objeto = p.id
  const d = dispositivos[p.tipo]?.apoyo, c = configuracion(p)
  if (d) {
    if (d.soloCable && (!c || !('modo' in c) || c.modo !== 'cable')) return
    return { id, objeto, zona: d.zona, rect: d.rect, altura: d.altura, admite: d.admite ?? tipos }
  }
  const tapa = escenario[pieceAsset(p.tipo,p.configuracion)]?.tapa
  if(tapa) return {id,objeto,zona:'tapa',rect:[0,0,tapa.ancho,tapa.fondo],altura:tapa.altura,circular:tapa.circular,admite:tipos}
  if(p.tipo==='taco') return {id,objeto,zona:'tapa',rect:[0,0,.024,.026],altura:.018,admite:tipos}
  if(p.tipo==='balancin') return {id,objeto,zona:'asiento',rect:[0,leverSeat.z,.029,.020],altura:leverSeat.y,admite:['bolita']}
}

/** Both campaign and authoring derive geometry from catalog items, never from level-specific scales. */
export function compilarEscenario(nombre: string, formato: FormatoMesa, objetos: PiezaColocada[],
  conexiones: ConexionInstalada[] = [], secuencias: Secuencia[] = []): Nivel {
  const base = baseMesa(nombre, formato)
  const mecanismos = objetos.filter(p=>esMando(p.tipo)||esReceptor(p.tipo))
  return {
    ...base, contexto:'desafio', requiere:null, objetos:structuredClone(objetos), inventario:inventario(),
    fijos:[...base.fijos,...objetos.map(p=>({...p,activo:pieceAsset(p.tipo,p.configuracion),
      rol:p.tipo==='inicio'||p.tipo==='meta'?p.tipo:escenario[pieceAsset(p.tipo,p.configuracion)]?'escenario' as const:'mecanismo' as const}))],
    superficies:[...base.superficies,...objetos.flatMap(p=>{const s=apoyoDeObjeto(p);return s?[s]:[]})],
    instalacion:mecanismos.length || conexiones.length || secuencias.length ? {dispositivos:mecanismos,conexiones,secuencias} : undefined,
  }
}
