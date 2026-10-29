import { expect, test } from '@playwright/test'

import { demoDate } from '../src/fakeContext.ts'
import { APP, canvas, focusEnd, L, open, toolbar } from './helpers.ts'

test.describe('toolbar accessibility', () => {
  test('names every control and groups the alignment buttons', async ({ page }) => {
    await open(page, 'blank')
    for (const name of [L.undo, L.redo, L.bold, L.italic, L.underline, L.insertTable, L.tableMenu, L.insertField, L.insertBlock, L.insertTemplate, L.insertImage]) {
      await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeVisible()
    }
    const alignment = toolbar(page).getByRole('group', { name: L.alignment })
    await expect(alignment.getByRole('button')).toHaveCount(4)
    await expect(toolbar(page).getByRole('combobox', { name: L.font })).toBeVisible()
    await expect(toolbar(page).getByRole('combobox', { name: L.size })).toBeVisible()
  })

  test('opens a menu, moves through it and inserts with the keyboard only', async ({ page }) => {
    await open(page, 'blank')
    await focusEnd(page)
    const trigger = toolbar(page).getByRole('button', { name: L.insertField })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu', { name: L.insertField })
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await expect(menu.getByRole('group', { name: APP.fieldGroups.recipient })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: APP.fields['recipient.firstName'] })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(canvas(page)).toContainText('Alex')
  })

  test('shows the host’s own button where its toolbar hook puts it, acting on the document', async ({ page }) => {
    await open(page, 'blank')
    const names = await toolbar(page).locator('button, select').evaluateAll((controls) => controls.map((c) => c.getAttribute('aria-label')))
    expect(names.slice(0, 3)).toEqual([L.undo, L.redo, APP.insertDate])
    await focusEnd(page)
    await toolbar(page).getByRole('button', { name: APP.insertDate, exact: true }).click()
    await expect(canvas(page)).toContainText(demoDate('en'))
  })
})
