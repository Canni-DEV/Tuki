import { piezas, type TipoColocable, type IdNivel } from './types'

export function permiteTipo(t: TipoColocable, completados: IdNivel[]) {
  if (t === 'palanca' || t === 'boton') return ['puerta', 'puente', 'taza-llave'].some(id => completados.includes(id as IdNivel))
  return completados.includes(piezas[t][2])
}

export function faltantesDeTipos(tipos: TipoColocable[], secuencias: boolean, completados: IdNivel[]) {
  return [...new Set<IdNivel>([
    ...tipos.filter(t => !permiteTipo(t, completados)).map(t => piezas[t][2]),
    ...(secuencias && !completados.includes('mate') ? ['mate' as const] : []),
  ])]
}
