import { Guardados } from './guardado'

export function mostrarGuardados() {
  const estadoGuardado = document.createElement('aside')
  estadoGuardado.hidden = true; estadoGuardado.className = 'save-status'; estadoGuardado.setAttribute('aria-live', 'polite')
  document.body.append(estadoGuardado)
  const guardados = new Guardados(() => {
    estadoGuardado.hidden = !guardados.pendiente
    estadoGuardado.replaceChildren()
    if (!guardados.pendiente) return
    estadoGuardado.append(guardados.error ? 'No se pudo guardar. Tus cambios siguen en esta sesión. ' : 'Guardando…')
    if (guardados.error) for (const [texto, accion] of [['Reintentar', () => guardados.reintentar()], ['Exportar pendientes', () => guardados.exportar()]] as const) {
      const b = document.createElement('button'); b.textContent = texto; b.onclick = accion; estadoGuardado.append(b)
    }
  })
  window.addEventListener('beforeunload', ev => { if (guardados.pendiente) { ev.preventDefault(); ev.returnValue = '' } })
  return guardados
}
