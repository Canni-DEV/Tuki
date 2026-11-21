import { configuracion, type ConfiguracionDispositivo } from './dispositivos'
import type { Armado, PiezaColocada } from './types'
import { iconButton, html, nombres } from './ui'

export function formularioDispositivo(dialog: HTMLDialogElement, p: PiezaColocada, piezas: PiezaColocada[], cableado: boolean, guardar: (c: ConfiguracionDispositivo) => void) {
  const c = structuredClone(configuracion(p)!)
  const campo = (nombre: string, etiqueta: string, opciones: [string|number,string][], valor: unknown) =>
    '<label><span id="dispositivo-' + nombre + '">' + etiqueta + '</span><select aria-labelledby="dispositivo-' + nombre + '" name="' + nombre + '">' + opciones.map(([v,t]) =>
      '<option value="' + v + '"' + (String(v) === String(valor) ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>'
  dialog.innerHTML = iconButton('cerrar','Cerrar','cierre') + '<h2>Configurar ' + html(nombres[p.tipo]) + '</h2><form id="dispositivo-form">' +
    ('modo' in c && cableado ? campo('modo','Activación',[['automatico','Automática'],['cable','Por cable']],c.modo) : '') +
    ('inclinacion' in c ? campo('inclinacion','Inclinación',(c.clase === 'lanzador' ? [30,45,60] : [0,15,30]).map(n => [n,n+'°']),c.inclinacion) : '') +
    ('potencia' in c ? campo('potencia','Potencia',[['baja','Baja'],['media','Media'],['alta','Alta']],c.potencia) : '') +
    ('demora' in c ? campo('demora',c.clase==='retenedor'?'Demora automática':'Demora',[[.5,'0,5 segundos'],[1,'1 segundo'],[2,'2 segundos']],c.demora) : '') +
    ('lastre' in c ? campo('lastre','Contrapeso',[[6,'6 gramos'],[12,'12 gramos'],[24,'24 gramos']],c.lastre) : '') +
    '<p role="status" id="dispositivo-error"></p><button type="submit">Guardar</button></form>'
  if(c.clase==='retenedor') {
    const actualizar=()=>{dialog.querySelector<HTMLSelectElement>('[name=demora]')!.disabled=dialog.querySelector<HTMLSelectElement>('[name=modo]')?.value==='cable'}
    dialog.querySelector('[name=modo]')?.addEventListener('change',actualizar);actualizar()
  }
  dialog.querySelector<HTMLFormElement>('form')!.onsubmit = ev => {
    ev.preventDefault()
    const datos = new FormData(ev.currentTarget as HTMLFormElement), nuevo = {...c} as unknown as Record<string,unknown>
    for (const [k,v] of datos) nuevo[k] = ['inclinacion','demora','lastre'].includes(k) ? Number(v) : v
    const propuesta = nuevo as unknown as ConfiguracionDispositivo
    if ('modo' in propuesta && propuesta.modo === 'automatico' && ['lanzador','retenedor'].includes(p.tipo) &&
        piezas.some(o => o.apoyo === p.id + '/apoyo')) {
      dialog.querySelector('#dispositivo-error')!.textContent = 'Retirá la bola cargada antes de elegir el modo automático.'; return
    }
    dialog.close()
    guardar(propuesta)
  }
  dialog.showModal()
}
export function formularioSecuencia(dialog: HTMLDialogElement, receptor: string, armado: Armado, guardar: (mandos: string[] | null) => void) {
  const regla = armado.secuencias?.find(r => r.receptor === receptor)
  const mandos = [...(regla?.mandos ?? armado.conexiones!.filter(c => c.receptor === receptor).map(c => c.mando))]
  let secuencial = !!regla
  function dibujar() {
    dialog.innerHTML = iconButton('cerrar', 'Cerrar', 'cierre') + '<h2>Configurar secuencia</h2><label>Activación de ' +
      html(receptor) + '<select><option value="directa">Directa</option><option value="secuencia">En secuencia</option></select></label>' +
      (secuencial ? '<ol class="orden-mandos">' + mandos.map((id, i) => '<li>' + html(id) +
        ' <button type="button" data-subir="' + i + '" aria-label="Subir ' + html(id) + '"' + (i ? '' : ' disabled') + '>↑</button>' +
        ' <button type="button" data-bajar="' + i + '" aria-label="Bajar ' + html(id) + '"' + (i + 1 < mandos.length ? '' : ' disabled') +
        '>↓</button></li>').join('') + '</ol>' : '') + '<button id="guardar-secuencia">Guardar</button>'
    const select = dialog.querySelector('select')!
    select.value = secuencial ? 'secuencia' : 'directa'
    select.onchange = () => { secuencial = select.value === 'secuencia'; dibujar() }
    dialog.querySelectorAll<HTMLButtonElement>('[data-subir],[data-bajar]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.subir ?? b.dataset.bajar)
        const j = i + (b.dataset.subir === undefined ? 1 : -1)
        const elegido = mandos[i]
        mandos[i] = mandos[j]
        mandos[j] = elegido
        dibujar()
      }
    })
    dialog.querySelector<HTMLButtonElement>('#guardar-secuencia')!.onclick = () => {
      dialog.close()
      guardar(secuencial ? mandos : null)
    }
  }
  dibujar()
  dialog.showModal()
}
