import { expect, test } from '@playwright/test'

import { APP, canvas, expression, L, open, toolbar, focusEnd } from './helpers.ts'

test.describe('fields', () => {
  test('fills fields from the provider, and shows their expressions on demand', async ({ page }) => {
    await open(page, 'welcome-letter')
    await expect(canvas(page)).toContainText('Dear Alex, thank you for joining us')
    await expect(canvas(page)).toContainText('M-000123')
    await expect(canvas(page)).toContainText('monthly')
    await page.getByRole('checkbox', { name: L.showExpressions }).check()
    await expect(canvas(page)).toContainText(`Dear ${expression('recipient.firstName')}`)
    await expect(canvas(page)).toContainText(expression('preference.value:Newsletter'))
  })

  test('shows the expression of a tapped field under the toolbar', async ({ page }) => {
    await open(page, 'welcome-letter')
    await canvas(page).locator('.ie-field[data-field="recipient.memberNumber"]').click()
    await expect(page.getByText(L.selectedExpression(expression('recipient.memberNumber')))).toBeVisible()
  })

  test('inserts a field from the menu and fills it at once', async ({ page }) => {
    await open(page, 'blank')
    await focusEnd(page)
    await toolbar(page).getByRole('button', { name: L.insertField }).click()
    await page.getByRole('menu', { name: L.insertField }).getByRole('group', { name: APP.fieldGroups.sender }).getByRole('menuitem', { name: APP.fields['sender.name'] }).click()
    await expect(canvas(page)).toContainText('Sam Taylor')
  })

  test('lists unresolved references behind a chip', async ({ page }) => {
    await open(page, 'problems')
    const chip = page.getByRole('button', { name: L.unresolved.chip(6) })
    await chip.click()
    const list = page.getByRole('region', { name: L.unresolved.title })
    await expect(list.getByRole('listitem')).toHaveText([
      expression('recipient.middleName'),
      expression('repeat:archive.items'),
      // The unknown block's fields: without a descriptor, nothing says they are item fields.
      expression('item.name'),
      expression('image:missing-image'),
      `${expression('template:loop-a')} (${L.unresolved.reasons.cycle})`,
      expression('template:does-not-exist'),
    ].map((t) => new RegExp(`^${t.replace(/[{}()]/g, '\\$&')}`)))
  })

  test('keeps the document readable, expressions included, when read only', async ({ page }) => {
    await open(page, 'welcome-letter', '&readOnly=1')
    await expect(toolbar(page)).toHaveCount(0)
    await expect(canvas(page)).toHaveAttribute('contenteditable', 'false')
    await page.getByRole('checkbox', { name: L.showExpressions }).check()
    await expect(canvas(page)).toContainText(expression('recipient.lastName'))
  })
})
