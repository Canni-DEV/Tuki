/** Browser-side fixtures use the release format; no migration path is installed in the app. */
export function sembrarPreferencias(p: Record<string, unknown>) {
  for (const key of Object.keys(localStorage)) if (key.startsWith('tuki.v1.preferencias.') || key.startsWith('tuki.v1.campana.')) localStorage.removeItem(key)
  for (const id of (p.completados ?? []) as string[]) localStorage.setItem('tuki.v1.campana.' + id, 'true')
  for (const key of ['audio', 'movimiento', 'apariencia', 'visuales', 'calidadFotorealista']) if (key in p) localStorage.setItem('tuki.v1.preferencias.' + key, JSON.stringify(p[key]))
  for (const [canal, valor] of Object.entries(p.volumenes ?? {})) localStorage.setItem('tuki.v1.preferencias.volumen.' + canal, JSON.stringify(valor))
  for (const [i, tipo] of ((p.favoritosTaller ?? []) as unknown[]).entries()) localStorage.setItem('tuki.v1.preferencias.favorito.' + i, JSON.stringify(tipo))
}
export function progresoGuardado() {
  return ['recta','curva','libro','taza','vuelta','bajada','subibaja','salto','recepcion','puerta','disparo','puente','espera','saltos','contrapeso','mate','taza-llave','curva-laberinto']
    .filter(id => localStorage.getItem('tuki.v1.campana.' + id) === 'true')
}
