// The PDF path: pdfmake's browser build with its bundled Roboto fonts, locked down by the
// library (no URL, no local file).
import { mm, PAGE_SIZES, preparePdfmake, renderPdf, toPdfContent, toPdfDefinition, withPdfImages, type EditorNode, type PageFormat, type PageSize, type PdfmakeInstance, type Resolution } from '@icure/editor'

const ROBOTO = { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
let ready: Promise<PdfmakeInstance> | null = null

async function pdfmake(): Promise<PdfmakeInstance> {
  ready ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(([lib, fonts]) => preparePdfmake(lib.default as PdfmakeInstance, { files: fonts.default, families: { Roboto: ROBOTO } }))
  return ready
}

// The PDF knows a few fixed portrait sizes: the form's sheet if it is one of them, else A4.
const pdfPage = (page: PageFormat): PageSize => (Object.keys(PAGE_SIZES) as PageSize[]).find((size) => Math.abs(PAGE_SIZES[size].width - mm(page.widthMm)) < 1 && Math.abs(PAGE_SIZES[size].height - mm(page.heightMm)) < 1) ?? 'A4'

export async function documentPdf(doc: EditorNode, resolution: Resolution, title: string, createdAt: Date, page: PageFormat): Promise<Uint8Array> {
  const content = toPdfContent(doc, await withPdfImages(resolution), { title, createdAt, page: pdfPage(page), marginMm: page.marginMm })
  return renderPdf(await pdfmake(), toPdfDefinition(content, { fontFamily: 'Roboto' }))
}
