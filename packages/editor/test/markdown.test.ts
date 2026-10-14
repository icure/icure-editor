import { describe, expect, it } from 'vitest'

import { toMarkdown } from '../src/output/markdown.ts'
import { resolveDocument } from '../src/resolve.ts'
import { aligned, cell, doc, fakeProvider, field, image, page, paragraph, PNG_DATA_URI, repeat, row, table, text } from './helpers.ts'

const bold = { type: 'strong' }
const italic = { type: 'em' }

describe('Markdown output', () => {
  it('writes headings, paragraphs, emphasis, line breaks and one thematic break per page', async () => {
    const document = doc(
      page(
        { type: 'heading', attrs: { level: 2 }, content: [text('Welcome')] },
        aligned('center', text('Dear '), field('name'), text(', you are '), text('registered ', [bold]), text('today', [bold, italic]), text('.'), { type: 'hard_break' }, text('See you.')),
        paragraph(),
        paragraph(text('underlined', [{ type: 'underlined' }, { type: 'color', attrs: { color: '#aa0000' } }])),
      ),
      page(paragraph(text('Page 2'))),
    )
    const r = await resolveDocument(document, fakeProvider({ fields: { name: 'Alex' } }))
    expect(toMarkdown(document, r)).toBe('## Welcome\n\nDear Alex, you are **registered *today***.\\\nSee you.\n\nunderlined\n\n---\n\nPage 2\n')
  })

  it('escapes values so they stay text, and writes expressions on demand', async () => {
    const document = doc(page(paragraph(field('note')), paragraph(field('heading')), paragraph(field('item')), paragraph(field('number')), paragraph(field('phone'))))
    const r = await resolveDocument(document, fakeProvider({ fields: { note: '*not bold* [link](x) <b>', heading: '# Title', item: '- item', number: '1. first', phone: '+00 000' } }))
    expect(toMarkdown(document, r)).toBe('\\*not bold\\* \\[link\\](x) \\<b\\>\n\n\\# Title\n\n\\- item\n\n1\\. first\n\n+00 000\n')
    expect(toMarkdown(document, r, { mode: 'expressions' })).toBe('{note}\n\n{heading}\n\n{item}\n\n{number}\n\n{phone}\n')
  })

  it('writes a repeated table as a GFM table, header row once', async () => {
    const document = doc(page(repeat('lines', table(row(cell('table_header', text('Item')), cell('table_header', text('Price'))), row(cell('table_cell', field('item.name')), cell('table_cell', field('item.price')))))))
    const r = await resolveDocument(document, fakeProvider({ repeats: { lines: { items: [{ 'item.name': 'Tea | green', 'item.price': '3' }, { 'item.name': 'Cake', 'item.price': '5' }], itemFields: ['item.name', 'item.price'] } } }))
    expect(toMarkdown(document, r)).toBe('| Item | Price |\n| --- | --- |\n| Tea \\| green | 3 |\n| Cake | 5 |\n')
  })

  it('writes resolved images with their description, or leaves them out', async () => {
    const document = doc(page(paragraph(image('logo', 'Logo'), image('gone'))))
    const r = await resolveDocument(document, fakeProvider({ images: { logo: PNG_DATA_URI } }))
    expect(toMarkdown(document, r)).toBe(`![Logo](${PNG_DATA_URI})\n`)
    expect(toMarkdown(document, r, { images: false })).toBe('')
  })
})
