import { expect, test } from '@playwright/test'

import { canvas, open } from './helpers.ts'

test.describe('pagination', () => {
  // A hang shows as the page never answering: fail fast instead of at the default timeout.
  test.describe.configure({ timeout: 15_000 })

  test('settles when a page ends with empty lines and the next one starts with an image', async ({ page }) => {
    await open(page, 'page-break-image')
    const logo = canvas(page).locator('img.ie-image[data-image-id="logo"]')
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 2_000 }).toBe(true)
    await page.waitForTimeout(2_000)
    // Two seconds in, nothing moves between the pages any more.
    const moves = await canvas(page).evaluate(
      (root) =>
        new Promise<number>((resolve) => {
          let count = 0
          const observer = new MutationObserver((records) => {
            count += records.filter((record) => record.type === 'childList' && (record.target as Element).classList?.contains('ie-page')).length
          })
          observer.observe(root, { childList: true, subtree: true })
          setTimeout(() => {
            observer.disconnect()
            resolve(count)
          }, 1_000)
        }),
    )
    expect(moves).toBe(0)
    // And every sheet holds its content.
    const overflowing = await canvas(page).evaluate((root) => [...root.querySelectorAll<HTMLElement>(':scope > .ie-page')].filter((sheet) => sheet.scrollHeight > sheet.clientHeight + 1).length)
    expect(overflowing).toBe(0)
    await expect(logo).toBeVisible()
  })
})
