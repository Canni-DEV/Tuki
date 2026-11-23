import { archivos, huellaArchivos } from './huellas.mjs'

export function validarCertificado(c, revision) {
  if (!/^[a-f0-9]{40,64}$/.test(revision ?? '') || c?.revision !== revision || c.aprobado !== true ||
      !/^[a-f0-9]{64}$/.test(c.distSHA256 ?? '') || !/^[a-f0-9]{64}$/.test(c.identidad ?? '') ||
      c.ambiente?.plataforma !== 'win32') throw new Error('La constancia completa no corresponde a esta revisión.')
  for (const nombre of ['funcional', 'rendimiento', 'calidad']) {
    const etapa = c.etapas?.[nombre]
    if (!etapa?.expected || etapa.unexpected !== 0 || etapa.flaky !== 0 || !Array.isArray(etapa.omitidos)) throw new Error('Falta una etapa aprobada: ' + nombre)
    if (etapa.omitidos.length !== etapa.skipped || etapa.omitidos.some(t => nombre !== 'funcional' || t.proyecto !== 'firefox' ||
      !t.anotaciones?.some(a => /CDP|multipuntero|transporte táctil/.test(a.description ?? '')))) throw new Error('La constancia contiene omisiones sin justificar.')
  }
  if (c.etapas?.aceptacion?.aprobado !== true) throw new Error('Falta la aceptación Windows.')
  return c
}

export async function comprobarDist(c, revision, dist) {
  validarCertificado(c, revision)
  const actual = await huellaArchivos(await archivos(dist), dist)
  if (actual !== c.distSHA256) throw new Error('La compilación no coincide con los bytes que pasaron la verificación completa. No se publica.')
}
