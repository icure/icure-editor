import { FORMS } from '@icure/editor-forms/forms'
import { FIELD_VALUES } from '@icure/editor-forms/provider'
import { expect, test } from '@playwright/test'

import { SAMPLE_TEMPLATES, TEMPLATE_GROUPS } from '../src/samples/templates.ts'
import { APP, canvas, open } from './helpers.ts'

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: APP.templates })
const group = (page: import('@playwright/test').Page, name: string) => nav(page).locator('details', { has: page.locator('summary', { hasText: name }) })

test.describe('template list', () => {
  test('lists every template in its group, the current group open', async ({ page }) => {
    await open(page, 'welcome-letter')
    for (const name of TEMPLATE_GROUPS) {
      const members = SAMPLE_TEMPLATES.filter((t) => t.group === name)
      // A closed group's links are hidden from the accessibility tree: count the anchors.
      await expect(group(page, APP.templateGroups[name]).locator('a')).toHaveCount(members.length)
    }
    await expect(group(page, APP.templateGroups.documents)).toHaveAttribute('open', '')
    await expect(group(page, APP.templateGroups.blocks)).not.toHaveAttribute('open', '')
    expect(SAMPLE_TEMPLATES.filter((t) => FORMS.some((f) => f.id === t.id))).toHaveLength(FORMS.length)
  })

  test('opens a medical form from its group, filled', async ({ page }) => {
    const radiology = FORMS.find((f) => f.id === 'radiology-request')
    test.skip(!radiology, 'the forms’ content (apps/forms/data) is missing')
    const form = radiology!
    await open(page, 'welcome-letter')
    const imaging = group(page, APP.templateGroups.imaging)
    await imaging.locator('summary').click()
    await imaging.getByRole('link', { name: form.title }).click()
    await expect(canvas(page)).toContainText(FIELD_VALUES['patient.lastName']!)
    await expect(page.locator('.ie-unresolved')).toHaveCount(0)
    await expect(imaging.getByRole('link', { name: form.title })).toHaveAttribute('aria-current', 'page')
  })
})
