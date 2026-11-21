import { test as base } from '@playwright/test'
import { sembrarPreferencias, progresoGuardado } from '../preferencias'
export * from '@playwright/test'
declare global {
  interface Window { tukiPrueba: { sembrar: typeof sembrarPreferencias; progreso: typeof progresoGuardado } }
}
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript({ content: `window.tukiPrueba = { sembrar: ${sembrarPreferencias.toString()}, progreso: ${progresoGuardado.toString()} }` })
    await use(page)
  },
})
