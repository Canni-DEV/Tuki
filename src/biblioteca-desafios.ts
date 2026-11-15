import { leerDesafio, type DocumentoDesafio } from './desafios'
import type { Armado } from './types'

export interface DesafioGuardado {
  id: string
  documento: DocumentoDesafio
  propio: boolean
  intento?: Armado
}
export const claveVictoria = (d: DocumentoDesafio) => `${d.id}:${d.revision}:${d.certificacion?.huella ?? ''}`

export class BibliotecaDesafios {
  readonly entradas = new Map<string,DesafioGuardado>()
  readonly completados = new Set<string>()
  private db?: IDBDatabase
  private ready?: Promise<void>
  constructor(private fallo:()=>void) {}
  abrir() {
    return this.ready ??= new Promise<void>(resolve=>{
      try {
        const req = indexedDB.open('tuki.desafios.v1',1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore('desafios',{keyPath:'id'})
          req.result.createObjectStore('completados')
        }
        req.onerror = () => {this.fallo();resolve()}
        req.onblocked = () => {this.fallo();resolve()}
        req.onsuccess = () => {
          this.db = req.result
          this.db.onversionchange = () => {this.db?.close();this.db=undefined}
          const tx = this.db.transaction(['desafios','completados'])
          const desafios = tx.objectStore('desafios').getAll(), victorias = tx.objectStore('completados').getAllKeys()
          desafios.onsuccess = () => {
            for (const entry of desafios.result as DesafioGuardado[]) {
              try {this.entradas.set(entry.id,{...entry,documento:leerDesafio(entry.documento)})} catch {this.fallo()}
            }
          }
          victorias.onsuccess = () => {for(const key of victorias.result) this.completados.add(String(key))}
          tx.oncomplete = () => resolve()
          tx.onerror = () => {this.fallo();resolve()}
        }
      } catch {this.fallo();resolve()}
    })
  }
  guardar(documento:DocumentoDesafio, propio = true, id = crypto.randomUUID() as string) {
    const anterior = this.entradas.get(id)
    const entry:DesafioGuardado = {id,documento:structuredClone(documento),propio,
      intento: anterior?.documento.certificacion?.huella === documento.certificacion?.huella ? anterior?.intento : undefined}
    this.entradas.set(id,entry);this.escribir('desafios',entry,id)
    return entry
  }
  guardarIntento(entry:DesafioGuardado,intento:Armado) {
    const next = {...entry,intento:structuredClone(intento)}
    this.entradas.set(entry.id,next);this.escribir('desafios',next,entry.id)
    return next
  }
  completar(d:DocumentoDesafio) {
    const key = claveVictoria(d)
    this.completados.add(key);this.escribir('completados',true,key)
  }
  resuelto(d:DocumentoDesafio) {return this.completados.has(claveVictoria(d))}
  borrar(id:string) {this.entradas.delete(id);this.escribir('desafios',undefined,id)}
  private escribir(store:string,value:unknown,key:string) {
    try {
      if(!this.db){this.fallo();return}
      const tx=this.db.transaction(store,'readwrite'),s=tx.objectStore(store)
      if(value===undefined)s.delete(key)
      else if(store==='desafios')s.put(value)
      else s.put(value,key)
      tx.onabort=tx.onerror=()=>this.fallo()
    }catch{this.fallo()}
  }
}
