import { expect, test } from '@playwright/test'

import { APP, canvas, expression, focusEnd, L, open, toolbar } from './helpers.ts'

test.describe('nested templates', () => {
  test('draws an embedded template, and the template it embeds in turn', async ({ page }) => {
    await open(page, 'welcome-letter')
    const signature = canvas(page).locator('.ie-embed[data-template="signature"]')
    await expect(signature.locator('.ie-embed-caption')).toHaveText(L.embeddedTemplate(APP.templateNames.signature!))
    await expect(signature).toContainText('Sam Taylor')
    // The footer is embedded by the signature.
    await expect(signature).toContainText('hello@example.org')
  })

  test('stops a cycle and says so', async ({ page }) => {
    await open(page, 'loop-a')
    const embed = canvas(page).locator('.ie-embed[data-template="loop-b"]')
    await expect(embed).toContainText('Loop B embeds Loop A.')
    await expect(embed).toContainText(expression('template:loop-a'))
    await page.getByRole('button', { name: L.unresolved.chip(1) }).click()
    await expect(page.getByRole('region', { name: L.unresolved.title })).toContainText(L.unresolved.reasons.cycle)
  })

  test('inserts a template from the menu, never the document itself', async ({ page }) => {
    await open(page, 'signature')
    await focusEnd(page)
    await toolbar(page).getByRole('button', { name: L.insertTemplate }).click()
    const menu = page.getByRole('menu', { name: L.insertTemplate })
    await expect(menu.getByRole('menuitem', { name: APP.templateNames.signature, exact: true })).toHaveCount(0)
    await menu.getByRole('menuitem', { name: APP.templateNames.letterhead, exact: true }).click()
    await expect(canvas(page).locator('.ie-embed[data-template="letterhead"]')).toContainText('Riverside Community Centre')
  })
})
