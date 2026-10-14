import { expect, test } from '@playwright/test'

import { APP, canvas, expression, focusEnd, L, open, toolbar } from './helpers.ts'

test.describe('repeating blocks', () => {
  test('draws a line per item', async ({ page }) => {
    await open(page, 'welcome-letter')
    const block = canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')
    await expect(block.locator('p')).toHaveText([/^– Open house/, /^– Garden workshop/, /^– Winter fair/])
  })

  test('keeps a table header once and draws a row per item', async ({ page }) => {
    await open(page, 'invoice')
    const rows = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"] tr')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toHaveText('DescriptionQuantityAmount')
    await expect(rows.nth(1)).toContainText('Annual membership')
  })

  test('shows its template with expressions on demand, and a block with nothing to list', async ({ page }) => {
    await open(page, 'welcome-letter')
    await page.getByRole('checkbox', { name: L.showExpressions }).check()
    await expect(canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')).toHaveText(`– ${expression('event.title')} (${expression('event.date')})`)
    await open(page, 'problems')
    await expect(canvas(page).locator('.ie-repeat[data-repeat="waitlist.entries"]')).toHaveText(L.repeatEmpty)
  })

  test('inserts a block from the menu, drawn for its items', async ({ page }) => {
    await open(page, 'blank')
    await focusEnd(page)
    await toolbar(page).getByRole('button', { name: L.insertBlock }).click()
    await page.getByRole('menuitem', { name: APP.sources['invoice.lines'] }).click()
    const rows = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"] tr')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toHaveText(`${APP.fields['line.description']}${APP.fields['line.quantity']}${APP.fields['line.amount']}`)
  })
})
