// Builders of ProseMirror JSON for the forms, and the form idioms on top of them: a labelled line
// (a field, or a blank to fill by hand), an option box, a framed section (a one-cell table).
export type Json = Readonly<Record<string, unknown>>

export const STRONG: Json = { type: 'strong' }
export const EM: Json = { type: 'em' }
export const U: Json = { type: 'underlined' }
export const size = (value: string): Json => ({ type: 'size', attrs: { size: value } })
export const colour = (value: string): Json => ({ type: 'color', attrs: { color: value } })

export const text = (value: string, ...marks: Json[]): Json => ({ type: 'text', text: value, ...(marks.length ? { marks } : {}) })
export const bold = (value: string, ...marks: Json[]): Json => text(value, STRONG, ...marks)
export const italic = (value: string, ...marks: Json[]): Json => text(value, EM, ...marks)
export const small = (value: string, ...marks: Json[]): Json => text(value, size('10px'), ...marks)
export const field = (name: string, ...marks: Json[]): Json => ({ type: 'variable', attrs: { name, label: null }, ...(marks.length ? { marks } : {}) })
export const br: Json = { type: 'hard_break' }
export const image = (imageId: string, alt: string, width: number | null = null): Json => ({ type: 'image', attrs: { imageId, alt, width } })

type Align = 'left' | 'center' | 'right' | 'justify'
export const p = (...content: Json[]): Json => ({ type: 'paragraph', ...(content.length ? { content } : {}) })
export const pAligned = (align: Align, ...content: Json[]): Json => ({ type: 'paragraph', attrs: { align }, ...(content.length ? { content } : {}) })
export const h = (level: 1 | 2 | 3, ...content: Json[]): Json => ({ type: 'heading', attrs: { level }, content })
export const hAligned = (level: 1 | 2 | 3, align: Align, ...content: Json[]): Json => ({ type: 'heading', attrs: { level, align }, content })

// An option to tick by hand. The PDF font (Roboto) has no ballot box, so the box is a circle.
export const BOX = '○'
export const box = (label: string, ...marks: Json[]): Json => text(`${BOX} ${label}`, ...marks)
// Options on one line, spaced.
export const options = (labels: readonly string[], ...marks: Json[]): Json[] => labels.flatMap((label, i) => [...(i ? [text('    ', ...marks)] : []), box(label, ...marks)])
// A blank to fill by hand.
export const blank = (length = 24): Json => text('_'.repeat(length))
// `Label : value` where the value is a field, or a blank to fill by hand.
export const line = (label: string, value: Json | string | null = null, ...marks: Json[]): Json[] => [text(`${label} : `, ...marks), typeof value === 'string' ? field(value) : (value ?? blank())]
export const pLine = (label: string, value: Json | string | null = null, ...marks: Json[]): Json => p(...line(label, value, ...marks))

// Tables. A cell holds blocks; a bare inline list becomes one paragraph.
export interface CellOptions {
  readonly colspan?: number
  readonly rowspan?: number
  readonly width?: number
  readonly background?: string
  readonly border?: string
  readonly header?: boolean
}
const isBlock = (node: Json): boolean => ['paragraph', 'heading', 'table', 'repeat', 'template_ref'].includes(String(node.type))
export const cell = (content: Json[] | Json | string, opts: CellOptions = {}): Json => {
  const list = typeof content === 'string' ? [text(content)] : Array.isArray(content) ? content : [content]
  const blocks = list.length === 0 ? [p()] : list.every(isBlock) ? list : [p(...list)]
  return {
    type: opts.header ? 'table_header' : 'table_cell',
    attrs: { colspan: opts.colspan ?? 1, rowspan: opts.rowspan ?? 1, colwidth: opts.width ? [opts.width] : null, background: opts.background ?? null, borderColor: opts.border ?? null },
    content: blocks,
  }
}
export const row = (...cells: Json[]): Json => ({ type: 'table_row', content: cells })
export const table = (...rows: Json[]): Json => ({ type: 'table', content: rows })
// A framed section: a one-cell table.
export const frame = (blocks: Json[], opts: CellOptions = {}): Json => table(row(cell(blocks, opts)))

export const doc = (...pages: Json[][]): Json => ({ type: 'doc', content: pages.map((content) => ({ type: 'page', content })) })
