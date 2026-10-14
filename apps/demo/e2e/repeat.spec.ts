import { expect, test } from '@playwright/test'

import { SAMPLE } from '../src/fakeContext.ts'
import { APP, canvas, clickInto, expression, focusEnd, L, open, toolbar } from './helpers.ts'

test.describe('repeating blocks', () => {
  test('draws a line per item', async ({ page }) => {
    await open(page, 'welcome-letter')
    const block = canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')
    await expect(block.locator('p')).toHaveText([/^– Open house/, /^– Garden workshop/, /^– Winter fair/])
  })

  test('is one unit: the keyboard never edits its template, and a line can be put back beside it', async ({ page }) => {
    await open(page, 'welcome-letter')
    const block = canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')
    const lines = [/^– Open house/, /^– Garden workshop/, /^– Winter fair/]
    await expect(block.locator('p')).toHaveText(lines)
    // Removes the blank line between the block and the signature template.
    await clickInto(page, canvas(page).locator('.ie-repeat + p'))
    await page.keyboard.press('Backspace')
    await expect(canvas(page).locator('.ie-repeat + .ie-embed')).toHaveCount(1)
    // Enter and arrows around the block leave its items alone.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(block.locator('p')).toHaveText(lines)
    // The cursor goes between the block and the template, where typing makes a new line.
    await open(page, 'welcome-letter')
    await expect(block.locator('p')).toHaveText(lines)
    await clickInto(page, canvas(page).locator('.ie-repeat + p'))
    await page.keyboard.press('Backspace')
    await expect(canvas(page).locator('.ie-repeat + .ie-embed')).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('Back again')
    await expect(canvas(page).locator('.ie-repeat + p')).toHaveText('Back again')
    await expect(block.locator('p')).toHaveText(lines)
  })

  test('keeps a table header once and draws a row per item', async ({ page }) => {
    await open(page, 'invoice')
    const rows = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"] tr')
    await expect(rows).toHaveCount(5)
    await expect(rows.first()).toHaveText('DescriptionQuantityAmount')
    await expect(rows.nth(1)).toContainText('Annual membership')
  })

  test('shows its template with expressions on demand, and a block with nothing to list', async ({ page }) => {
    await open(page, 'welcome-letter')
    await page.getByRole('checkbox', { name: L.showExpressions }).check()
    await expect(canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')).toHaveText(`– ${expression('event.title')} (${expression('event.date')})`)
    await open(page, 'problems')
    await expect(canvas(page).locator('.ie-repeat[data-repeat="waitlist.entries"] p')).toHaveText([APP.waitlistHeader, L.repeatEmpty])
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

test('draws a table footer row once, after the items', async ({ page }) => {
  await open(page, 'invoice')
  const rows = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"] tr')
  await expect(rows).toHaveCount(5)
  await expect(rows.last()).toContainText(SAMPLE.invoiceTotal)
})

test('shows the header of an empty list with its empty line', async ({ page }) => {
  await open(page, 'problems')
  const block = canvas(page).locator('.ie-repeat[data-repeat="waitlist.entries"]')
  await expect(block.locator('p')).toHaveText([APP.waitlistHeader, L.repeatEmpty])
})

test('fills a nested block from its item and the enclosing item', async ({ page }) => {
  await open(page, 'programme')
  const block = canvas(page).locator('.ie-repeat[data-repeat="programme.days"]')
  await expect(block.locator('h2').first()).toHaveText(SAMPLE.firstDay)
  await expect(block).toContainText(SAMPLE.firstSessionLine)
  await expect(block).toContainText(SAMPLE.firstDayNote)
})
