import { expect, test, type Page } from '@playwright/test'

import { APP, canvas, clickInto, L, open } from './helpers.ts'

const IE = L.inlineEditing
const signatureName = APP.templateNames.signature!
const repeatArea = (page: Page, source: string) => page.getByRole('group', { name: IE.editRepeat(APP.sources[source]!) })
const templateArea = (page: Page) => page.getByRole('group', { name: IE.editTemplate(signatureName) })
const signature = (page: Page) => canvas(page).locator('.ie-embed[data-template="signature"]')

test.describe('editing blocks in place', () => {
  test('edits the invoice table’s item row by keyboard only', async ({ page }) => {
    await open(page, 'invoice')
    const block = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"]')
    await expect(block.locator('tr')).toHaveCount(5)
    // The empty line above the block; the right arrow selects the block whole, Enter opens it.
    await clickInto(page, canvas(page).locator('.ie-repeat').locator('xpath=preceding-sibling::p[1]'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const area = repeatArea(page, 'invoice.lines')
    await expect(area).toBeVisible()
    await expect(area.getByRole('textbox')).toBeFocused()
    // From the header row's first cell to the item row's first cell.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
    await page.keyboard.press('End')
    await page.keyboard.type(' (paid)')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(area).toHaveCount(0)
    await expect(block.locator('tr')).toHaveCount(5)
    for (const index of [1, 2, 3]) await expect(block.locator('tr').nth(index).locator('td').first()).toHaveText(/ \(paid\)$/)
  })

  test('adds a footer to the welcome letter’s events block', async ({ page }) => {
    await open(page, 'welcome-letter')
    const block = canvas(page).locator('.ie-repeat[data-repeat="events.upcoming"]')
    await expect(block.locator('p')).toHaveCount(3)
    await block.dblclick()
    const area = repeatArea(page, 'events.upcoming')
    await expect(area.getByRole('group', { name: IE.header })).toBeVisible()
    await area.getByRole('group', { name: IE.footer }).locator('p').click()
    await page.keyboard.type('See you there!')
    await area.getByRole('button', { name: IE.done }).click()
    await expect(area).toHaveCount(0)
    await expect(block.locator('p').last()).toHaveText('See you there!')
    await expect(block.locator('p')).toHaveCount(4)
  })

  test('edits the signature and makes a copy for the document', async ({ page }) => {
    await open(page, 'welcome-letter')
    await expect(signature(page)).toContainText('Kind regards,')
    await signature(page).dblclick()
    const area = templateArea(page)
    await area.getByRole('textbox').getByText('Kind regards,').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' and see you soon')
    await area.getByRole('button', { name: IE.done }).click()
    await area.getByRole('group', { name: IE.question }).getByRole('button', { name: IE.makeCopy }).click()
    await expect(signature(page)).toHaveCount(0)
    await expect(canvas(page)).toContainText('Kind regards, and see you soon')
  })

  test('updates the shared signature: another document embedding it shows the change', async ({ page }) => {
    await open(page, 'welcome-letter')
    await expect(signature(page)).toContainText('Kind regards,')
    await signature(page).dblclick()
    const area = templateArea(page)
    await area.getByRole('textbox').getByText('Kind regards,').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' from all of us')
    await area.getByRole('button', { name: IE.done }).click()
    await area.getByRole('button', { name: IE.updateShared }).click()
    await expect(area).toHaveCount(0)
    await expect(signature(page)).toContainText('Kind regards, from all of us')
    // Within the same session (no reload): the programme embeds the signature too.
    await page.getByRole('navigation', { name: APP.templates }).getByRole('link', { name: APP.templateNames.programme }).click()
    await expect(signature(page)).toContainText('Kind regards, from all of us')
  })
})
