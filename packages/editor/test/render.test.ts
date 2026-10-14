import { describe, expect, it } from 'vitest'

import { renderBlocks, renderDocument, templateOf } from '../src/render.ts'
import { resolveDocument } from '../src/resolve.ts'
import { cell, doc, fakeProvider, field, page, paragraph, repeat, row, table, text } from './helpers.ts'

const texts = (nodes: readonly { readonly textContent: string }[]) => nodes.map((node) => node.textContent)
const ALLERGIES = { items: [{ 'item.name': 'Peanuts' }, { 'item.name': 'Pollen' }], itemFields: ['item.name', 'item.since'] }

async function blocksOf(content: object[], items = ALLERGIES.items) {
  const document = doc(page(repeat('list.items', ...content)))
  const resolution = await resolveDocument(document, fakeProvider({ fields: { 'person.lastName': 'Doe' }, repeats: { 'list.items': { items, itemFields: ALLERGIES.itemFields } } }))
  return { node: document.child(0).child(0), resolution }
}

describe('repeating block expansion', () => {
  it('repeats the block content for each item, in order', async () => {
    const { node, resolution } = await blocksOf([paragraph(text('– '), field('item.name'))])
    expect(texts(renderBlocks(node, resolution))).toEqual(['– Peanuts', '– Pollen'])
  })

  it('draws nothing for an empty set', async () => {
    const { node, resolution } = await blocksOf([paragraph(field('item.name'))], [])
    expect(renderBlocks(node, resolution)).toEqual([])
  })

  it('fills a non-item field from the document and marks a missing item value', async () => {
    const { node, resolution } = await blocksOf([paragraph(field('item.name'), text(' '), field('item.since'), text(' '), field('person.lastName'))], [{ 'item.name': 'Pollen' }])
    expect(texts(renderBlocks(node, resolution))).toEqual(['Pollen — Doe'])
    // In the output, a missing item value prints nothing.
    expect(renderDocument(doc(page(repeat('list.items', paragraph(field('item.name'), text(' '), field('item.since'))))), resolution).textContent).toBe('Pollen ')
  })

  it('keeps a table header once and repeats its body rows per item', async () => {
    const { node, resolution } = await blocksOf([table(row(cell('table_header', text('Name'))), row(cell('table_cell', field('item.name'))))], [{ 'item.name': 'A' }, { 'item.name': 'B' }, { 'item.name': 'C' }])
    const [expanded, ...rest] = renderBlocks(node, resolution)
    expect(rest).toEqual([])
    expect(expanded!.childCount).toBe(4)
    expect(expanded!.textContent).toBe('NameABC')
    expanded!.check()
  })

  it('does not draw a table without items, even with its header', async () => {
    const { node, resolution } = await blocksOf([table(row(cell('table_header', text('Name'))), row(cell('table_cell', field('item.name'))))], [])
    expect(renderBlocks(node, resolution)).toEqual([])
  })

  it('shows the block template with its expressions', async () => {
    const { node, resolution } = await blocksOf([paragraph(text('– '), field('item.name'))])
    expect(texts(templateOf(node, resolution))).toEqual(['– {item.name}'])
  })

  it('never evaluates a field name: an unknown name stays its expression', async () => {
    const { node, resolution } = await blocksOf([paragraph(field('constructor'))])
    expect(texts(renderBlocks(node, resolution))).toEqual(['{constructor}', '{constructor}'])
  })

  it('shows an unresolved block as written in the editor and prints nothing for it', async () => {
    const document = doc(page(paragraph(text('Before')), repeat('unknown.source', paragraph(field('item.name')))))
    const resolution = await resolveDocument(document, fakeProvider({}))
    expect(texts(renderBlocks(document.child(0).child(1), resolution))).toEqual(['{item.name}'])
    const rendered = renderDocument(document, resolution)
    expect(rendered.textContent).toBe('Before')
    rendered.check()
  })

  it('keeps a page valid when its only block renders to nothing', async () => {
    const document = doc(page(repeat('list.items', paragraph(field('item.name')))))
    const resolution = await resolveDocument(document, fakeProvider({ repeats: { 'list.items': { items: [] } } }))
    const rendered = renderDocument(document, resolution)
    rendered.check()
    expect(rendered.child(0).child(0).type.name).toBe('paragraph')
  })
})
