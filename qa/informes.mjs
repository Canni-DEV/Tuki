import { readFile } from 'node:fs/promises'

export async function comprobarInforme(file, permitirTactil = false) {
  const report = JSON.parse(await readFile(file, 'utf8'))
  if (report.errors?.length || report.stats.unexpected || report.stats.flaky || !report.stats.expected) throw new Error('El informe de navegador no está aprobado: ' + file)
  const omitidos = []
  const recorrer = suites => { for (const suite of suites) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) if (test.status === 'skipped') omitidos.push({ titulo: spec.title, proyecto: test.projectName, anotaciones: test.annotations })
    recorrer(suite.suites ?? [])
  } }
  recorrer(report.suites)
  if (omitidos.some(t => !permitirTactil || t.proyecto !== 'firefox' || !t.anotaciones?.some(a => /CDP|multipuntero|transporte táctil/.test(a.description ?? ''))))
    throw new Error('Hay pruebas omitidas sin una limitación explícita de automatización: ' + JSON.stringify(omitidos))
  return { ...report.stats, omitidos }
}

export async function comprobarUnitarias(file) {
  const report = JSON.parse(await readFile(file, 'utf8'))
  if (!report.success || !report.numPassedTests || report.numFailedTests) throw new Error('La selección unitaria no ejecutó pruebas aprobadas: ' + file)
}
