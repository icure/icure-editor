// The editor's ProseMirror schema: pages of blocks; aligned paragraphs and headings; tables; fields
// (named values the data provider resolves), repeating blocks, embedded templates and images; bold,
// italic, underline, font, size and colour.
//
// Security: the schema is the only parser of pasted or loaded HTML. There is no link and no raw-HTML
// node; every style value is checked against a closed pattern before it reaches the DOM; an image is
// a reference to the host's image provider (`imageId`), never a URL: the schema neither reads nor
// writes `src`, so an `<img src="https://…">` in pasted HTML is dropped, and only the provider decides
// what an image shows (see images.ts).
import { Schema, type DOMOutputSpec, type MarkSpec, type NodeSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

import { clampImageWidth, safeAltText, safeImageId } from './images.ts'

export const ALIGNMENTS = ['inherit', 'left', 'center', 'right', 'justify'] as const
export type Alignment = (typeof ALIGNMENTS)[number]
export const FONTS = ['Roboto', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'] as const
export const FONT_SIZES = ['8px', '10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'] as const

// Class names the schema writes and parses (also targeted by the stylesheet).
export const PAGE_CLASS = 'ie-page'
export const FIELD_CLASS = 'ie-field'
export const REPEAT_CLASS = 'ie-repeat'
export const REPEAT_HEADER_CLASS = 'ie-repeat-header'
export const REPEAT_BODY_CLASS = 'ie-repeat-body'
export const REPEAT_FOOTER_CLASS = 'ie-repeat-footer'

export const ROW_ZONES = ['header', 'body', 'footer'] as const
export type RowZone = (typeof ROW_ZONES)[number]
export const safeRowZone = (value: unknown): RowZone => ROW_ZONES.find((zone) => zone === value) ?? 'body'
export const EMBED_CLASS = 'ie-embed'
export const IMAGE_CLASS = 'ie-image'

// A template id, a field name or a repeat source: printable, bounded, no markup.
const IDENTIFIER = /^[\p{L}\p{N}_.:@/-]{1,200}$/u
export const safeIdentifier = (value: unknown): string | null => (typeof value === 'string' && IDENTIFIER.test(value) ? value : null)

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i
const SIZE = /^\d{1,3}(\.\d{1,2})?(px|pt)$/
export const safeColour = (value: unknown): string | null => (typeof value === 'string' && COLOUR.test(value.trim()) ? value.trim() : null)
export const safeSize = (value: unknown): string | null => (typeof value === 'string' && SIZE.test(value.trim()) ? value.trim() : null)
export const safeFont = (value: unknown): string | null => FONTS.find((font) => typeof value === 'string' && value.replace(/["']/g, '').split(',')[0]!.trim() === font) ?? null
export const safeAlignment = (value: unknown): Alignment => ALIGNMENTS.find((a) => a === value) ?? 'inherit'

const alignStyle = (align: unknown): Record<string, string> => (safeAlignment(align) === 'inherit' ? {} : { style: `text-align: ${safeAlignment(align)}` })
const alignFrom = (dom: HTMLElement | string): { align: Alignment } => ({ align: typeof dom === 'string' ? 'inherit' : safeAlignment(dom.style.textAlign) })
const elementOf = (dom: HTMLElement | string): HTMLElement | null => (typeof dom === 'string' ? null : dom)

const page: NodeSpec = {
  content: 'block+',
  isolating: true,
  attrs: { id: { default: 0 } },
  toDOM: (): DOMOutputSpec => ['div', { class: PAGE_CLASS }, 0],
  parseDOM: [{ tag: `div.${PAGE_CLASS}` }],
}

const paragraph: NodeSpec = {
  group: 'block',
  content: 'inline*',
  attrs: { align: { default: 'inherit' } },
  toDOM: (node): DOMOutputSpec => ['p', alignStyle(node.attrs.align), 0],
  parseDOM: [{ tag: 'p', getAttrs: alignFrom }],
}

const heading: NodeSpec = {
  group: 'block',
  content: 'inline*',
  defining: true,
  attrs: { level: { default: 1 }, align: { default: 'inherit' } },
  toDOM: (node): DOMOutputSpec => [`h${Math.min(6, Math.max(1, Number(node.attrs.level) || 1))}`, alignStyle(node.attrs.align), 0],
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, getAttrs: (dom: HTMLElement | string) => ({ level, ...alignFrom(dom) }) })),
}

// A field: a name the data provider resolves to text (never evaluated); `label` qualifies it (the
// field `measure.latest` labelled `Weight` is looked up as `measure.latest:Weight`).
const variable: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { name: { default: '' }, label: { default: null } },
  toDOM: (node): DOMOutputSpec => ['span', { class: FIELD_CLASS, 'data-field': String(node.attrs.name), ...(node.attrs.label ? { 'data-label': String(node.attrs.label) } : {}) }],
  parseDOM: [
    {
      tag: `span.${FIELD_CLASS}`,
      getAttrs: (dom: HTMLElement | string) => {
        const element = elementOf(dom)
        const name = safeIdentifier(element?.dataset.field)
        return name ? { name, label: typeof element?.dataset.label === 'string' ? element.dataset.label.slice(0, 200) : null } : false
      },
    },
  ],
}

// A repeating block over a source of the data provider: its content is drawn once per item.
const repeat: NodeSpec = {
  group: 'block',
  content: 'repeat_header? repeat_body repeat_footer?',
  // One unit in the editor (drawn from its items, never edited in place): the cursor never enters
  // its template, the keyboard selects it whole.
  atom: true,
  isolating: true,
  attrs: { source: { default: '' } },
  toDOM: (node): DOMOutputSpec => ['div', { class: REPEAT_CLASS, 'data-source': String(node.attrs.source) }, 0],
  parseDOM: [
    {
      tag: `div.${REPEAT_CLASS}`,
      getAttrs: (dom: HTMLElement | string) => {
        const source = safeIdentifier(elementOf(dom)?.dataset.source)
        return source ? { source } : false
      },
    },
  ],
}

// A zone of a repeating block: drawn once (header, footer) or once per item (body).
const zone = (className: string): NodeSpec => ({
  content: 'block+',
  isolating: true,
  toDOM: (): DOMOutputSpec => ['div', { class: className }, 0],
  parseDOM: [{ tag: `div.${className}` }],
})

// Another template embedded by id: an atom, drawn from the provider's copy of that template.
const template_ref: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { templateId: { default: '' } },
  toDOM: (node): DOMOutputSpec => ['div', { class: EMBED_CLASS, 'data-template': String(node.attrs.templateId) }],
  parseDOM: [
    {
      tag: `div.${EMBED_CLASS}`,
      getAttrs: (dom: HTMLElement | string) => {
        const templateId = safeIdentifier(elementOf(dom)?.dataset.template)
        return templateId ? { templateId } : false
      },
    },
  ],
}

// An image by reference. No `src` in or out: the host's image provider resolves `imageId`.
const image: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  attrs: { imageId: { default: '' }, alt: { default: '' }, width: { default: null } },
  toDOM: (node): DOMOutputSpec => {
    const width = clampImageWidth(node.attrs.width)
    return ['img', { class: IMAGE_CLASS, 'data-image-id': String(node.attrs.imageId), alt: safeAltText(node.attrs.alt), ...(width ? { width: String(width) } : {}) }]
  },
  parseDOM: [
    {
      tag: 'img[data-image-id]',
      getAttrs: (dom: HTMLElement | string) => {
        const element = elementOf(dom)
        const imageId = safeImageId(element?.dataset.imageId)
        return imageId ? { imageId, alt: safeAltText(element?.getAttribute('alt')), width: clampImageWidth(element?.getAttribute('width')) } : false
      },
    },
  ],
}

const cellStyle = (prop: 'border-color' | 'background-color') => ({
  default: null,
  getFromDOM: (dom: HTMLElement) => safeColour(prop === 'border-color' ? dom.style.borderColor : dom.style.backgroundColor),
  setDOMAttr: (value: unknown, attrs: Record<string, unknown>) => {
    const colour = safeColour(value)
    if (colour) attrs.style = `${typeof attrs.style === 'string' ? attrs.style : ''}${prop}: ${colour};`
  },
})

const styleMark = (attr: 'size' | 'color' | 'font', css: 'font-size' | 'color' | 'font-family', check: (value: unknown) => string | null): MarkSpec => ({
  attrs: { [attr]: { default: '' } },
  toDOM: (mark): DOMOutputSpec => {
    const value = check(mark.attrs[attr])
    return ['span', value ? { style: `${css}: ${value}` } : {}, 0]
  },
  parseDOM: [{ style: css, getAttrs: (value: string | HTMLElement) => (check(value) ? { [attr]: check(value) } : false) }],
})

const tables = tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: { borderColor: cellStyle('border-color'), background: cellStyle('background-color') } })
// A row of a repeating block's table: drawn once before (header) or after (footer) the items, or per item (body).
const table_row: NodeSpec = {
  ...tables.table_row,
  attrs: { zone: { default: 'body' } },
  toDOM: (node): DOMOutputSpec => ['tr', safeRowZone(node.attrs.zone) === 'body' ? {} : { 'data-zone': safeRowZone(node.attrs.zone) }, 0],
  parseDOM: [{ tag: 'tr', getAttrs: (dom: HTMLElement | string) => ({ zone: safeRowZone(elementOf(dom)?.dataset.zone) }) }],
}

export const editorSchema = new Schema({
  nodes: {
    doc: { content: 'page+' },
    page,
    paragraph,
    heading,
    repeat,
    repeat_header: zone(REPEAT_HEADER_CLASS),
    repeat_body: zone(REPEAT_BODY_CLASS),
    repeat_footer: zone(REPEAT_FOOTER_CLASS),
    template_ref,
    ...tables,
    table_row,
    text: { group: 'inline' },
    variable,
    image,
    hard_break: { inline: true, group: 'inline', selectable: false, toDOM: () => ['br'], parseDOM: [{ tag: 'br' }] },
  },
  marks: {
    strong: { toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }] },
    em: { toDOM: () => ['em', 0], parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }] },
    underlined: { toDOM: () => ['u', 0], parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }] },
    size: styleMark('size', 'font-size', safeSize),
    color: styleMark('color', 'color', safeColour),
    font: styleMark('font', 'font-family', safeFont),
  },
})

export type EditorSchema = typeof editorSchema
