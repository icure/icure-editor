import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { canvas, focusEnd, L, open, toolbar } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixture-image.png', import.meta.url))

test.describe('images', () => {
  test('draws an image from the provider with its description', async ({ page }) => {
    await open(page, 'letterhead')
    const logo = canvas(page).locator('img.ie-image[data-image-id="logo"]')
    await expect(logo).toHaveAttribute('alt', 'Riverside Community Centre logo')
    await expect(logo).toHaveAttribute('src', /^data:image\/png;base64,/)
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)
  })

  test('uploads a checked image, asks its description, and resizes it without dragging', async ({ page }) => {
    await open(page, 'blank')
    await focusEnd(page)
    const chooser = page.waitForEvent('filechooser')
    await toolbar(page).getByRole('button', { name: L.insertImage }).click()
    await (await chooser).setFiles(FIXTURE)
    const alt = page.getByRole('textbox', { name: L.image.alt })
    await expect(alt).toBeFocused()
    await alt.fill('A teal badge')
    const image = canvas(page).locator('img.ie-image')
    await expect(image).toHaveAttribute('alt', 'A teal badge')
    await page.getByRole('button', { name: L.image.larger }).click()
    await expect(image).toHaveAttribute('width', '280')
    const width = page.getByRole('spinbutton', { name: L.image.width })
    await width.fill('100')
    await width.press('Enter')
    await expect(image).toHaveAttribute('width', '100')
    await page.getByRole('button', { name: L.image.naturalSize }).click()
    await expect(image).not.toHaveAttribute('width')
  })

  test('refuses a file that is not the image it claims to be', async ({ page }) => {
    await open(page, 'blank')
    await focusEnd(page)
    const chooser = page.waitForEvent('filechooser')
    await toolbar(page).getByRole('button', { name: L.insertImage }).click()
    await (await chooser).setFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') })
    await expect(page.getByText(L.image.errors.content)).toBeVisible()
    await expect(canvas(page).locator('img.ie-image')).toHaveCount(0)
  })

  test('drops an image pasted by URL', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await open(page, 'blank')
    await focusEnd(page)
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.setData('text/html', '<p>pasted <img src="https://tracker.example/pixel.png"> text</p>')
      document.querySelector('.ie-canvas')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(canvas(page)).toContainText('pasted  text')
    await expect(canvas(page).locator('img.ie-image')).toHaveCount(0)
    expect(requests.filter((url) => url.includes('tracker.example'))).toEqual([])
  })
})
