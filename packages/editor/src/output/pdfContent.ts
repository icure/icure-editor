// The document as structured PDF content, one to one with what the editor shows: its pages,
// paragraphs and headings with their alignment, bold, italic, underline, size, colour and font, its
// tables, its images, its fields filled, its repeating blocks drawn and its embedded templates
// inlined. Pure: the same document, resolution and date give the same content.
import type { Mark, Node as ProseNode } from 'prosemirror-model'

import { clampImageWidth, dataUriType } from '../images.ts'
import type { PageFormat } from '../pagination.ts'
import { renderDocument } from '../render.ts'
import type { Resolution } from '../resolve.ts'
import { cellSides, editorSchema, safeAlignment, safeColour, safeFont, safeSize } from '../schema.ts'

const { nodes, marks } = editorSchema
export const PX_TO_PT = 0.75
export const POINTS_PER_MM = 72 / 25.4
export const mm = (value: number): number => value * POINTS_PER_MM

// Exact page sizes in points (ISO 216, US Letter).
export const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
} as const
export type PageSize = keyof typeof PAGE_SIZES
// A sheet in points.
export interface PdfPageSize {
  readonly width: number
  readonly height: number
}

export interface TextRun {
  readonly text: string
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly sizePt?: number
  readonly color?: string
  // The editor's font name (see PdfDefinitionOptions.fonts for how it maps to an embedded font).
  readonly font?: string
}

export const PDF_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const
export type PdfAlignment = (typeof PDF_ALIGNMENTS)[number]

export type PdfBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly runs: readonly TextRun[]; readonly align?: PdfAlignment }
  | { readonly kind: 'paragraph'; readonly runs: readonly TextRun[]; readonly size?: number; readonly align?: PdfAlignment }
  // Rows of cells; a cell holds the blocks a page holds (paragraphs, headings, images, nested tables).
  // The first `headerRows` rows are repeated on each PDF page.
  | { readonly kind: 'table'; readonly headerRows: number; readonly rows: readonly (readonly PdfCell[])[] }
  // A raster `data:` URI (PNG or JPEG: what PDF embeds), its width in points, its description.
  | { readonly kind: 'image'; readonly dataUri: string; readonly widthPt?: number; readonly alt: string; readonly align?: PdfAlignment }
  | { readonly kind: 'pageBreak' }

export interface PdfCell {
  readonly blocks: readonly PdfBlock[]
  readonly colSpan: number
  readonly rowSpan: number
  // A header cell (`table_header`): drawn bold on a light fill, unless `fill` is set.
  readonly header?: boolean
  readonly fill?: string
  readonly borderColor?: string
  // Which sides are drawn, as [left, top, right, bottom]; unset: all four.
  readonly borders?: readonly [boolean, boolean, boolean, boolean]
}

export interface PdfContent {
  readonly title: string
  // Fixed: two renders of the same content are byte-identical.
  readonly createdAt?: Date
  // The sheet in points (portrait or landscape).
  readonly page: PdfPageSize
  readonly marginMm: number
  readonly blocks: readonly PdfBlock[]
}

export interface PdfContentOptions {
  readonly title: string
  readonly createdAt?: Date
  // A named size, or a format in mm (any size, landscape included). With a format the margin
  // defaults to the format's own; an explicit `marginMm` wins.
  readonly page?: PageSize | PageFormat
  readonly marginMm?: number
  // A closing line (who issued it, a reference…), small and italic.
  readonly footer?: string
}

export const DEFAULT_MARGIN_MM = 20

const MIN_SHEET_MM = 50
const MAX_SHEET_MM = 2000
const sane = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

// The sheet and margin of a page option. A format that is not finite, positive and within bounds
// falls back to A4. A margin (explicit or the format's) that is not finite, >= 0 and under half of
// each side is dropped for the next candidate, ending at the default margin.
function sheetOf(page: PageSize | PageFormat, explicitMarginMm: number | undefined): { sheet: PdfPageSize; marginMm: number } {
  const format = typeof page === 'object' && page && sane(page.widthMm, MIN_SHEET_MM, MAX_SHEET_MM) && sane(page.heightMm, MIN_SHEET_MM, MAX_SHEET_MM) ? page : null
  const sheet = format ? { width: mm(format.widthMm), height: mm(format.heightMm) } : typeof page === 'string' && page in PAGE_SIZES ? PAGE_SIZES[page] : PAGE_SIZES.A4
  const halfSideMm = Math.min(sheet.width, sheet.height) / POINTS_PER_MM / 2
  const fits = (value: unknown): value is number => sane(value, 0, halfSideMm - 1e-6)
  const marginMm = [explicitMarginMm, format?.marginMm].find(fits) ?? DEFAULT_MARGIN_MM
  return { sheet, marginMm }
}

// The options that print a `PageFormat`: `toPdfContent(doc, resolution, { title, ...pdfPageOf(format) })`.
export const pdfPageOf = (format: PageFormat): Pick<PdfContentOptions, 'page' | 'marginMm'> => ({ page: format, marginMm: format.marginMm })
// PDF embeds PNG and JPEG; other types must be converted first (see output/images.ts).
const PDF_IMAGE_TYPES = ['image/png', 'image/jpeg']

const alignmentOf = (node: ProseNode): PdfAlignment | undefined => {
  const align = safeAlignment(node.attrs.align)
  return align === 'inherit' ? undefined : align
}

function sizeOf(value: unknown): number | undefined {
  const size = safeSize(value)
  if (!size) return undefined
  const amount = Number.parseFloat(size)
  return size.endsWith('px') ? Math.round(amount * PX_TO_PT * 100) / 100 : amount
}

function runOf(text: string, nodeMarks: readonly Mark[]): TextRun {
  const has = (type: (typeof marks)[keyof typeof marks]) => nodeMarks.find((mark) => mark.type === type)
  const size = sizeOf(has(marks.size)?.attrs.size)
  const color = safeColour(has(marks.color)?.attrs.color)
  const font = safeFont(has(marks.font)?.attrs.font)
  return { text, ...(has(marks.strong) ? { bold: true } : {}), ...(has(marks.em) ? { italic: true } : {}), ...(has(marks.underlined) ? { underline: true } : {}), ...(size ? { sizePt: size } : {}), ...(color ? { color } : {}), ...(font ? { font } : {}) }
}

function imageBlock(node: ProseNode, resolution: Resolution, maxWidthPt: number, align: PdfAlignment | undefined): PdfBlock | null {
  const resolved = resolution.images.get(String(node.attrs.imageId))
  const type = resolved ? dataUriType(resolved.src) : null
  if (!resolved || !type || !PDF_IMAGE_TYPES.includes(type)) return null
  const widthPx = clampImageWidth(node.attrs.width) ?? (resolved.width ? clampImageWidth(resolved.width) : null)
  const widthPt = widthPx ? Math.min(maxWidthPt, Math.round(widthPx * PX_TO_PT * 100) / 100) : maxWidthPt
  return { kind: 'image', dataUri: resolved.src, widthPt, alt: String(node.attrs.alt ?? resolved.alt ?? ''), ...(align ? { align } : {}) }
}

interface Ctx {
  readonly resolution: Resolution
  readonly maxWidthPt: number
}

// A textblock's inline content: text runs, split around images (PDF images are blocks).
function textblock(node: ProseNode, ctx: Ctx, make: (runs: TextRun[]) => PdfBlock): PdfBlock[] {
  const out: PdfBlock[] = []
  let runs: TextRun[] = []
  const align = alignmentOf(node)
  let images = 0
  node.forEach((child) => {
    if (child.isText) runs.push(runOf(child.text ?? '', child.marks))
    else if (child.type === nodes.hard_break) runs.push({ text: '\n' })
    else if (child.type === nodes.image) {
      const block = imageBlock(child, ctx.resolution, ctx.maxWidthPt, align)
      if (!block) return
      if (runs.length > 0) out.push(make(runs))
      runs = []
      out.push(block)
      images++
    }
  })
  if (runs.length > 0 || images === 0) out.push(make(runs))
  return out
}

const MAX_SPAN = 1000
const spanOf = (value: unknown): number => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_SPAN) : 1
}
// pdfmake's default cell padding, both sides.
const CELL_PADDING_PT = 8
const MIN_CELL_WIDTH_PT = 24

function tableOf(table: ProseNode, ctx: Ctx): PdfBlock | null {
  if (table.childCount === 0) return null
  let columns = 1
  table.forEach((row) => {
    let width = 0
    row.forEach((cell) => (width += spanOf(cell.attrs.colspan)))
    columns = Math.max(columns, width)
  })
  const rows: PdfCell[][] = []
  let headerRows = 0
  let leading = true
  table.forEach((row) => {
    const cells: PdfCell[] = []
    let allHeaders = row.childCount > 0
    row.forEach((cell) => {
      const colSpan = spanOf(cell.attrs.colspan)
      const header = cell.type === nodes.table_header
      if (!header) allHeaders = false
      const inner: Ctx = { ...ctx, maxWidthPt: Math.max(MIN_CELL_WIDTH_PT, (ctx.maxWidthPt * colSpan) / columns - CELL_PADDING_PT) }
      const blocks: PdfBlock[] = []
      cell.forEach((child) => blocks.push(...blocksOf(child, inner)))
      const fill = safeColour(cell.attrs.background)
      const borderColor = safeColour(cell.attrs.borderColor)
      const borders = cellSides(table.attrs.layout, cell.attrs.borders)
      cells.push({ blocks, colSpan, rowSpan: spanOf(cell.attrs.rowspan), ...(header ? { header: true } : {}), ...(fill ? { fill } : {}), ...(borderColor ? { borderColor } : {}), ...(borders ? { borders } : {}) })
    })
    if (leading && allHeaders) headerRows++
    else leading = false
    rows.push(cells)
  })
  return { kind: 'table', headerRows, rows }
}

const HEADING_LEVELS = [1, 2, 3] as const
const headingLevel = (value: unknown): 1 | 2 | 3 => HEADING_LEVELS.find((level) => level === Number(value)) ?? 3

function blocksOf(node: ProseNode, ctx: Ctx): PdfBlock[] {
  if (node.type === nodes.paragraph) {
    const align = alignmentOf(node)
    return textblock(node, ctx, (runs) => ({ kind: 'paragraph', runs, ...(align ? { align } : {}) }))
  }
  if (node.type === nodes.heading) {
    const align = alignmentOf(node)
    return textblock(node, ctx, (runs) => ({ kind: 'heading', level: headingLevel(node.attrs.level), runs, ...(align ? { align } : {}) }))
  }
  if (node.type === nodes.table) {
    const table = tableOf(node, ctx)
    return table ? [table] : []
  }
  // Anything else holding blocks (never left after rendering, but harmless): its blocks.
  const out: PdfBlock[] = []
  node.forEach((child) => out.push(...blocksOf(child, ctx)))
  return out
}

// The document's pages, each starting a new PDF page.
export function toPdfContent(doc: ProseNode, resolution: Resolution, { title, createdAt, page = 'A4', marginMm: marginOption, footer }: PdfContentOptions): PdfContent {
  const rendered = renderDocument(doc, resolution)
  const { sheet, marginMm } = sheetOf(page, marginOption)
  const ctx: Ctx = { resolution, maxWidthPt: sheet.width - 2 * mm(marginMm) }
  const pages: PdfBlock[][] = []
  rendered.forEach((sheet) => {
    const content: PdfBlock[] = []
    sheet.forEach((child) => content.push(...blocksOf(child, ctx)))
    pages.push(content)
  })
  const body = pages.flatMap((content, index): PdfBlock[] => (index === 0 ? content : [{ kind: 'pageBreak' }, ...content]))
  const closing: PdfBlock[] = footer ? [{ kind: 'paragraph', runs: [{ text: footer, italic: true }], size: 8 }] : []
  return { title, page: sheet, marginMm, ...(createdAt ? { createdAt } : {}), blocks: [...body, ...closing] }
}
