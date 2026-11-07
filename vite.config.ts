import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: { target: 'es2022' },
  test: { include: ['qa/**/*.test.ts'], testTimeout: 30000 },
})
