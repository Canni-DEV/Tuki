export function descargarDocumento(documento:unknown,nombre:string,sufijo:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(documento,null,2)],{type:'application/json'}))
  const link=document.createElement('a');link.href=url;link.download=(nombre.replace(/[^\p{L}\p{N}_-]+/gu,'-')||'Desafio')+sufijo;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
