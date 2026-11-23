import { describe, it, expect } from 'vitest'
import { Aprobaciones, claveComprobacion } from '../src/render/aprobacion'
import { resumir } from '../src/render/metricas'

const storage = () => {
  const values = new Map<string, string>()
  return { values, getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) } }
}
const report = (pass = true) => ({ accepted: pass,
  results: ['claro', 'oscuro'].map(theme => ({ theme, accepted: pass, ...resumir(Array(300).fill(pass ? 16.7 : 40)) })) })

describe('comprobación única de CALIDAD', () => {
  it('guarda ambos perfiles en un registro sin caducidad y permite borrar los datos', () => {
    const s = storage(), first = new Aprobaciones(() => s, () => 10000)
    first.save({ alta: report(), equilibrada: report() })
    const restored = new Aprobaciones(() => s, () => 10000 + 10 * 365 * 86400000)
    expect(restored.read()?.profiles).toEqual({ alta: report(), equilibrada: report() })
    expect([...s.values.keys()]).toEqual([claveComprobacion])
    s.values.clear()
    expect(restored.read()).toBeUndefined()
    expect(first.read()).toBeUndefined()
  })
  it('conserva los resultados fallidos sin habilitar esos perfiles ni pedir otro ensayo', () => {
    const s = storage(), a = new Aprobaciones(() => s)
    a.save({ alta: report(false), equilibrada: report() })
    expect(new Aprobaciones(() => s).read()?.profiles.alta?.accepted).toBe(false)
    expect(a.read()?.profiles.equilibrada?.accepted).toBe(true)
    a.save({ alta: report(false), equilibrada: report(false) })
    expect(a.read()).toBeDefined()
    expect(Object.values(a.read()!.profiles).every(r => !r.accepted)).toBe(true)
  })
  it('migra aprobaciones previas aunque cambien navegador, GPU o revisión, sin inventar otro perfil', () => {
    const s = storage()
    s.setItem('tuki.render.aprobacion.alta', JSON.stringify({ signature: 'old-browser-old-gpu-old-pipeline', approvedAt: 12345, report: report() }))
    const migrated = new Aprobaciones(() => s).read()!
    expect(migrated.checkedAt).toBe(12345)
    expect(migrated.profiles.alta).toEqual(report())
    expect(migrated.profiles.equilibrada).toBeUndefined()
    expect(s.getItem('tuki.render.aprobacion.alta')).toBeNull()
    s.removeItem(claveComprobacion)
    expect(new Aprobaciones(() => s).read()).toBeUndefined()
  })
  it('migra los dos perfiles cuando existen y no restaura un falso aprobado', () => {
    const s = storage()
    for (const q of ['alta', 'equilibrada']) s.setItem(`tuki.render.aprobacion.${q}`,
      JSON.stringify({ signature: q, approvedAt: 100, report: report() }))
    expect(Object.keys(new Aprobaciones(() => s).read()!.profiles)).toEqual(['alta', 'equilibrada'])
    s.values.clear()
    s.setItem('tuki.render.aprobacion.alta', JSON.stringify({ approvedAt: 100, report: { ...report(false), accepted: true } }))
    expect(new Aprobaciones(() => s).read()).toBeUndefined()
  })
  it('rechaza datos incompletos, duplicados e inconsistentes sin sobrescribir una aprobación', () => {
    const s = storage(), a = new Aprobaciones(() => s)
    a.save({ alta: report(), equilibrada: report() })
    const before = s.getItem(claveComprobacion)
    const invalid = { ...report(), results: [report().results[0], report().results[0]] }
    expect(() => a.save({ alta: invalid, equilibrada: report() })).toThrow()
    expect(s.getItem(claveComprobacion)).toBe(before)
    for (const value of ['{', '{}', JSON.stringify({ version: 1, checkedAt: 100, profiles: { alta: { ...report(false), accepted: true } } })]) {
      s.setItem(claveComprobacion, value); expect(a.read()).toBeUndefined()
    }
  })
  it('reutiliza en sesión e informa que no persistió si el navegador bloquea el guardado', () => {
    const a = new Aprobaciones(() => { throw new Error('Storage blocked') })
    a.save({ alta: report(), equilibrada: report() })
    expect(a.read()?.profiles.alta?.accepted).toBe(true)
    expect(a.persistent).toBe(false)
  })
})
