import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'
const baseURL = process.env.TUKI_BASE_URL ?? 'http://127.0.0.1:4174/Tuki/'
const firefoxDeEscritorio = process.platform === 'win32' &&
  existsSync(path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Mozilla Firefox/firefox.exe'))
export default defineConfig({
  testDir: 'qa/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  fullyParallel: false,
  use: {
    baseURL,
    headless: process.env.TUKI_HEADED !== '1',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // SwiftShader on the CI runner took 24 s to settle the cup. The fall itself is checked by simulation step.
      expect: process.env.CI ? { timeout: 60_000 } : undefined,
      use: {
        browserName: 'chromium',
        launchOptions: { args: ['--enable-unsafe-swiftshader'] },
        // Continuous trace screenshots compete with SwiftShader on the CI runner.
        ...(process.env.CI && {
          trace: { mode: 'retain-on-failure', screenshots: false },
          screenshot: 'only-on-failure',
        }),
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        channel: firefoxDeEscritorio ? 'moz-firefox' : undefined,
        launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } },
      },
    },
  ],
  webServer: process.env.TUKI_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --base=/Tuki/ --host 127.0.0.1 --port 4174 --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 45_000,
      },
})
