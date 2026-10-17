// Every form: valid against the editor's schema, opened with its fields filled and nothing left
// unresolved, previewed as HTML and downloaded as a PDF.
import { readFile } from 'node:fs/promises'

import { DEFAULT_LABELS, editorSchema } from '@icure/editor'
import { expect, test } from '@playwright/test'

import { FORMS } from '../src/forms/index.ts'
import { APP, EDITOR_LABELS } from '../src/labels.ts'
import { FIELD_VALUES } from '../src/provider.ts'

const canvasName = EDITOR_LABELS.canvas ?? DEFAULT_LABELS.canvas
// The fields a form uses, from its content.
const fieldsOf = (node: unknown): string[] => {
  if (!node || typeof node !== 'object') return []
  const n = node as { type?: string; attrs?: { name?: string }; content?: unknown[] }
  return [...(n.type === 'variable' && n.attrs?.name ? [n.attrs.name] : []), ...(n.content ?? []).flatMap(fieldsOf)]
}

for (const form of FORMS) {
  test.describe(form.title, () => {
    test('fits the editor schema, and every field it uses has a value', () => {
      expect(() => editorSchema.nodeFromJSON(form.content).check()).not.toThrow()
      for (const key of fieldsOf(form.content)) expect(FIELD_VALUES[key], key).toBeTruthy()
    })

    test('opens filled, previews and prints', async ({ page }) => {
      await page.goto(`/?form=${form.id}`)
      const canvas = page.getByRole('textbox', { name: canvasName })
      await expect(canvas).toBeVisible()
      const first = fieldsOf(form.content)[0]!
      await expect(canvas).toContainText(FIELD_VALUES[first]!)
      await expect(page.locator('.ie-unresolved')).toHaveCount(0)
      await page.getByRole('button', { name: APP.preview }).click()
      await expect(page.frameLocator(`iframe[title="${APP.previewTitle}"]`).locator('body')).toContainText(FIELD_VALUES[first]!)
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: APP.downloadPdf }).click()
      const bytes = await readFile(await (await download).path())
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })
  })
}
