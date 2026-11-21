import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'

// Git supplies the local object being sent. Never certify a different working tree.
const referencias = process.argv.length > 2
  ? [...new Set(readFileSync(0, 'utf8').trim().split('\n').filter(Boolean).map(linea => linea.split(/\s+/)[1]).filter(sha => !/^0+$/.test(sha)))]
  : [undefined]
for (const ref of referencias) {
  if (ref && !/^[a-f0-9]{40,64}$/.test(ref)) throw new Error('Revisión Git inválida.')
  const child = spawn(process.execPath, ['qa/verificar-local.mjs', ...(ref ? ['--ref', ref] : [])], { stdio: 'inherit', windowsHide: true })
  const [code] = await once(child, 'exit')
  if (code !== 0) { process.exitCode = code ?? 1; break }
}
