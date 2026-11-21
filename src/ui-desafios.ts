import { leerDesafio, type DocumentoDesafio } from './desafios'
import { certificarEnWorker } from './certificacion'
import { formatosMesa, gruposBandeja, inventario, piezas, tipos, type FormatoMesa, type TipoColocable } from './types'
import { html, iconButton } from './ui'

export interface AccionesDesafio {
  guardar: (d:DocumentoDesafio)=>Promise<void>
  editar: (d:DocumentoDesafio)=>void
  probar: (d:DocumentoDesafio)=>void
  exportar: (d:DocumentoDesafio)=>void
}

export function fichaDesafio(dialog:HTMLDialogElement, original:DocumentoDesafio, acciones:AccionesDesafio) {
  let documento=structuredClone(original)
  const todas=[...documento.instalados,...documento.solucion.piezas]
  const cables=[...documento.conexionesInstaladas,...documento.solucion.conexiones]
  const fijo=new Set(documento.instalados.map(p=>p.id))
  const etiqueta=(id:string)=>{
    const i=todas.findIndex(p=>p.id===id)
    return i<0?'Pieza ausente':piezas[todas[i].tipo][1]+' '+(i+1)
  }
  const cantidad=(t:TipoColocable)=>documento.solucion.piezas.filter(p=>p.tipo===t).length
  dialog.classList.add('author-dialog')
  dialog.innerHTML=iconButton('cerrar','Cerrar','cierre')+'<h2>Crear desafío</h2><form id="ficha-desafio">'+
    '<label>Nombre<input name="nombre" required maxlength="80" value="'+html(documento.nombre)+'"></label>'+
    '<label>Motivo de la escena<textarea name="motivo" maxlength="240" placeholder="Por ejemplo: ordenar libros después de estudiar">'+html(documento.motivo)+'</textarea></label>'+
    '<label>Mesa<select name="formato">'+Object.entries(formatosMesa).map(([id,m])=>'<option value="'+id+'"'+(id===documento.formatoMesa?' selected':'')+'>'+m.nombre+'</option>').join('')+'</select></label>'+
    '<label class="check"><input type="checkbox" name="cableado"'+(documento.permiteCableado?' checked':'')+'>El jugador puede cablear</label>'+
    '<details><summary>Objetos instalados · '+documento.instalados.length+'</summary><p>Los objetos marcados empiezan colocados y no se pueden editar durante la partida. Conservan su movimiento físico.</p><div class="author-items">'+
    todas.map(p=>'<label class="check"><input type="checkbox" data-fijo="'+html(p.id)+'"'+(fijo.has(p.id)?' checked':'')+(['inicio','meta'].includes(p.tipo)?' disabled':'')+'>'+html(etiqueta(p.id))+'</label>').join('')+'</div></details>'+
    '<details><summary>Conexiones instaladas · '+documento.conexionesInstaladas.length+'</summary><p>Desmarcá las conexiones que deberá construir el jugador. Sus extremos pueden estar instalados o formar parte de la solución.</p>'+
    cables.map((c,i)=>'<label class="check"><input type="checkbox" data-cable="'+i+'"'+(documento.conexionesInstaladas.some(x=>x.mando===c.mando&&x.receptor===c.receptor)?' checked':'')+'>'+html(etiqueta(c.mando))+' → '+html(etiqueta(c.receptor))+'</label>').join('')+'</details>'+
    '<details><summary>Inventario y piezas adicionales</summary><p>La solución aporta las cantidades mínimas. Podés ofrecer piezas adicionales para permitir otras construcciones.</p>'+
    gruposBandeja.filter(g=>g.nombre!=='Extremos').map(g=>'<fieldset><legend>'+g.nombre+'</legend>'+g.tipos.map(t=>'<label class="author-stock">'+piezas[t][1]+' <small data-minimo="'+t+'">Solución: '+cantidad(t)+'</small><span>Adicionales <input type="number" min="0" max="200" step="1" data-extra="'+t+'" value="'+Math.max(0,documento.inventario[t]-cantidad(t))+'"></span></label>').join('')+'</fieldset>').join('')+'</details>'+
    '<p class="author-status" role="status">'+(documento.estado==='certificado'?'Solución certificada.':'Borrador · todavía no certificado.')+'</p><div class="acciones">'+
    '<button type="submit">Guardar borrador</button><button type="button" data-author="editar">Editar mesa y solución</button><button type="button" data-author="probar">Probar como jugador</button><button type="button" data-author="certificar" class="primary">Certificar solución</button><button type="button" data-author="exportar">Exportar archivo</button></div></form>'
  const form=dialog.querySelector<HTMLFormElement>('form')!, estado=dialog.querySelector<HTMLElement>('[role=status]')!
  const recoger=()=>{
    if(!form.reportValidity())throw new Error('Revisá los campos del desafío.')
    const ids=new Set([...form.querySelectorAll<HTMLInputElement>('[data-fijo]:checked')].map(e=>e.dataset.fijo!))
    const solucion=todas.filter(p=>!ids.has(p.id)), saldo=inventario()
    for(const p of solucion)saldo[p.tipo]++
    for(const input of form.querySelectorAll<HTMLInputElement>('[data-extra]'))saldo[input.dataset.extra as TipoColocable]+=Number(input.value)
    const instaladas=[...form.querySelectorAll<HTMLInputElement>('[data-cable]:checked')].map(e=>Number(e.dataset.cable))
    const campos=new FormData(form)
    const d:DocumentoDesafio={...documento,nombre:String(campos.get('nombre')).trim(),motivo:String(campos.get('motivo')).trim(),
      formatoMesa:String(campos.get('formato')) as FormatoMesa, permiteCableado:campos.has('cableado'),
      instalados:todas.filter(p=>ids.has(p.id)),inventario:saldo,
      conexionesInstaladas:cables.filter((_,i)=>instaladas.includes(i)).map(c=>({...c,guias:documento.conexionesInstaladas.find(x=>x.mando===c.mando&&x.receptor===c.receptor)?.guias ?? []})),
      solucion:{piezas:solucion,conexiones:cables.filter((_,i)=>!instaladas.includes(i)).map(({mando,receptor})=>({mando,receptor}))}}
    const fisica=(x:DocumentoDesafio)=>JSON.stringify([x.formatoMesa,x.permiteCableado,x.instalados,x.inventario,x.conexionesInstaladas,x.solucion])
    if(fisica(d)!==fisica(documento)){d.revision++;d.estado='borrador';delete d.certificacion}
    return leerDesafio(d)
  }
  form.addEventListener('change',()=>{
    const ids=new Set([...form.querySelectorAll<HTMLInputElement>('[data-fijo]:checked')].map(e=>e.dataset.fijo!))
    for(const t of tipos){const label=form.querySelector<HTMLElement>('[data-minimo='+t+']');if(label)label.textContent='Solución: '+todas.filter(p=>p.tipo===t&&!ids.has(p.id)).length}
  })
  let ocupado = false
  const ejecutar = async (accion: string) => {
    if (ocupado) return
    let deshabilitados: boolean[] = []
    const controls = [...form.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('input,button,select,textarea')]
    const vigente = () => dialog.open && form.isConnected
    try {
      const d = recoger()
      ocupado = true
      deshabilitados = controls.map(c => c.disabled)
      controls.forEach(c => c.disabled = true)
      estado.textContent = 'Guardando…'
      if (accion === 'exportar') { acciones.exportar(d); estado.textContent = 'Archivo exportado.'; return }
      await acciones.guardar(d)
      documento = d
      if (!vigente()) return
      estado.textContent = 'Cambios guardados.'
      if (accion === 'guardar') return
      if (accion === 'editar' || accion === 'probar') { dialog.close(); acciones[accion](d); return }
      const controller = new AbortController()
      const cancelar = () => controller.abort()
      dialog.addEventListener('close', cancelar, { once: true })
      const cancelarBoton = document.createElement('button')
      cancelarBoton.type = 'button'; cancelarBoton.textContent = 'Cancelar verificación'; cancelarBoton.onclick = cancelar
      estado.after(cancelarBoton)
      try {
        const certificado = await certificarEnWorker(d, controller.signal, texto => estado.textContent = texto)
        if (!vigente() || controller.signal.aborted) return
        await acciones.guardar(certificado)
        documento = certificado
        if (vigente()) estado.textContent = 'Solución certificada en tres intentos. Ya podés compartir el desafío.'
      } finally { dialog.removeEventListener('close', cancelar); cancelarBoton.remove() }
    } catch (error) {
      if (vigente()) estado.textContent = (error as Error).message
    } finally {
      if (ocupado) controls.forEach((c, i) => c.disabled = deshabilitados[i])
      ocupado = false
    }
  }
  form.onsubmit = ev => { ev.preventDefault(); void ejecutar('guardar') }
  for (const b of form.querySelectorAll<HTMLButtonElement>('[data-author]')) b.onclick = () => void ejecutar(b.dataset.author!)
  dialog.addEventListener('close',()=>dialog.classList.remove('author-dialog'),{once:true})
  if(!dialog.open)dialog.showModal()
}
