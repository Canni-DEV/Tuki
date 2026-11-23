import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { leerEnvio } from './politica-pruebas.mjs'
import { gitEn, origen, revision } from './revision-local.mjs'

// Git supplies the local object being sent. Never certify a different working tree.
const referencias = process.argv.length > 2 ? leerEnvio(readFileSync(0, 'utf8'))
  : [{ sha: revision(origen, 'HEAD'), completa: false, anterior: '0'.repeat(40) }]
const verificadas = new Set()
for (const envio of referencias.sort((a, b) => Number(b.completa) - Number(a.completa))) {
  if (envio.borrar) continue
  const ref = revision(origen, envio.sha) // Annotated tags also resolve to their actual commit.
  let base
  if (!/^0+$/.test(envio.anterior)) {
    try {
      const anterior = revision(origen, envio.anterior)
      // For a force update use the common history, not a diff against unrelated code.
      base = gitEn(origen, 'merge-base', anterior, ref).trim()
    } catch { /* First push or unavailable remote object: selector falls back to main/all. */ }
  }
  const clave = `${ref}:${base ?? ''}`
  if (verificadas.has(ref) || verificadas.has(clave)) continue
  const script = envio.completa ? 'qa/verificar-local.mjs' : 'qa/verificar-cambios.mjs'
  console.log(`Pre-push ${envio.remoto ?? 'HEAD'}: ${envio.completa ? 'verificación completa' : 'pruebas por tipo de cambio'}`)
  const child = spawn(process.execPath, [script, '--ref', ref, ...(!envio.completa && base ? ['--base', base] : [])], { stdio: 'inherit', windowsHide: true })
  const [code] = await once(child, 'exit')
  if (code !== 0) { process.exitCode = code ?? 1; break }
  verificadas.add(envio.completa ? ref : clave)
}
