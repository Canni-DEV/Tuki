import { defineConfig } from 'vitest/config'
import { claveApariencia } from './src/claves'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute=promisify(execFile)
let root=process.cwd()
const photoBuild=()=>execute(process.execPath,['render/build.mjs'],{cwd:root,windowsHide:true})

export default defineConfig({
  plugins: [
    { name: 'apariencia-inicial', transformIndexHtml: html => html.replace('__TUKI_APARIENCIA__', claveApariencia) },
    { name:'fotorealista-aislado',configResolved:config=>{root=config.root},
      async buildStart(){await photoBuild()},
    },
  ],
  build: { target: 'es2022' },
  test: { include: ['qa/**/*.test.ts'], testTimeout: 30000 },
})
