import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export async function archivos(dir, ignorar = new Set()) {
  const resultado = []
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (ignorar.has(e.name)) continue
    const file = path.join(dir, e.name)
    if (e.isDirectory()) resultado.push(...await archivos(file, ignorar))
    else if (e.isFile()) resultado.push(file)
  }
  return resultado
}
export async function huellaArchivos(files, desde) {
  const digest = createHash('sha256')
  for (const file of files.toSorted()) digest.update(path.relative(desde, file).replaceAll('\\', '/') + '\0').update(await readFile(file)).update('\0')
  return digest.digest('hex')
}
