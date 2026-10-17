// The PDF path: pdfmake's browser build with its bundled Roboto fonts, locked down by the
// library (no URL, no local file).
import { pdfPageOf, preparePdfmake, renderPdf, toPdfContent, toPdfDefinition, withPdfImages, type EditorNode, type PageFormat, type PdfmakeInstance, type Resolution } from '@icure/editor'

const ROBOTO = { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
let ready: Promise<PdfmakeInstance> | null = null

async function pdfmake(): Promise<PdfmakeInstance> {
  ready ??= Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(([lib, fonts]) => preparePdfmake(lib.default as PdfmakeInstance, { files: fonts.default, families: { Roboto: ROBOTO } }))
  return ready
}

export async function documentPdf(doc: EditorNode, resolution: Resolution, title: string, createdAt: Date, page: PageFormat): Promise<Uint8Array> {
  const content = toPdfContent(doc, await withPdfImages(resolution), { title, createdAt, ...pdfPageOf(page) })
  return renderPdf(await pdfmake(), toPdfDefinition(content, { fontFamily: 'Roboto' }))
}
