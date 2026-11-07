import { defineConfig } from '@playwright/test'
const baseURL = process.env.TUKI_BASE_URL ?? 'http://127.0.0.1:4174/Tuki/'
export default defineConfig({
  testDir: 'qa/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
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
      use: { browserName: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
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
