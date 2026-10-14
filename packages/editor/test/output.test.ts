import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { toHtml, toHtmlDocument } from '../src/output/html.ts'
import { preparePdfmake, renderPdf, toPdfDefinition, type PdfmakeInstance } from '../src/output/pdf.ts'
import { toPdfContent } from '../src/output/pdfContent.ts'
import { documentFileName } from '../src/output/browser.ts'
import { resolveDocument, type Resolution } from '../src/resolve.ts'
import { aligned, doc, fakeProvider, field, image, page, paragraph, PNG_DATA_URI, repeat, text } from './helpers.ts'

const require = createRequire(import.meta.url)
let pdfmake: PdfmakeInstance

// pdfmake's Node build with its own Roboto files, loaded into its virtual file system.
beforeAll(async () => {
  const fontsDir = join(dirname(require.resolve('pdfmake/package.json')), 'fonts/Roboto')
  const names = { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' }
  const files = Object.fromEntries(await Promise.all(Object.values(names).map(async (name) => [name, new Uint8Array(await readFile(join(fontsDir, name)))] as const)))
  pdfmake = preparePdfmake(require('pdfmake') as PdfmakeInstance, { files, families: { Roboto: names } })
})

const AT = new Date(Date.UTC(2026, 9, 6, 9, 30))
const LETTER = doc(
  page(
    { type: 'heading', attrs: { level: 1, align: 'center' }, content: [text('Confirmation')] },
    aligned('justify', text('I confirm that '), field('person.lastName'), text(' '), field('person.firstName'), text(' is '), text('registered', [{ type: 'strong' }, { type: 'underlined' }, { type: 'size', attrs: { size: '16px' } }, { type: 'color', attrs: { color: '#aa0000' } }]), { type: 'hard_break' }, text('today.')),
    aligned('inherit', field('person.id')),
  ),
  page(aligned('inherit', text('Page 2'))),
)
let resolution: Resolution
beforeAll(async () => {
  resolution = await resolveDocument(LETTER, fakeProvider({ fields: { 'person.lastName': 'DOE', 'person.firstName': 'Alex' } }))
})

describe('PDF output', () => {
  it('renders every page, its alignments, marks and filled fields', () => {
    const content = toPdfContent(LETTER, resolution, { title: 'Confirmation', createdAt: AT })
    expect(content.page).toBe('A4')
    expect(content.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'paragraph', 'pageBreak', 'paragraph'])
    const [heading, body, unresolved] = content.blocks
    expect(heading).toMatchObject({ kind: 'heading', level: 1, align: 'center' })
    expect(body).toMatchObject({ kind: 'paragraph', align: 'justify' })
    const runs = body!.kind === 'paragraph' ? body!.runs : []
    expect(runs.map((r) => r.text).join('')).toBe('I confirm that DOE Alex is registered\ntoday.')
    expect(runs.find((r) => r.text === 'registered')).toEqual({ text: 'registered', bold: true, underline: true, sizePt: 12, color: '#aa0000' })
    // An unresolved field prints nothing (the editor lists it).
    expect(unresolved).toEqual({ kind: 'paragraph', runs: [] })
  })

  it('closes with a footer line when asked', () => {
    const content = toPdfContent(LETTER, resolution, { title: 'Confirmation', footer: 'Issued by the front desk', createdAt: AT })
    expect(content.blocks.at(-1)).toEqual({ kind: 'paragraph', runs: [{ text: 'Issued by the front desk', italic: true }], size: 8 })
  })

  it('draws a repeating block for its items', async () => {
    const document = doc(page(repeat('list', aligned('inherit', text('– '), field('name')))))
    const r = await resolveDocument(document, fakeProvider({ repeats: { list: { items: [{ name: 'Pollen' }, { name: 'Dust' }], itemFields: ['name'] } } }))
    const content = toPdfContent(document, r, { title: 'List', createdAt: AT })
    expect(content.blocks.map((b) => (b.kind === 'paragraph' ? b.runs.map((x) => x.text).join('') : b.kind))).toEqual(['– Pollen', '– Dust'])
  })

  it('places an image as its own block, sized in points and capped by the page width', async () => {
    const document = doc(page(aligned('center', text('Logo: '), image('logo', 'Company logo', 200), text(' end')), paragraph(image('wide', '', 1600)), paragraph(image('missing'))))
    const r = await resolveDocument(document, fakeProvider({ images: { logo: PNG_DATA_URI, wide: PNG_DATA_URI } }))
    const content = toPdfContent(document, r, { title: 'Images', createdAt: AT })
    expect(content.blocks.map((b) => b.kind)).toEqual(['paragraph', 'image', 'paragraph', 'image', 'paragraph'])
    expect(content.blocks[1]).toEqual({ kind: 'image', dataUri: PNG_DATA_URI, widthPt: 150, alt: 'Company logo', align: 'center' })
    expect(content.blocks[3]).toMatchObject({ kind: 'image', widthPt: expect.closeTo(595.28 - 2 * 56.69, 1) })
    const definition = toPdfDefinition(content)
    expect(definition.images).toEqual({ image0: PNG_DATA_URI })
  })

  it('renders the same document to byte-identical PDFs, one PDF page per page', async () => {
    const render = () => renderPdf(pdfmake, toPdfDefinition(toPdfContent(LETTER, resolution, { title: 'Confirmation', createdAt: AT })))
    const [first, second] = [await render(), await render()]
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true)
    expect(Buffer.from(first).toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2)
  })

  it('embeds an image in the PDF', async () => {
    const document = doc(page(paragraph(image('logo', 'Logo', 64))))
    const r = await resolveDocument(document, fakeProvider({ images: { logo: PNG_DATA_URI } }))
    const bytes = await renderPdf(pdfmake, toPdfDefinition(toPdfContent(document, r, { title: 'Logo', createdAt: AT })))
    expect(Buffer.from(bytes).toString('latin1')).toMatch(/\/Subtype \/Image/)
  })

  it('names the file <yyyy-mm-dd>-<name>-<timestamp>.pdf', () => {
    const at = new Date(2026, 9, 6, 9, 30)
    expect(documentFileName('Éléonore’s report', at)).toBe(`2026-10-06-eleonore-s-report-${at.getTime()}.pdf`)
  })
})

describe('HTML output', () => {
  it('serialises the filled document, values as text and images from the provider', async () => {
    const document = doc(page(paragraph(text('Hi '), field('name'), text(' '), image('logo', 'Logo', 50), image('gone'))))
    const r = await resolveDocument(document, fakeProvider({ fields: { name: '<img src=x onerror=alert(1)>' }, images: { logo: PNG_DATA_URI } }))
    expect(toHtml(document, r)).toBe(`<div class="ie-page"><p>Hi &lt;img src=x onerror=alert(1)&gt; <img class="ie-image" data-image-id="logo" src="${PNG_DATA_URI}" alt="Logo" width="50"><span data-image-id="gone" hidden="hidden"></span></p></div>`)
  })

  it('wraps a standalone file with a restrictive policy and an escaped title', () => {
    const html = toHtmlDocument(LETTER, resolution, { title: '<Confirmation>' })
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('<title>&#60;Confirmation&#62;</title>')
    expect(html).not.toContain('<script')
  })
})
