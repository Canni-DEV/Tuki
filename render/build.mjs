import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { bake } from './recursos.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(new URL('../public/fotorealista/runtime/', import.meta.url), { recursive: true })
const result = await build({ absWorkingDir: root, entryPoints: ['render/fotorealista/src/index.ts'],
  outfile: 'public/fotorealista/runtime/index.js', bundle: true, format: 'esm', target: 'es2022',
  // Verification checkouts share installed packages via junctions. Keep logical paths
  // in the manifest so copying a checkout does not change the build fingerprint.
  preserveSymlinks: true, minify: true, sourcemap: false, metafile: true })
const inputs = Object.keys(result.metafile.inputs)
if (inputs.some(p => p.startsWith('node_modules/three/'))) throw new Error('El módulo aislado incluyó Three.js r180.')
await writeFile(new URL('../public/fotorealista/runtime/build.json', import.meta.url), JSON.stringify({ revision: '187', inputs, outputs: result.metafile.outputs }, null, 2))
await bake()
console.log('Render fotorealista r187 y recursos preparados.')
