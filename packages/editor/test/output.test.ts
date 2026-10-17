import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { htmlDocumentCss, toHtml, toHtmlDocument } from '../src/output/html.ts'
import { preparePdfmake, renderPdf, toPdfDefinition, type PdfmakeInstance } from '../src/output/pdf.ts'
import { pdfPageOf, toPdfContent, type PdfBlock } from '../src/output/pdfContent.ts'
import { documentFileName } from '../src/output/browser.ts'
import { resolveDocument, type Resolution } from '../src/resolve.ts'
import { aligned, cell, doc, fakeProvider, field, image, page, paragraph, PNG_DATA_URI, repeat, row, table, text } from './helpers.ts'

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
    expect(content.page).toEqual({ width: 595.28, height: 841.89 })
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

  it('prints a landscape format: sheet, margins and content width follow it', async () => {
    const document = doc(page(paragraph(image('wide', '', 3000))))
    const r = await resolveDocument(document, fakeProvider({ images: { wide: PNG_DATA_URI } }))
    const content = toPdfContent(document, r, { title: 'Landscape', createdAt: AT, ...pdfPageOf({ widthMm: 297, heightMm: 210, marginMm: 10 }) })
    const definition = toPdfDefinition(content)
    expect(definition.pageSize).toEqual({ width: expect.closeTo(841.89, 1), height: expect.closeTo(595.28, 1) })
    expect(definition.pageMargins).toBeCloseTo(28.35, 1)
    expect(content.blocks[0]).toMatchObject({ kind: 'image', widthPt: expect.closeTo(841.89 - 2 * 28.35, 1) })
    // The format's margin is the default; an explicit one wins.
    expect(toPdfContent(document, r, { title: 'L', page: { widthMm: 297, heightMm: 210, marginMm: 10 } }).marginMm).toBe(10)
    expect(toPdfContent(document, r, { title: 'L', page: { widthMm: 297, heightMm: 210, marginMm: 10 }, marginMm: 15 }).marginMm).toBe(15)
  })

  it('falls back to A4 for a hostile page format', async () => {
    const document = doc(page(paragraph(text('x'))))
    const r = await resolveDocument(document, fakeProvider({}))
    const bad = [{ widthMm: Number.NaN, heightMm: 210, marginMm: 10 }, { widthMm: -1, heightMm: 210, marginMm: 10 }, { widthMm: 1e9, heightMm: 210, marginMm: 10 }, { widthMm: 297, heightMm: 0, marginMm: 10 }, { widthMm: '297', heightMm: 210, marginMm: 10 } as never]
    for (const format of bad) expect(toPdfContent(document, r, { title: 'Hostile', page: format })).toMatchObject({ page: { width: 595.28, height: 841.89 }, marginMm: 20 })
    // The documented path, pdfPageOf, and an explicit option drop a margin that leaves no room too.
    for (const marginMm of [150, -5, Number.NaN]) {
      expect(toPdfContent(document, r, { title: 'Hostile', ...pdfPageOf({ widthMm: 297, heightMm: 210, marginMm }) })).toMatchObject({ marginMm: 20 })
      expect(toPdfContent(document, r, { title: 'Hostile', page: 'A5', marginMm })).toMatchObject({ marginMm: 20 })
    }
    // A margin that leaves no room is dropped, the sheet is kept.
    for (const marginMm of [150, -5, Number.NaN]) expect(toPdfContent(document, r, { title: 'Hostile', page: { widthMm: 297, heightMm: 210, marginMm } })).toMatchObject({ page: { width: expect.closeTo(841.89, 1) }, marginMm: 20 })
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

  describe('tables', () => {
    const RED_BOLD = [{ type: 'strong' }, { type: 'color', attrs: { color: '#aa0000' } }]
    const styled = (type: 'table_cell' | 'table_header', attrs: object, ...content: object[]) => ({ type, attrs, content })
    // A 2x2 table: a header row spanning both columns, then a red bold cell on a background beside a
    // nested frame (a one-cell table) holding a heading and an image.
    const frame = table(row(styled('table_cell', {}, { type: 'heading', attrs: { level: 2 }, content: [text('Frame title', [{ type: 'strong' }])] }, paragraph(image('logo', 'Logo', 40)))))
    const TABLE = doc(
      page(
        table(
          row(styled('table_header', { colspan: 2 }, paragraph(text('Header')))),
          row(styled('table_cell', { background: '#ffee00', borderColor: '#112233' }, aligned('right', text('Due', RED_BOLD))), styled('table_cell', {}, frame)),
        ),
      ),
    )
    const definitionOf = async (document = TABLE) => {
      const r = await resolveDocument(document, fakeProvider({ images: { logo: PNG_DATA_URI } }))
      return toPdfDefinition(toPdfContent(document, r, { title: 'Table', createdAt: AT }))
    }
    type Cell = Record<string, unknown>
    const bodyOf = (node: unknown) => (node as { table: { headerRows: number; body: Cell[][] } }).table

    it('gives each cell its stack, span, fill and border colour, with {} where a cell is covered', async () => {
      const { content } = await definitionOf()
      const { body, headerRows } = bodyOf(content[0])
      expect(headerRows).toBe(1)
      expect(body).toHaveLength(2)
      expect(body[0]![0]).toMatchObject({ colSpan: 2, bold: true, fillColor: '#eeeeee' })
      expect(body[0]![1]).toEqual({})
      expect(body[1]![0]).toMatchObject({
        fillColor: '#ffee00',
        borderColor: ['#112233', '#112233', '#112233', '#112233'],
        stack: [{ text: [{ text: 'Due', bold: true, color: '#aa0000' }], alignment: 'right' }],
      })
      expect(body[1]![0]).not.toHaveProperty('colSpan')
    })

    it('draws a nested table and an image inside a cell', async () => {
      const { content, images } = await definitionOf()
      const outer = bodyOf(content[0]).body[1]![1] as { stack: Cell[] }
      const nested = bodyOf(outer.stack[0]).body[0]![0] as { stack: Cell[] }
      expect(nested.stack[0]).toMatchObject({ text: [{ text: 'Frame title', bold: true }], bold: true, fontSize: 13 })
      expect(nested.stack[1]).toMatchObject({ image: 'image0', width: 30 })
      expect(images).toEqual({ image0: PNG_DATA_URI })
    })

    it('places placeholders for a rowSpan below the cell, shifting the next cells', async () => {
      const document = doc(
        page(
          table(
            row(styled('table_cell', { rowspan: 2 }, paragraph(text('A'))), cell('table_cell', text('B')), cell('table_cell', text('C'))),
            row(cell('table_cell', text('D')), cell('table_cell', text('E'))),
          ),
        ),
      )
      const { body, headerRows } = bodyOf((await definitionOf(document)).content[0])
      expect(headerRows).toBe(0)
      expect(body[0]!.map((c) => (c.stack as { text: { text: string }[] }[] | undefined)?.[0]?.text[0]?.text ?? null)).toEqual(['A', 'B', 'C'])
      expect(body[0]![0]).toMatchObject({ rowSpan: 2 })
      expect(body[1]![0]).toEqual({})
      expect(body[1]!.slice(1).map((c) => (c.stack as { text: { text: string }[] }[])[0]!.text[0]!.text)).toEqual(['D', 'E'])
    })

    it('clamps a rowSpan taller than the table, so the PDF still renders', async () => {
      const document = doc(page(table(row(styled('table_cell', { rowspan: 5 }, paragraph(text('A'))), cell('table_cell', text('B'))), row(cell('table_cell', text('C'))))))
      const definition = await definitionOf(document)
      expect(bodyOf(definition.content[0]).body[0]![0]).toMatchObject({ rowSpan: 2 })
      const bytes = await renderPdf(pdfmake, definition)
      expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })

    it('prints the sides of a cell, and no rule in a layout table but those named', async () => {
      const cells = (type: 'ruled' | 'layout') => ({ type: 'table', ...(type === 'layout' ? { attrs: { layout: 'layout' } } : {}), content: [row(styled('table_cell', {}, paragraph(text('A'))), styled('table_cell', { borders: 'b' }, paragraph(text('B'))), styled('table_cell', { borders: 'x;background:url(y)' }, paragraph(text('C'))))] })
      for (const kind of ['ruled', 'layout'] as const) {
        const document = doc(page(cells(kind)))
        const html = toHtml(document, await resolveDocument(document, fakeProvider({})))
        const host = globalThis.document.createElement('div')
        host.innerHTML = html
        const printed = host.querySelector('td[data-borders]') as HTMLElement
        expect([printed.style.borderTopStyle, printed.style.borderRightStyle, printed.style.borderBottomStyle, printed.style.borderLeftStyle]).toEqual(['none', 'none', 'solid', 'none'])
        expect(host.querySelectorAll('td[data-borders]')).toHaveLength(1)
        expect(html).not.toContain('url(')
        const [plain, bottom, hostile] = bodyOf((await definitionOf(document)).content[0]).body[0]!
        expect(bottom).toMatchObject({ border: [false, false, false, true] })
        // [l, t, r, b]; the default is all four sides in a ruled table (nothing set), none in a layout one.
        if (kind === 'ruled') {
          expect(plain).not.toHaveProperty('border')
          expect(hostile).not.toHaveProperty('border')
        } else {
          expect(plain).toMatchObject({ border: [false, false, false, false] })
          expect(hostile).toMatchObject({ border: [false, false, false, false] })
        }
      }
    })

    it('never prints the editor outline of a layout table', () => {
      const css = htmlDocumentCss()
      expect(css).toContain("table[data-layout='layout'] td")
      expect(css).not.toMatch(/dashed/)
    })

    it('ignores a colour that is not a plain colour', async () => {
      const document = doc(page(table(row(styled('table_cell', { background: 'red; position: fixed', borderColor: 'url(x)' }, paragraph(text('X')))))))
      const cellNode = bodyOf((await definitionOf(document)).content[0]).body[0]![0]!
      expect(cellNode).not.toHaveProperty('fillColor')
      expect(cellNode).not.toHaveProperty('borderColor')
    })

    it('lets a long run of underscores wrap, and keeps the text readable', async () => {
      const document = doc(page(paragraph(text('Name ' + '_'.repeat(40)))))
      const content = toPdfContent(document, await resolveDocument(document, fakeProvider({})), { title: 'Blank' })
      const run = (content.blocks[0] as Extract<PdfBlock, { kind: 'paragraph' }>).runs[0]!
      expect(run.text).toBe('Name ' + '_'.repeat(40))
      const text0 = ((toPdfDefinition(content).content[0] as { text: { text: string }[] }).text[0]!).text
      expect(text0.replaceAll('\u200b', '')).toBe(run.text)
      expect(text0).not.toMatch(/_{5}/)
    })

    it('renders the table to a PDF', async () => {
      const bytes = await renderPdf(pdfmake, await definitionOf())
      expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })
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

  it('sizes each sheet to the page format and prints it on paper of that size with no margin of its own', () => {
    const html = toHtmlDocument(LETTER, resolution, { title: 'Letter', page: { widthMm: 148, heightMm: 210, marginMm: 12 } })
    expect(html).toContain('@page{size:148mm 210mm;margin:0}')
    expect(html).toContain('html,body{margin:0;padding:0}')
    expect(html).toMatch(/\.ie-page\{box-sizing:border-box;width:148mm;height:210mm;[^}]*padding:12mm/)
    expect(html).toMatch(/@media print\{html,body\{width:148mm;[^}]*\}\.ie-page\{margin:0;box-shadow:none\}\}/)
  })

  it('defaults to A4 with 20 mm margins and ignores a page size that is not a length', () => {
    expect(toHtmlDocument(LETTER, resolution, { title: 'Letter' })).toMatch(/@page\{size:210mm 297mm;margin:0\}[\s\S]*padding:20mm/)
    expect(htmlDocumentCss({ widthMm: Number.NaN, heightMm: -1, marginMm: 'x' as never })).toContain('@page{size:210mm 297mm;margin:0}')
  })
})
