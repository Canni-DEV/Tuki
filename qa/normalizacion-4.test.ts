import { registrarNormalizacion } from './matriz-normalizacion'
import { referencias } from './normalizacion'

registrarNormalizacion(referencias.filter((_, i) => i % 4 === 3))
