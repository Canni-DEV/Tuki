import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, symlink, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

export const origen = path.resolve(import.meta.dirname, '..')
export function gitEn(root, ...args) {
  return execFileSync('git', args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }).toString('utf8')
}
export async function ejecutar(root, executable, args, env = {}) {
  const child = spawn(executable, args, { cwd: root, windowsHide: true, env: { ...process.env, ...env }, stdio: 'inherit' })
  const [code, signal] = await once(child, 'exit')
  if (code !== 0) throw new Error(`${path.basename(executable)} ${args.join(' ')} terminó con ${code ?? signal}.`)
}
export function revision(root, ref) {
  const commit = gitEn(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim()
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Revisión Git inválida.')
  return commit
}
export async function snapshot(ref, fuente = origen) {
  const commit = revision(fuente, ref), local = path.join(fuente, '.qa-local', 'revisiones')
  await mkdir(local, { recursive: true })
  const destino = await mkdtemp(path.join(local, commit.slice(0, 12) + '-'))
  gitEn(fuente, 'archive', '--format=tar', `--output=${path.join(destino, 'fuentes.tar')}`, commit)
  execFileSync('tar', ['-xf', 'fuentes.tar'], { cwd: destino, windowsHide: true })
  await unlink(path.join(destino, 'fuentes.tar'))
  for (const sub of ['', 'render/fotorealista']) {
    const desde = path.join(fuente, sub), hasta = path.join(destino, sub)
    if (!existsSync(path.join(hasta, 'package-lock.json'))) continue
    const iguales = (await readFile(path.join(desde, 'package-lock.json'))).equals(await readFile(path.join(hasta, 'package-lock.json')))
    if (iguales && existsSync(path.join(desde, 'node_modules'))) {
      if (!existsSync(path.join(hasta, 'node_modules'))) await symlink(path.join(desde, 'node_modules'), path.join(hasta, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    } else {
      const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
      if (!existsSync(npm)) throw new Error('No se encontró npm junto a Node para preparar la revisión aislada.')
      // Preserve the project's postinstall; its isolated render install already uses --ignore-scripts.
      await ejecutar(hasta, process.execPath, [npm, 'ci', ...(sub ? ['--ignore-scripts'] : [])])
    }
  }
  return destino
}

export function archivosCambiados(root, { ref, base } = {}) {
  const destino = ref ? revision(root, ref) : undefined
  let desde
  if (base) desde = revision(root, base) // An explicit invalid base must never silently pass.
  else for (const candidata of ['refs/remotes/origin/main', 'refs/heads/main']) {
    try { desde = gitEn(root, 'merge-base', candidata, destino ?? 'HEAD').trim(); break } catch { /* Try local main. */ }
  }
  // Without history, cover every tracked file, including the unknown-path fallback.
  const paths = desde
    ? gitEn(root, 'diff', '--name-only', '-z', '--no-renames', desde, ...(destino ? [destino] : []), '--').split('\0')
    : gitEn(root, 'ls-tree', '-r', '--name-only', '-z', destino ?? 'HEAD').split('\0')
  if (!ref) paths.push(...gitEn(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0'))
  return { base: desde ?? null, revision: destino ?? null, archivos: [...new Set(paths.filter(Boolean))].sort() }
}
