import { describe, expect, it } from 'vitest'

import { checkImageFile, clampImageWidth, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH, safeAltText, safeImageSrc } from '../src/images.ts'
import { PNG_DATA_URI } from './helpers.ts'

const PNG_BYTES = Uint8Array.from(atob(PNG_DATA_URI.split(',')[1]!), (c) => c.charCodeAt(0))
const file = (bytes: Uint8Array, type: string, name = 'x') => new File([bytes as Uint8Array<ArrayBuffer>], name, { type })

describe('image sources', () => {
  it('accepts raster data URIs, blob URLs and https URLs', () => {
    expect(safeImageSrc(PNG_DATA_URI)).toBe(PNG_DATA_URI)
    expect(safeImageSrc('blob:https://app.example/1234-5678')).toBe('blob:https://app.example/1234-5678')
    expect(safeImageSrc('https://images.example/logo.png')).toBe('https://images.example/logo.png')
  })

  it('refuses SVG, scripts, plain http, credentials and other schemes', () => {
    for (const src of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'javascript:alert(1)', 'http://images.example/a.png', 'https://user:pw@images.example/a.png', 'file:///etc/passwd', 'data:text/html;base64,PGI+', '', 42]) {
      expect(safeImageSrc(src)).toBeNull()
    }
  })

  it('refuses a data URI over the size limit', () => {
    expect(safeImageSrc(PNG_DATA_URI, { maxBytes: 10 })).toBeNull()
  })
})

describe('image files', () => {
  it('accepts a file whose content matches its declared type', async () => {
    expect(await checkImageFile(file(PNG_BYTES, 'image/png'))).toBeNull()
  })

  it('refuses another type, a too large file or a disguised file', async () => {
    expect(await checkImageFile(file(PNG_BYTES, 'image/svg+xml'))).toBe('type')
    expect(await checkImageFile(file(PNG_BYTES, 'image/png'), { maxBytes: 10 })).toBe('size')
    expect(await checkImageFile(file(new TextEncoder().encode('<script>alert(1)</script>'), 'image/png'))).toBe('content')
    expect(await checkImageFile(file(PNG_BYTES, 'image/jpeg'))).toBe('content')
  })
})

describe('image attributes', () => {
  it('bounds the width', () => {
    expect(clampImageWidth(4)).toBe(MIN_IMAGE_WIDTH)
    expect(clampImageWidth(99_999)).toBe(MAX_IMAGE_WIDTH)
    expect(clampImageWidth('320')).toBe(320)
    expect(clampImageWidth('320px')).toBeNull()
    expect(clampImageWidth(null)).toBeNull()
  })

  it('keeps alt text as one bounded line of text', () => {
    expect(safeAltText('A\nlogo\u0000')).toBe('A logo ')
    expect(safeAltText('x'.repeat(900))).toHaveLength(500)
    expect(safeAltText(undefined)).toBe('')
  })
})
