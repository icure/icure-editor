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

const escapeText = (value: string): string => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export interface HtmlDocumentOptions extends HtmlOptions {
  readonly title: string
  readonly lang?: string
  // Page size and margin of the printed sheets (CSS `@page`).
  readonly pageSize?: string
  readonly marginMm?: number
}

// A standalone HTML file: one sheet per page, a restrictive CSP (no script, images from data: only).
export function toHtmlDocument(doc: ProseNode, resolution: Resolution, { title, lang = 'en', pageSize = 'A4', marginMm = 20, ...options }: HtmlDocumentOptions): string {
  const body = toHtml(doc, resolution, options)
  const css = `@page{size:${pageSize.replace(/[^A-Za-z0-9 ]/g, '')};margin:${Number(marginMm) || 0}mm}body{font-family:sans-serif;margin:0}.ie-page{break-after:page}.ie-page:last-child{break-after:auto}.ie-page p{margin:0;min-height:1em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:2px 4px;vertical-align:top}img{max-width:100%}`
  return `<!doctype html><html lang="${escapeText(lang)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: https:"><title>${escapeText(title)}</title><style>${css}</style></head><body>${body}</body></html>`
}
