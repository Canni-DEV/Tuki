export function resumen(r) {
  const [chrome, firefox] = r.navegadores
  const etiqueta = browser => browser.nombre + (browser.nombre === 'Chrome' && browser.edicion === 'Google Chrome for Testing' ? ' for Testing' : '') + ' ' + browser.version
  const text = [
    '# Aceptación de escritorio de Tuki', '',
    `Fecha de ejecución UTC ${r.fecha.slice(0,10)}. Se probó la compilación estática con SHA-256 agregado \`${r.distSHA256}\`. El runner comprueba los nombres y bytes de todos los recursos servidos al comenzar y terminar.`, '',
    `Equipo con ${r.equipo.cpu} y ${r.equipo.sistema} (compilación ${r.equipo.compilacion}). Los adaptadores instalados son ${r.equipo.adaptadores.map(a=>a.Name).join(' y ')}.`, '',
    '## Repetibilidad', '',
    `Cada casillero indica las pasadas que coincidieron en el desenlace y el orden de los contactos decisivos. Se capturaron eventos desde Empujar y Repetir en ventanas visibles a velocidad real.`, '',
    '| Montaje | '+etiqueta(chrome)+' · 1× | 0,25× | '+etiqueta(firefox)+' · 1× | 0,25× | Desenlace esperado |',
    '|---|---:|---:|---:|---:|---|',
  ]
  const cells = row => [1,.25].map(v => {
    const runs = row.pasadas.filter(p=>p.velocidad===v)
    return runs.filter(p=>p.coincide).length+'/'+runs.length
  })
  for (const row of chrome.montajes) {
    const other = firefox.montajes.find(m=>m.nombre===row.nombre)
    text.push('| '+[row.nombre,...cells(row),...cells(other),row.esperado==='victoria'?'Victoria':'Cadena detenida'].join(' | ')+' |')
  }
  text.push('', '## Taza mixta a velocidad normal', '',
    '| Navegador | Adaptador efectivo | Viewport CSS | DPR | Mínimos de las ocho pasadas, FPS |',
    '|---|---|---|---:|---|')
  for (const browser of r.navegadores) {
    const row = browser.montajes.find(m=>m.nombre==='taza-mixta')
    const {gpu,viewport,dpr}=row.condiciones
    const minima = row.pasadas.filter(p=>p.velocidad===1).map(p=>p.fps.length?Math.min(...p.fps):'sin ventana')
    text.push(`| ${etiqueta(browser)} | ${gpu} | ${viewport.join(' × ')} | ${dpr} | ${minima.join(', ')} |`)
  }
  const all = r.navegadores.flatMap(b=>b.montajes.flatMap(m=>m.pasadas))
  const presentations = r.navegadores.flatMap(b=>b.montajes.map(m=>m.condiciones))
  const visible = presentations.every(c=>c.mesaVisible && c.inventarioVisible && c.empujarVisible && c.escala===1)
  text.push('', `Se contaron fotogramas en cada intervalo de un segundo, incluida la ventana que termina en el resultado. La serie completa por pasada, los pasos físicos, los grupos de contactos y la primera divergencia si la hubo figuran en el [registro JSON](aceptacion-windows.json).`, '',
    `La matriz ${r.aceptado?'**quedó aprobada**':'**requiere revisión**'}. Coincidieron el desenlace y los grupos de contactos en ${all.filter(p=>p.coincide).length} de ${all.length} pasadas. Se observó un solo empujón en ${all.filter(p=>p.impulsos===1).length} de ${all.length}. ${visible?'La mesa, el inventario y Empujar quedaron visibles con zoom al 100 % en ambos navegadores.':'El registro detalla el control de visibilidad que requiere revisión.'}`, '',
    '## Repetir la medición', '',
    'En Windows, abrir PowerShell en la raíz del repositorio. Con Node de la versión indicada en `.node-version`, ejecutar lo siguiente.', '',
    '```powershell','npm ci','npm run build -- --base=/Tuki/','node qa/windows/aceptacion.mjs','```','',
    'El runner sirve `dist/` en loopback y abre perfiles temporales de escritorio. Se puede indicar el ejecutable con `TUKI_CHROME` o `TUKI_FIREFOX`. Para usar una vista previa ya abierta, asignar su URL con la subruta a `TUKI_QA_URL`. La ejecución completa actualiza este informe y el JSON.', '')
  return text.join('\n')
}
