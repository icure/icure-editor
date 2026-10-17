// HTML output: the rendered document serialised through the schema (text nodes only, every style
// checked by the schema), images given their provider-resolved source. Nothing from the document or
// the data provider is ever parsed as HTML.
import { DOMSerializer, type Node as ProseNode } from 'prosemirror-model'

import { IMAGE_CLASS, editorSchema } from '../schema.ts'
import { clampImageWidth, safeAltText } from '../images.ts'
import { renderDocument } from '../render.ts'
import type { Resolution } from '../resolve.ts'
import { expression } from '../render.ts'
import { imageKey } from '../document.ts'
import { A4_PAGE, type PageFormat } from '../pagination.ts'

export interface SerializerOptions {
  // What an image without a resolved source draws: nothing (output) or its expression (editor).
  readonly missingImage?: 'omit' | 'expression'
}

// A DOM serializer whose images take their source from the resolution.
export function createSerializer(resolution: Resolution, { missingImage = 'omit' }: SerializerOptions = {}): DOMSerializer {
  const base = DOMSerializer.fromSchema(editorSchema)
  return new DOMSerializer(
    {
      ...base.nodes,
      image: (node) => {
        const id = String(node.attrs.imageId)
        const resolved = resolution.images.get(id)
        const width = clampImageWidth(node.attrs.width) ?? (resolved?.width ? clampImageWidth(resolved.width) : null)
        if (!resolved) return missingImage === 'expression' ? ['span', { class: `${IMAGE_CLASS} ie-unresolved-ref`, 'data-image-id': id }, expression(imageKey(id))] : ['span', { 'data-image-id': id, hidden: 'hidden' }]
        return ['img', { class: IMAGE_CLASS, 'data-image-id': id, src: resolved.src, alt: safeAltText(node.attrs.alt) || safeAltText(resolved.alt), ...(width ? { width: String(width) } : {}) }]
      },
    },
    base.marks,
  )
}

export interface HtmlOptions {
  // The document used to create DOM nodes (default: the global one).
  readonly document?: Document
}

// The rendered document as a fragment of `div.ie-page` sheets.
export function toHtmlFragment(doc: ProseNode, resolution: Resolution, options: HtmlOptions = {}): DocumentFragment {
  const target = options.document ?? globalThis.document
  const fragment = target.createDocumentFragment()
  fragment.append(createSerializer(resolution).serializeFragment(renderDocument(doc, resolution).content, { document: target }))
  return fragment
}

export function toHtml(doc: ProseNode, resolution: Resolution, options: HtmlOptions = {}): string {
  const target = options.document ?? globalThis.document
  const host = target.createElement('div')
  host.append(toHtmlFragment(doc, resolution, { document: target }))
  return host.innerHTML
}

// The cells of a layout table, not those of a table nested in one (the schema writes a tbody).
const LAYOUT_CELLS = ['tbody > tr > td', 'tbody > tr > th', 'tr > td', 'tr > th'].map((path) => `.ie-page table[data-layout='layout'] > ${path}`).join(',')

const escapeText = (value: string): string => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export interface HtmlDocumentOptions extends HtmlOptions {
  readonly title: string
  readonly lang?: string
  // The sheets' size and margin, as in the editor (default A4, 20 mm).
  readonly page?: PageFormat
}

// A length in millimetres for the stylesheet: a finite, non-negative number, else the fallback.
const millimetres = (value: number, fallback: number): string => `${Number.isFinite(value) && value >= 0 ? value : fallback}mm`

// The file's stylesheet: each `div.ie-page` is one sheet of the page format, its margin as padding,
// laid out like the editor's page (same font and size, so the editor's pagination holds). On screen
// the sheets are stacked on a grey backdrop; printed, the paper is the page format with no margin of
// its own, so each sheet fills exactly one page.
export function htmlDocumentCss(page: PageFormat = A4_PAGE): string {
  const width = millimetres(page.widthMm, A4_PAGE.widthMm)
  const height = millimetres(page.heightMm, A4_PAGE.heightMm)
  const margin = millimetres(page.marginMm, A4_PAGE.marginMm)
  return [
    `@page{size:${width} ${height};margin:0}`,
    'html,body{margin:0;padding:0}',
    "body{background:#e8eaed;color:#1c1d1f;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    `.ie-page{box-sizing:border-box;width:${width};height:${height};margin:8mm auto;padding:${margin};overflow:hidden;background:#fff;box-shadow:0 1px 3px rgb(0 0 0 / 0.18),0 4px 12px rgb(0 0 0 / 0.08);break-after:page}`,
    '.ie-page:last-child{break-after:auto}',
    '.ie-page p{margin:0;min-height:1em}',
    '.ie-page table{border-collapse:collapse;width:100%}',
    '.ie-page td,.ie-page th{border:1px solid #8a8f98;padding:2px 4px;vertical-align:top}',
    // A layout table draws no rules but those a cell names (inline per-side styles, which win). Its
    // own cells only (child combinators): a grid table nested in it keeps its rules, as in the PDF.
    `${LAYOUT_CELLS}{border-style:none}`,
    '.ie-page img{max-width:100%;height:auto;vertical-align:bottom}',
    `@media print{html,body{width:${width};background:none}.ie-page{margin:0;box-shadow:none}}`,
  ].join('')
}

// A standalone HTML file: one sheet per page, a restrictive CSP (no script, images from data: only).
export function toHtmlDocument(doc: ProseNode, resolution: Resolution, { title, lang = 'en', page = A4_PAGE, ...options }: HtmlDocumentOptions): string {
  const body = toHtml(doc, resolution, options)
  return `<!doctype html><html lang="${escapeText(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:"><title>${escapeText(title)}</title><style>${htmlDocumentCss(page)}</style></head><body>${body}</body></html>`
}
