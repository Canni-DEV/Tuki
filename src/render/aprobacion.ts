import type { Calidad } from './contrato'
import type { InformeSondeo } from './sondeo'

export const claveComprobacion = 'tuki.render.comprobacion'
export const perfiles: readonly Calidad[] = ['alta', 'equilibrada']
export interface Comprobacion {
  version: 1
  checkedAt: number
  profiles: Partial<Record<Calidad, InformeSondeo>>
}
type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const legacyKey = (quality: Calidad) => `tuki.render.aprobacion.${quality}`

function informeValido(value: unknown): value is InformeSondeo {
  if (!value || typeof value !== 'object') return false
  const r = value as InformeSondeo
  if (typeof r.accepted !== 'boolean' || !Array.isArray(r.results) || r.results.length !== 2) return false
  return r.accepted === r.results.every(s => s?.accepted === true) && r.results.every((s, i) => {
    if (s?.theme !== (i ? 'oscuro' : 'claro') || typeof s.accepted !== 'boolean' ||
      !Number.isInteger(s.samples) || s.samples < 1 ||
      ![s.p50, s.p95, s.p99, s.max].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) ||
      s.p50! > s.p95! || s.p95! > s.p99! || s.p99! > s.max! ||
      !Number.isInteger(s.over25) || s.over25 < 0 || s.over25 > s.samples ||
      !Number.isInteger(s.over50) || s.over50 < 0 || s.over50 > s.over25) return false
    return s.accepted === (s.samples >= 150 && s.p95! <= 20 && s.p99! <= 33.3)
  })
}
function fechaValida(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
function valida(value: unknown): value is Comprobacion {
  if (!value || typeof value !== 'object') return false
  const c = value as Comprobacion
  if (c.version !== 1 || !fechaValida(c.checkedAt) || !c.profiles || typeof c.profiles !== 'object') return false
  const keys = Object.keys(c.profiles)
  return keys.length > 0 && keys.every(k => perfiles.includes(k as Calidad) && informeValido(c.profiles[k as Calidad]))
}

/** A completed check is user data, not a cache invalidated by browser/pipeline updates. */
export class Aprobaciones {
  private volatile?: Comprobacion
  persistent = true
  constructor(private storage: () => Almacen = () => localStorage, private now = () => Date.now()) {}
  read(): Comprobacion | undefined {
    if (this.volatile) return this.volatile
    try {
      const stored: unknown = JSON.parse(this.storage().getItem(claveComprobacion) ?? 'null')
      if (valida(stored)) return stored
      // Preserve successful old checks regardless of their old GPU/browser/revision signature.
      const profiles: Comprobacion['profiles'] = {}
      let checkedAt = 0
      for (const quality of perfiles) {
        let old
        try { old = JSON.parse(this.storage().getItem(legacyKey(quality)) ?? 'null') } catch { continue }
        if (fechaValida(old?.approvedAt) && informeValido(old?.report) && old.report.accepted) {
          profiles[quality] = old.report; checkedAt = Math.max(checkedAt, old.approvedAt)
        }
      }
      if (checkedAt) {
        const migrated: Comprobacion = { version: 1, checkedAt, profiles }
        this.write(migrated); return migrated
      }
    } catch { /* Restricted storage must not prevent playing. */ }
  }
  save(profiles: Record<Calidad, InformeSondeo>) {
    const check: Comprobacion = { version: 1, checkedAt: this.now(), profiles }
    if (perfiles.some(q => !profiles[q]) || !valida(check)) throw new Error('Comprobación incompleta o inválida.')
    this.write(check)
  }
  private write(check: Comprobacion) {
    try {
      this.storage().setItem(claveComprobacion, JSON.stringify(check))
      this.volatile = undefined; this.persistent = true
      // Do not resurrect legacy approvals after the new user record is erased.
      for (const quality of perfiles) this.storage().removeItem(legacyKey(quality))
    } catch { this.volatile = check; this.persistent = false }
  }
}

export const aprobaciones = new Aprobaciones()
