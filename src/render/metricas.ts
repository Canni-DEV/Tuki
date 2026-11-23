export function percentil(samples: readonly number[], p: number) {
  if (!samples.length) return null
  const sorted = [...samples].sort((a,b)=>a-b)
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
}
export function resumir(samples: readonly number[]) {
  return { samples: samples.length, p50: percentil(samples,.5), p95: percentil(samples,.95), p99: percentil(samples,.99),
    max: samples.length ? Math.max(...samples) : null, over25: samples.filter(x=>x>25).length,
    over50: samples.filter(x=>x>50).length }
}
export function habilitable(samples: readonly number[]) {
  if(samples.some(x=>!Number.isFinite(x)||x<=0))return false
  const stats = resumir(samples)
  return samples.length >= 150 && stats.p95 !== null && stats.p95 <= 20 && stats.p99 !== null && stats.p99 <= 33.3
}
