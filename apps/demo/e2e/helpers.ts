// Shared e2e helpers. Labels are read from the library's defaults and the demo's label sets, never
// written as literals, so a label change can't silently break a selector.
import { DEFAULT_LABELS, expression } from '@icure/editor'
import { expect, type Page } from '@playwright/test'

import { LABEL_SETS } from '../src/labels/index.ts'

export const L = DEFAULT_LABELS
export const APP = LABEL_SETS.en.app
export { expression }

export const canvas = (page: Page) => page.getByRole('textbox', { name: L.canvas })
export const toolbar = (page: Page) => page.getByRole('toolbar', { name: L.toolbar })
export const editorPage = (page: Page, index = 0) => canvas(page).locator('.ie-page').nth(index)

export async function open(page: Page, template: string, query = ''): Promise<void> {
  await page.goto(`/?template=${template}${query}`)
  await expect(canvas(page)).toBeVisible()
}

// The cursor at the end of the document's last paragraph.
export async function focusEnd(page: Page): Promise<void> {
  await canvas(page).locator('p').last().click()
  await page.keyboard.press('End')
}
