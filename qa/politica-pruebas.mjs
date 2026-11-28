// The plan is additive: a file can require several groups. Unknown paths widen it.
const unit = names => names.map(n => `qa/${n}.test.ts`)
const browser = names => names.map(n => `qa/e2e/${n}.spec.ts`)
const motor = new Set(['simulation', 'contactos', 'types', 'shapes', 'geometry', 'construccion', 'escenarios', 'levels', 'mesas', 'equilibrio', 'equilibrio.worker', 'dispositivos-simulacion', 'dispositivos', 'formas-dispositivos', 'polea', 'runtime'])
const normalizacion = unit(['normalizacion', 'normalizacion-2', 'normalizacion-3', 'normalizacion-4'])
const niveles = {
  recta: ['recta'], curva: ['s'], libro: ['rampa'], taza: ['taza-fichas', 'taza-mixta'],
  'taza-llave': ['llave-abierta', 'bola-temprana'], 'curva-laberinto': ['laberinto'],
  vuelta: ['vuelta'], bajada: ['bajada'], subibaja: ['subibaja'], salto: ['salto'],
  recepcion: ['recepcion'], puerta: ['puerta'], disparo: ['disparo'], puente: ['puente'],
  espera: ['espera'], saltos: ['saltos'], contrapeso: ['contrapeso'], mate: ['mate'],
}
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const omitirGPU = 'rendimiento real|Calidad con GPU real'

export function crearPlan(rutas) {
  const p = { archivos: [...new Set(rutas)].sort(), categorias: [], tipos: false, tiposRender: false,
    modelos: false, politica: false, compilar: false, unitariasTodas: false, navegadorTodos: false,
    unitarias: [], navegador: [], proyectos: ['chromium'] }
  const categorias = new Set(), u = new Set(), b = new Set(), gruposU = [], gruposB = [], nivelesAgregados = new Set()
  const agregar = (categoria, unidades = [], navegadores = [], ambos = false) => {
    categorias.add(categoria); unidades.forEach(f => u.add(f)); navegadores.forEach(f => b.add(f))
    p.tipos = true
    if (ambos) p.proyectos = ['chromium', 'firefox']
  }
  const amplia = () => {
    agregar('transversal o sin clasificación', [], [], true)
    p.unitariasTodas = p.navegadorTodos = p.modelos = p.tiposRender = p.politica = p.compilar = true
  }
  const nivel = id => {
    const referencias = niveles[id]
    if (!referencias) return amplia()
    if (nivelesAgregados.has(id)) return
    nivelesAgregados.add(id)
    agregar('nivel: ' + id, [], [], true)
    // Each normalization case includes alternative, empty board, missing essential
    // piece, ten repetitions, slow mode and all 24 perturbations, without reducing them.
    gruposU.push({ archivos: normalizacion, filtro: `^(${referencias.map(escape).join('|')}) ` })
    if (['salto', 'recepcion', 'disparo', 'espera', 'saltos', 'contrapeso'].includes(id)) {
      u.add('qa/campana-dispositivos.test.ts') // Includes cross-level invariants/failure repairs.
      gruposB.push({ archivos: browser(['dispositivos']), filtro: `^${id}:` })
    } else if (id === 'curva-laberinto') {
      u.add('qa/laberinto.test.ts'); b.add('qa/e2e/laberinto.spec.ts')
    } else {
      // These files contain loops and scenarios whose titles don't carry a level ID.
      unit(['montajes', 'traza-montaje']).forEach(f => u.add(f))
      const filtro = { subibaja: 'El subibaja', puente: 'puente', vuelta: 'vuelta', puerta: 'la puerta instalada' }[id]
      if (filtro) gruposB.push({ archivos: browser(['juego']), filtro })
      else b.add('qa/e2e/juego.spec.ts')
    }
    if (id === 'disparo') { u.add('qa/disparo.test.ts'); b.add('qa/e2e/disparo.spec.ts') }
    if (id === 'subibaja') { u.add('qa/causalidad-balancin.test.ts'); b.add('qa/e2e/causalidad.spec.ts') }
  }
  for (const f of p.archivos) {
    if (/^(docs\/|qa\/soluciones\/)|\.md$/.test(f) || /^\.codex\/agents\/[^/]+\.toml$/.test(f)) {
      categorias.add('documentación e instrucciones'); continue
    }
    if (/^qa\/[^/]+\.test\.mjs$/.test(f) || /^qa\/(politica-pruebas|verificar-cambios|pre-push|revision-local|verificar-local|publicar|certificado-publicacion|informes|huellas)\.mjs$/.test(f) || f === '.githooks/pre-push' || f === '.github/workflows/pages.yml' || f === '.gitignore') {
      categorias.add('herramientas de QA'); p.politica = true; continue
    }
    if (/^qa\/[^/]+\.test\.ts$/.test(f)) { agregar('prueba unitaria', [f]); continue }
    if (/^qa\/e2e\/[^/]+\.spec\.ts$/.test(f)) { agregar('prueba de navegador', [], [f], true); continue }
    if (/^src\/data\/.*\.json$/.test(f) && !f.endsWith('/portada.json')) {
      nivel(f.split('/').at(-1).slice(0, -5)); continue
    }
    if (/^qa\/fixtures\/.*\.json$/.test(f)) {
      const nombre = f.split('/').at(-1).slice(0, -5)
      const id = Object.keys(niveles).find(k => niveles[k].some(r => nombre === r || nombre.startsWith(r + '-')))
      nivel(id); continue
    }
    const modulo = /^src\/(.+)\.ts$/.exec(f)?.[1]
    if (motor.has(modulo)) {
      agregar('motor: física completa', [], browser(['causalidad', 'prueba-edicion']), true)
      p.unitariasTodas = true
      if (/dispositivos|polea/.test(modulo)) browser(['dispositivos', 'secuencias']).forEach(x => b.add(x))
      continue
    }
    if (/^(editor|trazado|superficies-trazo|espacio|inventario|catalogo-inventario|configuracion-editor|cables|taller|validacion-taller)$/.test(modulo)) {
      agregar('editor', unit(['editor', 'colocacion', 'trazado', 'entrada-trazo', 'historial', 'taller', 'cables', 'apoyos-compartidos']), browser(['taller-controles', 'prueba-edicion']))
      if (/traz|espacio/.test(modulo)) b.add('qa/e2e/trazado.spec.ts')
      if (modulo === 'cables') b.add('qa/e2e/cables.spec.ts')
      if (modulo === 'configuracion-editor') browser(['dispositivos', 'secuencias']).forEach(x => b.add(x))
      continue
    }
    if (/^(almacen|guardado.*|estado-guardado|claves|progreso|desbloqueos|sellos|favoritos|descargas|biblioteca.*|vista-biblioteca|desafios.*|certificacion|ui-desafios)$/.test(modulo)) {
      agregar('persistencia y progreso', unit(['guardado', 'favoritos', 'desafios', 'validacion-worker']), browser(['persistencia', 'recuperacion', 'desafios', 'causalidad']), true); continue
    }
    if (/^(audio|musica|victoria)$/.test(modulo) || /^public\/audio\//.test(f)) {
      agregar('audio y victoria', [], browser(['audio', 'victoria', 'causalidad']), true); continue
    }
    if (/^(camara|gestos-camara)$/.test(modulo)) {
      agregar('cámara', unit(['camara']), browser(['camara', 'controles-tactiles'])); continue
    }
    if (modulo === 'main' || modulo === 'revision') {
      agregar('integración del juego', [], browser(['causalidad', 'prueba-edicion', 'navegacion']), true)
      p.unitariasTodas = true; continue
    }
    if (modulo === 'reloj' || modulo === 'presentacion') {
      agregar('reloj y presentación', unit(['reloj']), browser(['prueba-edicion', 'audio', 'victoria']), true); continue
    }
    if (/^(ui|fondo|portada|scene|scene-debug|modelos|render\/.*)$/.test(modulo) || f === 'src/style.css' || f === 'index.html' || /^render\//.test(f) || /^public\//.test(f) || f === 'src/data/portada.json') {
      agregar('interfaz y render', unit(['camara', 'fondo', 'portada', 'render', 'render-inicio', 'aprobacion', 'nogal', 'render-puntos']), browser(['apariencia', 'navegacion', 'visuales']))
      p.tiposRender = true
      if (/^public\/(models|modelos)\//.test(f)) p.modelos = true
      continue
    }
    if (f === 'package.json') {
      // Scripts can affect any entry point. Locks/config changes below widen further.
      agregar('comandos del proyecto', [], browser(['causalidad', 'prueba-edicion']), true)
      p.politica = p.unitariasTodas = p.tiposRender = p.compilar = true; continue
    }
    amplia()
  }
  p.categorias = [...categorias].sort()
  const consolidar = (enteros, grupos) => {
    const filtrados = new Map()
    for (const grupo of grupos) {
      const archivos = grupo.archivos.filter(f => !enteros.has(f)).sort()
      if (!archivos.length) continue
      const key = archivos.join('\0')
      if (!filtrados.has(key)) filtrados.set(key, { archivos, filtros: new Set() })
      filtrados.get(key).filtros.add(grupo.filtro)
    }
    return [...(enteros.size ? [{ archivos: [...enteros].sort() }] : []),
      ...[...filtrados.values()].map(g => ({ archivos: g.archivos, filtro: [...g.filtros].sort().join('|') }))]
  }
  p.unitarias = p.unitariasTodas ? [] : consolidar(u, gruposU)
  p.navegador = p.navegadorTodos ? [] : consolidar(b, gruposB)
  if (p.navegadorTodos || p.navegador.length) p.compilar = true
  return p
}

export function leerEnvio(texto) {
  return texto.trim().split('\n').filter(Boolean).map(linea => {
    const [local, sha, remoto, anterior, ...extra] = linea.trim().split(/\s+/)
    if (extra.length || !local || !remoto || !/^[a-f0-9]{40,64}$/.test(sha ?? '') || !/^[a-f0-9]{40,64}$/.test(anterior ?? '')) throw new Error('Entrada pre-push inválida.')
    return { local, sha, remoto, anterior, borrar: /^0+$/.test(sha),
      completa: /^refs\/tags\//.test(remoto) || /^refs\/heads\/(main|master|release(?:\/.*)?)$/.test(remoto) }
  })
}
