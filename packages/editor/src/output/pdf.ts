// PDF content → a pdfmake document definition, and its rendering with a pdfmake instance the host
// supplies (pdfmake is an optional peer: the browser build in the page or a worker, the Node build in
// tests). Nothing is fetched: fonts come from pdfmake's virtual file system, images are inline
// `data:` URIs, and every URL and local path is refused.
import { mm, PAGE_SIZES, type PdfBlock, type PdfCell, type PdfContent, type TextRun } from './pdfContent.ts'

const BODY_SIZE = 10
const HEADING_SIZES = { 1: 16, 2: 13, 3: 11 } as const
const SPACE_AFTER = 6
const BORDER = '#6b6b6b'
const HEADER_FILL = '#eeeeee'

export type DocNode = Record<string, unknown>
export interface DocDefinition {
  readonly pageSize: { readonly width: number; readonly height: number }
  readonly pageMargins: number
  readonly info: { readonly title: string; readonly creator: string; readonly creationDate?: Date }
  readonly defaultStyle: DocNode
  readonly images: Readonly<Record<string, string>>
  readonly content: readonly DocNode[]
}

export interface PdfDefinitionOptions {
  // The embedded font family of body text (it must exist in the pdfmake instance's fonts).
  readonly fontFamily?: string
  // The editor's font names mapped to embedded families; a font absent from the map prints in the
  // body family.
  readonly fonts?: Readonly<Record<string, string>>
  readonly creator?: string
}

export const DEFAULT_PDF_FONT = 'Roboto'

// pdfmake breaks lines only at spaces and other break opportunities, so a long blank ("______") would
// overflow its cell or the page. A zero-width space after each group of underscores lets it wrap.
const breakableBlanks = (text: string): string => text.replace(/_{4}(?=_)/g, '$&\u200b')

function runNode(r: TextRun, fonts: Readonly<Record<string, string>>): DocNode {
  const font = r.font ? fonts[r.font] : undefined
  return {
    text: breakableBlanks(r.text),
    ...(r.bold ? { bold: true } : {}),
    ...(r.italic ? { italics: true } : {}),
    ...(r.underline ? { decoration: 'underline' } : {}),
    ...(r.sizePt ? { fontSize: r.sizePt } : {}),
    ...(r.color ? { color: r.color } : {}),
    ...(font ? { font } : {}),
  }
}

// The cells placed on pdfmake's grid: each cell at its first free position, `{}` placeholders on the
// positions it covers (to the right for a colSpan, below for a rowSpan), as pdfmake requires.
function tableGrid(rows: readonly (readonly PdfCell[])[], make: (cell: PdfCell, rowSpan: number) => DocNode): DocNode[][] {
  const grid: (DocNode | undefined)[][] = rows.map(() => [])
  rows.forEach((row, r) => {
    let c = 0
    for (const cell of row) {
      while (grid[r]![c]) c++
      // A rowSpan past the last row is clamped: pdfmake rejects a span that leaves the table.
      const rowSpan = Math.min(cell.rowSpan, rows.length - r)
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) grid[r + dr]![c + dc] = dr === 0 && dc === 0 ? make(cell, rowSpan) : {}
      }
      c += cell.colSpan
    }
  })
  // A hole (a row shorter than the widest) is an empty cell.
  return grid.map((row) => Array.from(row, (node) => node ?? { text: '' }))
}

export function toPdfDefinition(content: PdfContent, { fontFamily = DEFAULT_PDF_FONT, fonts = {}, creator = '@icure/editor' }: PdfDefinitionOptions = {}): DocDefinition {
  const images: Record<string, string> = {}
  const imageName = (dataUri: string): string => {
    const known = Object.entries(images).find(([, uri]) => uri === dataUri)
    if (known) return known[0]
    const name = `image${Object.keys(images).length}`
    images[name] = dataUri
    return name
  }
  const block = (b: Exclude<PdfBlock, { kind: 'pageBreak' }>): DocNode => {
    switch (b.kind) {
      case 'heading':
        return { text: b.runs.map((r) => runNode(r, fonts)), bold: true, fontSize: HEADING_SIZES[b.level], ...(b.align ? { alignment: b.align } : {}), margin: [0, b.level === 1 ? 0 : SPACE_AFTER, 0, SPACE_AFTER] }
      case 'paragraph':
        return { text: b.runs.map((r) => runNode(r, fonts)), ...(b.size ? { fontSize: b.size } : {}), ...(b.align ? { alignment: b.align } : {}), margin: [0, 0, 0, SPACE_AFTER] }
      case 'table': {
        const grid = tableGrid(b.rows, cellNode)
        const columns = Math.max(1, ...grid.map((row) => row.length))
        return {
          table: { headerRows: Math.min(b.headerRows, grid.length), dontBreakRows: true, widths: Array(columns).fill('*'), body: grid.map((row) => [...row, ...Array.from({ length: columns - row.length }, () => ({}))]) },
          layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
          margin: [0, 0, 0, SPACE_AFTER],
        }
      }
      case 'image':
        return { image: imageName(b.dataUri), ...(b.widthPt ? { width: b.widthPt } : {}), ...(b.align && b.align !== 'justify' ? { alignment: b.align } : {}), margin: [0, 0, 0, SPACE_AFTER] }
    }
  }
  const cellNode = (cell: PdfCell, rowSpan: number): DocNode => {
    const stack = cell.blocks.filter((x): x is Exclude<PdfBlock, { kind: 'pageBreak' }> => x.kind !== 'pageBreak').map(block)
    const fillColor = cell.fill ?? (cell.header ? HEADER_FILL : undefined)
    return {
      stack: stack.length > 0 ? stack : [{ text: '' }],
      ...(cell.header ? { bold: true } : {}),
      ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
      ...(rowSpan > 1 ? { rowSpan } : {}),
      ...(fillColor ? { fillColor } : {}),
      ...(cell.borderColor ? { borderColor: [cell.borderColor, cell.borderColor, cell.borderColor, cell.borderColor] } : {}),
      ...(cell.borders ? { border: [...cell.borders] } : {}),
    }
  }
  // A page break is carried by the block after it (pdfmake's `pageBreak: 'before'`).
  const nodes: DocNode[] = []
  let breakBefore = false
  for (const b of content.blocks) {
    if (b.kind === 'pageBreak') {
      breakBefore = nodes.length > 0
      continue
    }
    nodes.push(breakBefore ? { ...block(b), pageBreak: 'before' } : block(b))
    breakBefore = false
  }
  return {
    pageSize: PAGE_SIZES[content.page],
    pageMargins: mm(content.marginMm),
    info: { title: content.title, creator, ...(content.createdAt ? { creationDate: content.createdAt } : {}) },
    defaultStyle: { font: fontFamily, fontSize: BODY_SIZE, lineHeight: 1.15 },
    images,
    content: nodes,
  }
}

// The part of pdfmake 0.3's API used here, common to its browser and Node builds.
export interface PdfmakeInstance {
  readonly virtualfs?: { writeFileSync(name: string, data: Uint8Array | string): void }
  addVirtualFileSystem?(vfs: Record<string, string>): void
  setFonts?(fonts: unknown): void
  addFonts?(fonts: unknown): void
  setUrlAccessPolicy(policy: (url: string) => boolean): void
  setLocalAccessPolicy?(policy: (path: string) => boolean): void
  createPdf(definition: unknown): { getBuffer(): Promise<Uint8Array> }
}

export interface PdfFonts {
  // File name → bytes (Node build) or base64 (browser build's virtual file system).
  readonly files?: Readonly<Record<string, Uint8Array | string>>
  // pdfmake's font descriptors: family → { normal, bold, italics, bolditalics } file names.
  readonly families?: Readonly<Record<string, Readonly<Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>>>>
}

// Locks the instance down (no URL, no local file) and registers the host's fonts.
export function preparePdfmake(pdfmake: PdfmakeInstance, fonts: PdfFonts = {}): PdfmakeInstance {
  for (const [name, data] of Object.entries(fonts.files ?? {})) {
    if (pdfmake.addVirtualFileSystem) pdfmake.addVirtualFileSystem({ [name]: typeof data === 'string' ? data : bytesBase64(data) })
    else pdfmake.virtualfs?.writeFileSync(name, data)
  }
  if (fonts.families) (pdfmake.setFonts ?? pdfmake.addFonts)?.call(pdfmake, fonts.families)
  pdfmake.setUrlAccessPolicy(() => false)
  pdfmake.setLocalAccessPolicy?.(() => false)
  return pdfmake
}

function bytesBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export async function renderPdf(pdfmake: PdfmakeInstance, definition: DocDefinition): Promise<Uint8Array> {
  return new Uint8Array(await pdfmake.createPdf(definition).getBuffer())
}
