import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'

const base = '/Tuki/'
await build({ base })

// Let the OS bind the port before handing the URL to Playwright.
const server = await preview({ base, preview: { host: '127.0.0.1', port: 0, open: false } })
try {
  const { port } = server.httpServer.address()
  const url = `http://127.0.0.1:${port}${base}`
  console.log(`Playwright · ${url}`)
  const cli = fileURLToPath(import.meta.resolve('@playwright/test/cli'))
  const tests = spawn(process.execPath, [cli, 'test', '--project=chromium', '--project=firefox'], {
    env: { ...process.env, TUKI_BASE_URL: url },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const [code] = await once(tests, 'exit')
  process.exitCode = code ?? 1
} finally {
  await server.close()
}
