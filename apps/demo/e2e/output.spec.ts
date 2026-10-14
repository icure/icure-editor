import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { APP, open } from './helpers.ts'

test.describe('output', () => {
  test('previews the filled document as HTML, nested templates and repeats included', async ({ page }) => {
    await open(page, 'welcome-letter')
    await page.getByRole('button', { name: APP.preview }).click()
    const frame = page.frameLocator(`iframe[title="${APP.previewTitle}"]`)
    await expect(frame.locator('body')).toContainText('Dear Alex, thank you for joining us')
    await expect(frame.locator('body')).toContainText('– Garden workshop')
    await expect(frame.locator('body')).toContainText('Kind regards,')
    await expect(frame.locator('img[data-image-id="logo"]')).toHaveAttribute('alt', 'Riverside Community Centre logo')
    await expect(frame.locator('body')).not.toContainText('{')
    await expect(page.locator(`iframe[title="${APP.previewTitle}"]`)).toHaveAttribute('sandbox', '')
  })

  test('downloads the PDF, with its image embedded', async ({ page }) => {
    await open(page, 'welcome-letter')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: APP.downloadPdf }).click()
    const file = await (await download).path()
    const bytes = await readFile(file)
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(bytes.toString('latin1')).toMatch(/\/Subtype \/Image/)
    expect((await download).suggestedFilename()).toMatch(/^2026-10-14-welcome-letter-\d+\.pdf$/)
  })

  test('downloads the HTML file', async ({ page }) => {
    await open(page, 'invoice')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: APP.downloadHtml }).click()
    const html = await readFile(await (await download).path(), 'utf8')
    expect(html).toContain('Annual membership')
    expect(html).toContain("default-src 'none'")
  })
})
