// PDF content → a pdfmake document definition, and its rendering with a pdfmake instance the host
// supplies (pdfmake is an optional peer: the browser build in the page or a worker, the Node build in
// tests). Nothing is fetched: fonts come from pdfmake's virtual file system, images are inline
// `data:` URIs, and every URL and local path is refused.
import { mm, PAGE_SIZES, type PdfBlock, type PdfContent, type TextRun } from './pdfContent.ts'

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

function runNode(r: TextRun, fonts: Readonly<Record<string, string>>): DocNode {
  const font = r.font ? fonts[r.font] : undefined
  return {
    text: r.text,
    ...(r.bold ? { bold: true } : {}),
    ...(r.italic ? { italics: true } : {}),
    ...(r.underline ? { decoration: 'underline' } : {}),
    ...(r.sizePt ? { fontSize: r.sizePt } : {}),
    ...(r.color ? { color: r.color } : {}),
    ...(font ? { font } : {}),
  }
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
        const columns = Math.max(b.header.length, ...b.rows.map((row) => row.length), 1)
        const pad = (row: readonly string[]) => [...row, ...Array<string>(columns - row.length).fill('')]
        const body = [...(b.header.length > 0 ? [pad(b.header).map((h) => ({ text: h, bold: true, fillColor: HEADER_FILL }))] : []), ...b.rows.map((row) => pad(row).map((cell) => ({ text: cell })))]
        return {
          table: { headerRows: b.header.length > 0 ? 1 : 0, dontBreakRows: true, widths: Array(columns).fill('*'), body },
          layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
          margin: [0, 0, 0, SPACE_AFTER],
        }
      }
      case 'image':
        return { image: imageName(b.dataUri), ...(b.widthPt ? { width: b.widthPt } : {}), ...(b.align && b.align !== 'justify' ? { alignment: b.align } : {}), margin: [0, 0, 0, SPACE_AFTER] }
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
