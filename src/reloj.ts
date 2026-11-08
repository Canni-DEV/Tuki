// Keep the fixed physics timestep even when drawing a frame is slow. Bound synchronous work,
// not rendered frames, and retain unfinished time so no simulation steps are skipped.
export function consumirTiempo(
  acumulado: number,
  paso: number,
  avanzar: () => boolean,
  reloj: () => number = () => performance.now(),
): number {
  const inicio = reloj()
  for (let i = 0; i < 240 && acumulado >= paso; i++) {
    const continuar = avanzar()
    acumulado -= paso
    if (!continuar || reloj() - inicio >= 12) break
  }
  return acumulado
}
