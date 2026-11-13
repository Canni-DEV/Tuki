import { test as base } from '@playwright/test'

// Install before navigation. Keep the game clock running through loading, then let
// the test hold the simulation in play while real pointer input and Web Audio run.
export const test = base.extend<{ pausarPartida: () => Promise<void> }>({
  pausarPartida: async ({ page }, use) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await use(() => page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')))
  },
})
