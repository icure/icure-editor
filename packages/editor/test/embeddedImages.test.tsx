// Images embedded in the document (the image node's `src`): drawn by the editor and every output
// without the host's image provider, and held to the same rules as a provider's source — a raster
// `data:` URI whose bytes match its type, within the size limit, never a URL.
import { render, waitFor } from '@testing-library/react'
import { DOMParser as ProseParser, DOMSerializer } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { insertImage } from '../src/commands.ts'
import { toEditorDocument } from '../src/document.ts'
import { safeEmbeddedImageSrc } from '../src/images.ts'
import { toHtml } from '../src/output/html.ts'
import { toMarkdown } from '../src/output/markdown.ts'
import { toPdfContent } from '../src/output/pdfContent.ts'
import { DocumentEditor, type DocumentEditorHandle } from '../src/react/DocumentEditor.tsx'
import { EMPTY_RESOLUTION, resolveDocument } from '../src/resolve.ts'
import { editorSchema } from '../src/schema.ts'
import { docJson, fakeProvider, page, paragraph, PNG_DATA_URI, text } from './helpers.ts'

const embedded = (imageId: string, src: string, alt = '', width: number | null = null) => ({ type: 'image', attrs: { imageId, alt, width, src } })

// The first bytes of a JPEG, declared as a PNG.
const SPOOFED = `data:image/png;base64,${btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1))}`
const SVG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`

describe('safeEmbeddedImageSrc', () => {
  it('accepts a raster data: URI whose bytes match its type', () => {
    expect(safeEmbeddedImageSrc(PNG_DATA_URI)).toBe(PNG_DATA_URI)
  })

  it('refuses a URL, SVG, a type the bytes contradict, and an image over the limit', () => {
    expect(safeEmbeddedImageSrc('https://tracker.example/pixel.png')).toBeNull()
    expect(safeEmbeddedImageSrc('blob:https://host.example/123')).toBeNull()
    expect(safeEmbeddedImageSrc(SVG)).toBeNull()
    expect(safeEmbeddedImageSrc(SPOOFED)).toBeNull()
    expect(safeEmbeddedImageSrc(PNG_DATA_URI, { maxBytes: 10 })).toBeNull()
    expect(safeEmbeddedImageSrc(null)).toBeNull()
  })
})

describe('an embedded image', () => {
  it('is resolved without asking the image provider', async () => {
    const resolve = vi.fn(() => null)
    const document = toEditorDocument(docJson(page(paragraph(embedded('logo', PNG_DATA_URI)))))
    const resolution = await resolveDocument(document, { ...fakeProvider({}), images: { resolve } })
    expect(resolve).not.toHaveBeenCalled()
    expect(resolution.images.get('logo')?.src).toBe(PNG_DATA_URI)
    expect(resolution.unresolved).toEqual([])
  })

  it('is printed in HTML, PDF and Markdown, even with an empty resolution', () => {
    const document = toEditorDocument(docJson(page(paragraph(text('Logo '), embedded('logo', PNG_DATA_URI, 'Logo', 120)))))
    expect(toHtml(document, EMPTY_RESOLUTION)).toContain(`<img class="ie-image" data-image-id="logo" src="${PNG_DATA_URI}" alt="Logo" width="120">`)
    const pdf = toPdfContent(document, EMPTY_RESOLUTION, { title: 'x', createdAt: new Date('2026-01-01T00:00:00Z') })
    expect(pdf.blocks).toContainEqual(expect.objectContaining({ kind: 'image', dataUri: PNG_DATA_URI, alt: 'Logo' }))
    expect(toMarkdown(document, EMPTY_RESOLUTION)).toContain(`![Logo](${PNG_DATA_URI})`)
  })

  it('is held to the host’s size limit when drawn, not only when resolved', async () => {
    const document = toEditorDocument(docJson(page(paragraph(embedded('logo', PNG_DATA_URI)))))
    const resolution = await resolveDocument(document, fakeProvider({}), { maxImageBytes: 10 })
    expect(resolution.images.has('logo')).toBe(false)
    expect(toHtml(document, resolution)).not.toContain('<img')
    expect(toPdfContent(document, resolution, { title: 'x', createdAt: new Date('2026-01-01T00:00:00Z') }).blocks.some((block) => block.kind === 'image')).toBe(false)
  })

  it('that breaks the rules is not drawn and falls back to the provider', async () => {
    const document = toEditorDocument(docJson(page(paragraph(embedded('a', SPOOFED), embedded('b', 'https://tracker.example/b.png')))))
    expect(toHtml(document, EMPTY_RESOLUTION)).not.toContain('<img')
    const resolution = await resolveDocument(document, fakeProvider({ images: { b: PNG_DATA_URI } }))
    expect(resolution.images.get('b')?.src).toBe(PNG_DATA_URI)
    expect(resolution.unresolved).toEqual([{ key: 'image:a', kind: 'image', reason: 'missing' }])
  })

  it('survives a copy and paste; a URL in the pasted image is dropped', () => {
    const parse = (html: string) => {
      const element = window.document.createElement('div')
      element.innerHTML = html
      const parsed = ProseParser.fromSchema(editorSchema).parse(element)
      const out = window.document.createElement('div')
      out.appendChild(DOMSerializer.fromSchema(editorSchema).serializeFragment(parsed.content))
      return out.innerHTML
    }
    expect(parse(`<div class="ie-page"><p><img data-image-id="logo" src="${PNG_DATA_URI}" alt="Logo"></p></div>`)).toBe(
      `<div class="ie-page"><p><img class="ie-image" data-image-id="logo" alt="Logo" src="${PNG_DATA_URI}"></p></div>`,
    )
    expect(parse('<div class="ie-page"><p><img data-image-id="logo" src="https://tracker.example/a.png"></p></div>')).toBe(
      '<div class="ie-page"><p><img class="ie-image" data-image-id="logo" alt=""></p></div>',
    )
  })

  it('is inserted embedded when the command carries its source, and only a safe one', () => {
    const insertAt = (src: string) => {
      const created = EditorState.create({ doc: toEditorDocument(docJson(page(paragraph(text('Hello'))))) })
      const at = created.apply(created.tr.setSelection(TextSelection.create(created.doc, 3)))
      let after = at
      insertImage({ imageId: 'img', src })(at, (tr) => {
        after = at.apply(tr)
      })
      let found: unknown
      after.doc.descendants((node) => {
        if (node.type.name === 'image') found = node.attrs.src
      })
      return found
    }
    expect(insertAt(PNG_DATA_URI)).toBe(PNG_DATA_URI)
    expect(insertAt('https://x.example/a.png')).toBeNull()
  })

  it('is drawn in the editor without an image provider', async () => {
    const ref = createRef<DocumentEditorHandle>()
    const { container } = render(<DocumentEditor ref={ref} initial={docJson(page(paragraph(embedded('logo', PNG_DATA_URI, 'Logo'))))} provider={fakeProvider({})} />)
    await waitFor(() => expect(container.querySelector('img.ie-image')).toHaveAttribute('src', PNG_DATA_URI))
    expect(container.querySelector('img.ie-image')).toHaveAttribute('alt', 'Logo')
  })
})
