import { defineConfig } from 'vitest/config'
import { claveApariencia } from './src/claves'

export default defineConfig({
  plugins: [{ name: 'apariencia-inicial', transformIndexHtml: html => html.replace('__TUKI_APARIENCIA__', claveApariencia) }],
  build: { target: 'es2022' },
  test: { include: ['qa/**/*.test.ts'], testTimeout: 30000 },
})
