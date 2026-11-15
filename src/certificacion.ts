import type { DocumentoDesafio } from './desafios'

/** A separate worker per certificate makes cancellation release the entire physics world. */
export function certificarEnWorker(d: DocumentoDesafio, signal?: AbortSignal, progreso: (texto:string)=>void = ()=>{}): Promise<DocumentoDesafio> {
  return new Promise((resolve,reject)=>{
    const worker = new Worker(new URL('./desafios.worker.ts',import.meta.url),{type:'module'})
    const cancelar = () => terminar(undefined,new DOMException('Verificación cancelada.','AbortError'))
    const terminar = (resultado?:DocumentoDesafio,error?:Error) => {
      worker.terminate(); signal?.removeEventListener('abort',cancelar)
      if (error) reject(error); else resolve(resultado!)
    }
    worker.onmessage = ({data}) => {
      if (data.progreso) progreso(data.progreso)
      else if (data.error) terminar(undefined,new Error(data.error))
      else terminar(data.desafio)
    }
    worker.onerror = () => terminar(undefined,new Error('No se pudo comprobar el desafío. Volvé a intentar.'))
    signal?.addEventListener('abort',cancelar,{once:true})
    if (signal?.aborted) cancelar(); else worker.postMessage(d)
  })
}
