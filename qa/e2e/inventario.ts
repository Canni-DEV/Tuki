import { expect, type Page } from '@playwright/test'

export async function cerrarInventario(page: Page) {
  const cerrar = page.getByRole('button', { name: 'Cerrar inventario', exact: true })
  if (await cerrar.count()) await cerrar.click()
}

/** Reach a piece through the visible shortcut or the searchable catalog. */
export async function piezaInventario(page: Page, tipo: string) {
  const menu = page.getByRole('dialog', { name: 'Piezas disponibles', exact: true })
  if (!await menu.count()) {
    const acceso = page.locator(`#bandeja [data-tool="${tipo}"]`)
    if (await acceso.count()) return acceso
    await page.getByRole('button', { name: 'Piezas', exact: true }).click()
  }
  const buscar = menu.getByRole('searchbox', { name: 'Buscar piezas' })
  if (await buscar.count()) {
    await buscar.fill('')
    await menu.getByLabel('Categoría', { exact: true }).selectOption('')
  }
  const pieza = menu.locator(`[data-tool="${tipo}"]`)
  await expect(pieza).toHaveCount(1)
  return pieza
}
