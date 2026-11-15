import { configuracion, configuracionValida } from './dispositivos'
import { compilarEscenario, validarConstruccion } from './construccion'
import { Editor } from './editor'
import { initPhysics, Simulation } from './simulation'
import { leerMesa, mesaNueva, type DocumentoMesa } from './taller'
import { esMando, esReceptor, formatosMesa, inventario, limitePiezasTaller, perfil, secuenciasValidas, tipos,
  type Armado, type Conexion, type ConexionInstalada, type FormatoMesa, type Nivel, type PiezaColocada, type Saldo, type Secuencia } from './types'

export const versionCatalogo = 'escenario-1'
export const limiteArchivo = 4 * 1024 * 1024
export interface DocumentoDesafio {
  tipo: 'desafio'
  version: 1
  id: string
  revision: number
  estado: 'borrador' | 'certificado'
  nombre: string
  motivo: string
  formatoMesa: FormatoMesa
  perfilFisico: string
  catalogo: string
  ordenFisico: 'id' | 'geometria'
  empujon: Nivel['empujon']
  camara?: Nivel['camara']
  instalados: PiezaColocada[]
  inventario: Saldo
  permiteCableado: boolean
  conexionesInstaladas: ConexionInstalada[]
  secuencias: Secuencia[]
  solucion: { piezas: PiezaColocada[]; conexiones: Conexion[] }
  certificacion?: { huella: string; pasos: number; repeticiones: 3; catalogo: string; perfilFisico: string }
}

const fallar = (mensaje: string): never => { throw new Error(mensaje) }
const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)
const identificador = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id)

export function leerDesafio(data: unknown): DocumentoDesafio {
  const d = data as DocumentoDesafio
  if (!d || d.tipo !== 'desafio' || d.version !== 1 || !identificador(d.id) ||
      !Number.isSafeInteger(d.revision) || d.revision < 1 || !['borrador', 'certificado'].includes(d.estado) ||
      typeof d.nombre !== 'string' || !d.nombre.trim() || d.nombre.length > 80 ||
      typeof d.motivo !== 'string' || d.motivo.length > 240 || !Object.hasOwn(formatosMesa, d.formatoMesa) ||
      d.perfilFisico !== perfil.id || d.catalogo !== versionCatalogo || !['id', 'geometria'].includes(d.ordenFisico) ||
      typeof d.permiteCableado !== 'boolean') fallar('Archivo de desafío inválido o de otra versión física.')
  if (!d.empujon || d.empujon.pieza !== 'inicio' || JSON.stringify(d.empujon.puntoLocal) !== '[0,0.04,0]' ||
      !['[0,0,0.003]', '[0,0,0.0045]'].includes(JSON.stringify(d.empujon.impulsoLocal))) fallar('Empujón inicial inválido.')
  if (d.camara && (!vector(d.camara.objetivo) || ![d.camara.azimut,d.camara.elevacion,d.camara.altoVisible].every(Number.isFinite) || d.camara.altoVisible <= 0)) fallar('Encuadre inválido.')
  if (!Array.isArray(d.instalados) || !d.solucion || !Array.isArray(d.solucion.piezas) ||
      d.instalados.length + d.solucion.piezas.length > limitePiezasTaller || !d.inventario || typeof d.inventario !== 'object' || Array.isArray(d.inventario)) fallar('Objetos o inventario inválidos.')
  if (Object.entries(d.inventario).some(([t, n]) => !tipos.includes(t as keyof Saldo) || !Number.isSafeInteger(n) || n < 0 || n > limitePiezasTaller)) fallar('Cantidades de inventario inválidas.')
  const saldo = inventario(d.inventario)
  if (saldo.inicio || saldo.meta || d.instalados.length + Object.values(saldo).reduce((a,b) => a+b,0) > limitePiezasTaller) fallar('El escenario y su inventario superan los 200 objetos o repiten extremos.')
  const ids = new Set(['mesa', 'tablero'])
  const todas = [...d.instalados, ...d.solucion.piezas]
  for (const p of todas) {
    if (!p || !identificador(p.id) || ids.has(p.id) || !tipos.includes(p.tipo) || !vector(p.posicion) ||
        !Number.isFinite(p.giroY) || typeof p.apoyo !== 'string' || !configuracionValida(p.tipo,p.configuracion) ||
        (p.apoyos !== undefined && (!Array.isArray(p.apoyos) || !p.apoyos.length || p.apoyos.some(a=>typeof a!=='string') || !p.apoyos.includes(p.apoyo))) ||
        Object.hasOwn(p, 'escala')) fallar('Pieza inválida en el desafío.')
    for (const rol of ['inicio', 'meta']) if ((p.id === rol) !== (p.tipo === rol)) fallar('Identificador de extremo inválido.')
    ids.add(p.id)
  }
  for (const p of d.solucion.piezas) if (--saldo[p.tipo] < 0) fallar('La solución necesita más piezas que las ofrecidas.')
  const instalados = new Set(d.instalados.map(p => p.id))
  if (!Array.isArray(d.conexionesInstaladas) || !Array.isArray(d.solucion.conexiones) || !Array.isArray(d.secuencias) ||
      d.conexionesInstaladas.length + d.solucion.conexiones.length > 10000 || d.secuencias.length > 200) fallar('Circuito inválido.')
  const pares = new Set<string>()
  const comprobarCable = (c: Conexion, fijo: boolean) => {
    const a = todas.find(p => p.id === c?.mando), b = todas.find(p => p.id === c?.receptor)
    if (!a || !b || !esMando(a.tipo) || !esReceptor(b.tipo) || pares.has(c.mando + '/' + c.receptor) ||
        (fijo && (!instalados.has(c.mando) || !instalados.has(c.receptor)))) fallar('Conexión inválida o duplicada.')
    const cfg = configuracion(b!)
    if (cfg && 'modo' in cfg && cfg.modo !== 'cable') fallar('El receptor debe activarse por cable.')
    pares.add(c.mando + '/' + c.receptor)
  }
  for (const c of d.conexionesInstaladas) {
    comprobarCable(c, true)
    if (!Array.isArray(c.guias) || c.guias.length > 200 || c.guias.some(g => !g || !vector(g.local) || (g.objeto !== 'mesa' && !instalados.has(g.objeto)))) fallar('Guías de cable inválidas.')
  }
  for (const c of d.solucion.conexiones) comprobarCable(c, false)
  if (!d.permiteCableado && d.solucion.conexiones.length) fallar('Este desafío no permite cablear.')
  for (const s of d.secuencias) if (!s || !Array.isArray(s.mandos) || !instalados.has(s.receptor) || s.mandos.some(m => !instalados.has(m))) fallar('Las secuencias deben pertenecer a dispositivos instalados.')
  if (!secuenciasValidas(d.secuencias, [...d.conexionesInstaladas, ...d.solucion.conexiones])) fallar('Secuencia inválida.')
  return structuredClone({ ...d, nombre: d.nombre.trim(), motivo: d.motivo.trim(), inventario: inventario(d.inventario) })
}

export function nivelDesafio(d: DocumentoDesafio): Nivel {
  const n = compilarEscenario(d.nombre, d.formatoMesa, d.instalados, d.conexionesInstaladas, d.secuencias)
  return { ...n, identidad: d.id, revision: d.revision, motivo: d.motivo, permiteCableado: d.permiteCableado,
    inventario: { ...d.inventario }, ordenFisico: d.ordenFisico, empujon: structuredClone(d.empujon),
    camara: d.camara ?? n.camara }
}

export function armadoSolucion(d: DocumentoDesafio): Armado {
  const saldo = { ...d.inventario }
  for (const p of d.solucion.piezas) saldo[p.tipo]--
  return { version: 5, nivel: 'taller', revision: d.revision, perfilFisico: d.perfilFisico,
    piezas: structuredClone(d.solucion.piezas), conexiones: structuredClone(d.solucion.conexiones), saldo }
}

function canonico(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonico)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonico(v)]))
  return value
}
export async function huellaDesafio(d: DocumentoDesafio): Promise<string> {
  const { nombre, motivo, estado, certificacion, ...contenido } = d
  const bytes = new TextEncoder().encode(JSON.stringify(canonico(contenido)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')
}

export async function certificarDesafio(data: unknown, progreso: (texto: string)=>void = ()=>{}): Promise<DocumentoDesafio> {
  const d = leerDesafio(data)
  if (!d.motivo) fallar('Escribí el motivo del desafío.')
  for (const rol of ['inicio','meta']) if (d.instalados.filter(p=>p.tipo===rol).length !== 1) fallar('Instalá un inicio y una meta.')
  if (!d.solucion.piezas.length && !d.solucion.conexiones.length) fallar('La solución debe completar el escenario o su cableado.')
  await initPhysics()
  progreso('Comprobando objetos y apoyos…')
  validarConstruccion(d.instalados, d.formatoMesa)
  const completa: DocumentoMesa = { ...mesaNueva(d.nombre,d.formatoMesa), piezas: [...d.instalados,...d.solucion.piezas],
    conexiones: [...d.conexionesInstaladas,...d.solucion.conexiones], secuencias: d.secuencias }
  leerMesa(completa)
  const n = nivelDesafio(d), referencia = armadoSolucion(d), editor = new Editor(n)
  editor.cargar(referencia)
  const ejecutar = (a: Armado) => {
    const sim = new Simulation(n,a)
    try {
      const eventos = []
      while (!sim.result && sim.tick < 36000) eventos.push(...sim.step())
      if (!sim.result) fallar('La prueba superó 300 segundos de simulación. Revisá el recorrido.')
      return { resultado: sim.result, pasos: sim.tick, registro: JSON.stringify([eventos,[...sim.poses()]]) }
    } finally { sim.dispose() }
  }
  progreso('Probando la instalación sin solución…')
  const vacio: Armado = { ...referencia, piezas: [], conexiones: [], saldo: { ...d.inventario } }
  if (ejecutar(vacio).resultado === 'victoria') fallar('La instalación ya gana sola. Dejá algo por completar.')
  let pasos = 0, registro = ''
  for (let intento = 0; intento < 3; intento++) {
    progreso('Verificando solución ' + (intento+1) + ' de 3…')
    const r = ejecutar(referencia)
    if (r.resultado !== 'victoria') fallar('La solución no alcanza la meta. Volvé a probarla.')
    if (intento && (pasos !== r.pasos || registro !== r.registro)) fallar('La solución no se reproduce de forma estable.')
    pasos = r.pasos
    registro = r.registro
  }
  return { ...d, estado: 'certificado', certificacion: { huella: await huellaDesafio(d), pasos, repeticiones: 3,
    catalogo: versionCatalogo, perfilFisico: perfil.id } }
}

export function desafioDesdeMesa(m: DocumentoMesa): DocumentoDesafio {
  const instalados = m.piezas.filter(p=>p.tipo==='inicio'||p.tipo==='meta'||!['domino','bolita','rampa','embudo','canal','curva90','pendulo','balancin','taco','placa','lanzador','retenedor','elevador','palanca','boton','compuerta','puerta','puente'].includes(p.tipo))
  // Existing cables are installed by default, along with their endpoints and supports.
  const fijos = new Set(instalados.map(p=>p.id))
  for (const c of m.conexiones ?? []) { fijos.add(c.mando); fijos.add(c.receptor) }
  for (let anterior = -1; anterior !== fijos.size;) {
    anterior = fijos.size
    for (const p of m.piezas) if (fijos.has(p.id)) for (const apoyo of p.apoyos ?? [p.apoyo]) if (apoyo !== 'tablero') fijos.add(apoyo.split('/')[0])
  }
  const solucion = m.piezas.filter(p=>!fijos.has(p.id)), saldo = inventario()
  for (const p of solucion) saldo[p.tipo]++
  return { tipo: 'desafio', version: 1, id: crypto.randomUUID(), revision: 1, estado: 'borrador', nombre: m.nombre,
    motivo: '', formatoMesa: m.formatoMesa ?? 'clasica', perfilFisico: perfil.id, catalogo: versionCatalogo,
    ordenFisico: m.ordenFisico ?? 'id', empujon: m.empujon ?? { pieza:'inicio',impulsoLocal:[0,0,.003],puntoLocal:[0,.04,0] },
    instalados: structuredClone(m.piezas.filter(p=>fijos.has(p.id))), inventario: saldo, permiteCableado: false,
    conexionesInstaladas: (m.conexiones ?? []).map(c=>({...c,guias:[]})), secuencias: structuredClone(m.secuencias ?? []),
    solucion: { piezas: structuredClone(solucion), conexiones: [] } }
}

export function mesaDeAutor(d: DocumentoDesafio): DocumentoMesa {
  return { ...mesaNueva(d.nombre,d.formatoMesa), ordenFisico: d.ordenFisico, empujon: structuredClone(d.empujon),
    piezas: structuredClone([...d.instalados,...d.solucion.piezas]), conexiones: structuredClone([...d.conexionesInstaladas,...d.solucion.conexiones]), secuencias: structuredClone(d.secuencias) }
}

export function actualizarSolucion(d: DocumentoDesafio, mesa: DocumentoMesa): DocumentoDesafio {
  const fijos = new Set(d.instalados.map(p=>p.id)), instalado = new Set(d.conexionesInstaladas.map(c=>c.mando+'/'+c.receptor))
  const piezas = mesa.piezas.filter(p=>!fijos.has(p.id)), saldo = { ...d.inventario }
  for (const t of tipos) saldo[t] = Math.max(saldo[t], piezas.filter(p=>p.tipo===t).length)
  return { ...d, revision: d.revision + 1, estado:'borrador', certificacion:undefined, nombre:mesa.nombre,
    formatoMesa:mesa.formatoMesa ?? 'clasica', empujon:mesa.empujon ?? d.empujon,
    instalados:structuredClone(mesa.piezas.filter(p=>fijos.has(p.id))), inventario:saldo,
    conexionesInstaladas:d.conexionesInstaladas.filter(c=>mesa.conexiones?.some(x=>x.mando===c.mando&&x.receptor===c.receptor)),
    secuencias:structuredClone(mesa.secuencias ?? []),
    solucion:{piezas:structuredClone(piezas),conexiones:structuredClone((mesa.conexiones ?? []).filter(c=>!instalado.has(c.mando+'/'+c.receptor)))} }
}
