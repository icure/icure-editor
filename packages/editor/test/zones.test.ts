import { describe, expect, it } from 'vitest'

import { toHtml } from '../src/output/html.ts'
import { renderBlocks, renderDocument, renderRepeatParts } from '../src/render.ts'
import { resolveDocument } from '../src/resolve.ts'
import { cell, doc, embed, docJson, fakeProvider, field, page, paragraph, repeat, table, text, zoned, zoneRow } from './helpers.ts'

const texts = (nodes: readonly { readonly textContent: string }[]) => nodes.map((node) => node.textContent)
const LIST = (...names: string[]) => ({ 'list.items': { items: names.map((name) => ({ 'item.name': name })), itemFields: ['item.name'] } })
const block = zoned('list.items', { header: [paragraph(text('Header'))], body: [paragraph(text('– '), field('item.name'))], footer: [paragraph(text('Footer'))] })

async function draw(content: object, repeats: object, fields: Record<string, string> = {}) {
  const document = doc(page(content))
  const resolution = await resolveDocument(document, fakeProvider({ fields, repeats: repeats as never }))
  return { document, resolution, node: document.child(0).child(0) }
}

describe('repeating block zones', () => {
  it('draws the header once, the body per item, the footer once', async () => {
    const { node, resolution } = await draw(block, LIST('A', 'B'))
    expect(texts(renderBlocks(node, resolution))).toEqual(['Header', '– A', '– B', 'Footer'])
  })

  it('draws the header and footer of an empty list, and says it is empty', async () => {
    const { node, resolution, document } = await draw(block, LIST())
    expect(renderDocument(document, resolution).textContent).toBe('HeaderFooter')
    expect(renderRepeatParts(node, resolution).empty).toBe(true)
  })

  it('splits a zoned block into header, body and footer; an unresolved one is not empty', async () => {
    const resolved = await draw(block, LIST('A', 'B'))
    const parts = renderRepeatParts(resolved.node, resolved.resolution)
    expect([texts(parts.header), texts(parts.body), texts(parts.footer), parts.empty]).toEqual([['Header'], ['– A', '– B'], ['Footer'], false])
    const unresolved = await draw(block, {})
    const shown = renderRepeatParts(unresolved.node, unresolved.resolution)
    expect([texts(shown.header), texts(shown.body), texts(shown.footer), shown.empty]).toEqual([['Header'], ['– {item.name}'], ['Footer'], false])
  })

  it('prints nothing for an unresolved block and shows every zone as written in the editor', async () => {
    const { node, resolution, document } = await draw(block, {})
    expect(renderDocument(document, resolution).textContent).toBe('')
    expect(texts(renderBlocks(node, resolution))).toEqual(['Header', '– {item.name}', 'Footer'])
  })

  it('keeps a body table header and footer rows once, around a row per item', async () => {
    const t = repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), zoneRow('body', cell('table_cell', field('item.name'))), zoneRow('footer', cell('table_cell', text('End')))))
    const { node, resolution } = await draw(t, LIST('A', 'B'))
    const [expanded] = renderBlocks(node, resolution)
    expect(expanded!.textContent).toBe('NameABEnd')
    expanded!.check()
  })

  it('keeps an empty table header and footer rows, and drops a table left with no row', async () => {
    const withRows = repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), zoneRow('body', cell('table_cell', field('item.name'))), zoneRow('footer', cell('table_cell', text('End')))))
    const empty = await draw(withRows, LIST())
    expect(texts(renderBlocks(empty.node, empty.resolution))).toEqual(['NameEnd'])
    const bare = await draw(repeat('list.items', table(zoneRow('body', cell('table_cell', field('item.name'))))), LIST())
    const rendered = renderDocument(bare.document, bare.resolution)
    rendered.check()
    expect(rendered.textContent).toBe('')
  })

  it('prints no row zone: zones belong to the template', async () => {
    const t = repeat('list.items', table(zoneRow('header', cell('table_header', text('N'))), zoneRow('body', cell('table_cell', field('item.name')))))
    const { document, resolution } = await draw(t, LIST('A'))
    expect(toHtml(document, resolution)).not.toContain('data-zone')
  })

  it('reads an item-field name in the footer as a document field', async () => {
    const t = zoned('list.items', { body: [paragraph(field('item.name'))], footer: [paragraph(field('item.name'))] })
    const { node, resolution, document } = await draw(t, LIST('A'))
    expect(renderDocument(document, resolution).textContent).toBe('A')
    expect(texts(renderBlocks(node, resolution))).toEqual(['A', '{item.name}'])
  })
})

describe('nested blocks', () => {
  const DAYS = {
    'programme.days': {
      items: [
        { 'day.label': 'Saturday', 'day.sessions': { items: [{ 'session.title': 'Opening' }, { 'session.title': 'Tour' }] } },
        { 'day.label': 'Sunday' },
      ],
      itemFields: ['day.label'],
    },
  }
  const programme = repeat('programme.days', paragraph(field('day.label')), zoned('day.sessions', { body: [paragraph(text('– '), field('session.title'), text(' ('), field('day.label'), text(')'))], footer: [paragraph(text('End of '), field('day.label'))] }))

  it('fills an inner body from its item and the outer item, and an inner footer from the outer item', async () => {
    const { document, resolution } = await draw(programme, DAYS)
    const lines = texts(renderDocument(document, resolution).child(0).content.content)
    expect(lines).toEqual(['Saturday', '– Opening (Saturday)', '– Tour (Saturday)', 'End of Saturday', 'Sunday', 'End of Sunday'])
  })

  it('does not fall back to an outer value when the declaring item lacks it', async () => {
    const outer = { 'outer.items': { items: [{ name: 'Outer', 'inner.items': { items: [{}], itemFields: ['name'] } }], itemFields: ['name'] } }
    const { document, resolution } = await draw(repeat('outer.items', repeat('inner.items', paragraph(text('['), field('name'), text(']')))), outer)
    expect(renderDocument(document, resolution).textContent).toBe('[]')
  })

  it('fills an embedded template in a body from the item', async () => {
    const document = doc(page(repeat('list.items', embed('line'))))
    const resolution = await resolveDocument(document, fakeProvider({ repeats: LIST('A', 'B') as never, templates: { line: { name: 'Line', content: docJson(page(paragraph(text('* '), field('item.name')))) } } }))
    expect(renderDocument(document, resolution).textContent).toBe('* A* B')
  })
})
