import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'

import { bodyTableRow, dropEmptyZones, editingKey, editingPlugin, editingTarget, setRowZone, templateBlocks, withAllZones } from '../src/editing.ts'
import { editorSchema } from '../src/schema.ts'
import { cell, doc, field, page, paragraph, repeat, row, table, text, zoned, zoneRow } from './helpers.ts'

const node = (json: object) => editorSchema.nodeFromJSON(json)
const zoneNames = (repeatNode: ReturnType<typeof node>) => repeatNode.content.content.map((zone) => zone.type.name)

// A state over `root` with the cursor in the first textblock containing `marker`.
function stateAt(root: ReturnType<typeof node>, marker: string): EditorState {
  let at = -1
  root.descendants((n, pos) => {
    if (at < 0 && n.isTextblock && n.textContent.includes(marker)) at = pos + 1
    return at < 0
  })
  const state = EditorState.create({ doc: root })
  return state.apply(state.tr.setSelection(TextSelection.create(root, at)))
}

describe('zones while editing a block', () => {
  it('adds the missing header and footer, each one empty paragraph, and drops them again when left empty', () => {
    const block = node(repeat('list.items', paragraph(field('item.name'))))
    const all = withAllZones(block)
    expect(zoneNames(all)).toEqual(['repeat_header', 'repeat_body', 'repeat_footer'])
    expect(all.child(0).childCount).toBe(1)
    expect(all.child(0).textContent).toBe('')
    all.check()
    expect(dropEmptyZones(all).eq(block)).toBe(true)
  })

  it('keeps a header or footer with content, and never drops the body', () => {
    const block = node(zoned('list.items', { header: [paragraph(text('Head'))], body: [paragraph()], footer: [paragraph(text('Foot'))] }))
    expect(withAllZones(block).eq(block)).toBe(true)
    expect(zoneNames(dropEmptyZones(withAllZones(node(repeat('list.items', paragraph())))))).toEqual(['repeat_body'])
    expect(zoneNames(dropEmptyZones(block))).toEqual(['repeat_header', 'repeat_body', 'repeat_footer'])
  })

  it('lists the blocks of every page of a template', () => {
    expect(templateBlocks(doc(page(paragraph(text('A'))), page(paragraph(text('B')), paragraph(text('C'))))).map((b) => b.textContent)).toEqual(['A', 'B', 'C'])
  })
})

describe('row zones of a block’s table', () => {
  const block = node(repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), row(cell('table_cell', text('item'))))))

  it('makes the row under the cursor a footer, header or repeated row', () => {
    let state = stateAt(block, 'item')
    expect(bodyTableRow(state)?.node.attrs.zone).toBe('body')
    for (const zone of ['footer', 'header', 'body'] as const) {
      expect(setRowZone(zone)(state, (tr) => (state = state.apply(tr)))).toBe(true)
      expect(bodyTableRow(state)?.node.attrs.zone).toBe(zone)
    }
  })

  it('does nothing in a table outside a block, or beside another block in the body', () => {
    const plain = doc(page(table(row(cell('table_cell', text('item'))))))
    expect(bodyTableRow(stateAt(plain, 'item'))).toBeNull()
    expect(setRowZone('header')(stateAt(plain, 'item'))).toBe(false)
    const mixed = node(repeat('list.items', paragraph(text('lead')), table(row(cell('table_cell', text('item'))))))
    expect(setRowZone('header')(stateAt(mixed, 'item'))).toBe(false)
  })
})

describe('the block being edited', () => {
  it('is marked by a decoration that follows the document, and cleared on close', () => {
    const start = doc(page(paragraph(text('Before')), repeat('list.items', paragraph(field('item.name')))))
    let state = EditorState.create({ doc: start, plugins: [editingPlugin()] })
    expect(editingTarget(state)).toBeNull()
    const session = { id: 1 }
    state = state.apply(state.tr.setMeta(editingKey, { open: { pos: 9, session } }))
    expect(editingTarget(state)).toEqual({ pos: 9, session })
    state = state.apply(state.tr.insertText('More ', 2))
    expect(editingTarget(state)?.pos).toBe(14)
    state = state.apply(state.tr.setMeta(editingKey, { close: true }))
    expect(editingTarget(state)).toBeNull()
  })
})

describe('pagination while a block is open', () => {
  it('moves no block until the block is closed', async () => {
    const { EditorView } = await import('prosemirror-view')
    const { reflow } = await import('../src/pagination.ts')
    const overflowing = { clientHeight: 100, scrollHeight: 200 }
    const restore = (['clientHeight', 'scrollHeight'] as const).map((prop) => {
      const original = Object.getOwnPropertyDescriptor(Element.prototype, prop)!
      Object.defineProperty(Element.prototype, prop, { configurable: true, get(this: Element) { return this.classList.contains('ie-page') ? overflowing[prop] : 0 } })
      return () => Object.defineProperty(Element.prototype, prop, original)
    })
    try {
      const start = doc(page(paragraph(text('A')), repeat('list.items', paragraph(field('item.name')))))
      const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: start, plugins: [editingPlugin()] }) })
      view.dispatch(view.state.tr.setMeta(editingKey, { open: { pos: 4, session: {} } }))
      reflow(view)
      expect(view.state.doc.childCount).toBe(1)
      view.dispatch(view.state.tr.setMeta(editingKey, { close: true }))
      reflow(view)
      expect(view.state.doc.childCount).toBeGreaterThan(1)
      view.destroy()
    } finally {
      restore.forEach((undo) => undo())
    }
  })
})
