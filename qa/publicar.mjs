import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { origen, ejecutar, gitEn, revision } from './revision-local.mjs'
import { validarCertificado } from './certificado-publicacion.mjs'

// This is the explicit publication entry point. Merely verifying/pushing never deploys.
async function publicar() {
  if (process.argv.length !== 2) throw new Error('Usá npm run publish:verified desde el commit de main que querés publicar.')
  const commit = revision(origen, 'HEAD')
  const remoto = gitEn(origen, 'remote', 'get-url', 'origin').trim()
  const repo = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remoto)?.[1]
  if (!repo) throw new Error('La publicación requiere un origin de GitHub reconocible.')
  const gh = (...args) => execFileSync('gh', args, { cwd: origen, windowsHide: true, encoding: 'utf8' }).trim()
  // Fail before the expensive verification if CLI authorization or revision is missing.
  const main = () => gh('api', `repos/${repo}/commits/main`, '--jq', '.sha')
  if (main() !== commit) throw new Error('HEAD debe coincidir con main en GitHub. Integrá los cambios y actualizá el clon antes de publicar.')
  await mkdir(path.join(origen, '.qa-local', 'publicaciones'), { recursive: true })
  const carpeta = await mkdtemp(path.join(origen, '.qa-local', 'publicaciones', commit.slice(0, 12) + '-'))
  const informe = path.join(carpeta, 'completa.json')
  await ejecutar(origen, process.execPath, ['qa/verificar-local.mjs', '--ref', commit, '--informe', informe])
  const completo = validarCertificado(JSON.parse(await readFile(informe, 'utf8')), commit)
  // Only the proof needed by Actions; no local machine names, paths, CPU or GPU details.
  const certificado = { aprobado: true, revision: commit, identidad: completo.identidad, distSHA256: completo.distSHA256,
    ambiente: { plataforma: 'win32' }, etapas: { ...completo.etapas, aceptacion: { aprobado: true } } }
  if (main() !== commit) throw new Error('main avanzó durante las pruebas. La revisión nueva debe verificarse antes de publicarla.')
  const entrada = path.join(carpeta, 'solicitud.json')
  await writeFile(entrada, JSON.stringify({ ref: 'main', inputs: { revision: commit, certificado: JSON.stringify(certificado) } }) + '\n')
  gh('api', '--method', 'POST', `repos/${repo}/actions/workflows/pages.yml/dispatches`, '--input', entrada)
  console.log(`Publicación solicitada para ${commit}. GitHub comprobará la revisión y la huella del dist antes del despliegue.\nhttps://github.com/${repo}/actions/workflows/pages.yml`)
}
publicar().catch(error => { console.error(error); process.exitCode = 1 })
