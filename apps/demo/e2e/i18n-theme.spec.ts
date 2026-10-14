import { expect, test } from '@playwright/test'

import { LABEL_SETS } from '../src/labels/index.ts'
import { APP, canvas, open } from './helpers.ts'

const FR = LABEL_SETS.fr

test.describe('labels and theme from the host', () => {
  test('switches the editor to the host’s French labels and values', async ({ page }) => {
    await open(page, 'problems')
    await page.getByRole('combobox', { name: APP.language }).selectOption('fr')
    await expect(page.getByRole('toolbar', { name: FR.editor.toolbar! })).toBeVisible()
    await expect(page.getByRole('button', { name: FR.editor.bold!, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: FR.editor.unresolved!.chip!(6) })).toBeVisible()
    await expect(page).toHaveURL(/lang=fr/)
    await page.reload()
    await expect(page.getByRole('toolbar', { name: FR.editor.toolbar! })).toBeVisible()
  })

  test('formats provider values in the chosen language', async ({ page }) => {
    await open(page, 'welcome-letter', '&lang=fr')
    await expect(page.getByRole('textbox', { name: FR.editor.canvas! })).toContainText('mensuelle')
  })

  test('applies the dark theme to the editor through its variables', async ({ page }) => {
    await open(page, 'blank')
    await page.getByRole('combobox', { name: APP.theme }).selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const surface = await page.locator('.ie-editor').evaluate((el) => getComputedStyle(el).getPropertyValue('--ie-surface').trim())
    expect(surface).toBe('#1d1f24')
    await expect(canvas(page)).toBeVisible()
  })
})
