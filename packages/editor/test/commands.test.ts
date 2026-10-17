import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import { describe, expect, it } from 'vitest'

import { insertField, repeatContent, insertImage, insertRepeat, insertTemplate, selectedImage, selectedKey, setAlignment, setCellBorders, setTableLayout, updateSelectedImage } from '../src/commands.ts'
import { doc, page, paragraph, text } from './helpers.ts'

function stateAt(pos: number) {
  const state = EditorState.create({ doc: doc(page(paragraph(text('Hello')))) })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
}
const apply = (state: EditorState, command: (s: EditorState, d: (tr: import('prosemirror-state').Transaction) => void) => boolean) => {
  let next = state
  command(state, (tr) => (next = state.apply(tr)))
  return next
}

describe('table commands', () => {
  const tableState = () => {
    const state = EditorState.create({ doc: doc(page({ type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [paragraph(text('A'))] }, { type: 'table_cell', content: [paragraph(text('B'))] }] }] })) })
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
  }

  it('sets the sides of the cell at the cursor, and only that cell', () => {
    const next = apply(tableState(), setCellBorders('b'))
    const row = next.doc.child(0).child(0).child(0)
    expect(row.child(0).attrs.borders).toBe('b')
    expect(row.child(1).attrs.borders).toBe('tblr')
    expect(apply(tableState(), setCellBorders('x;y')).doc.child(0).child(0).child(0).child(0).attrs.borders).toBe('tblr')
  })

  it('reaches every selected cell even when the selection cell already holds the value', () => {
    let state = apply(tableState(), setCellBorders('b'))
    const first = 3
    const second = first + state.doc.nodeAt(first)!.nodeSize
    // The anchor (the selection cell) is the first cell, which already has 'b'.
    state = state.apply(state.tr.setSelection(new CellSelection(state.doc.resolve(first), state.doc.resolve(second))))
    const next = apply(state, setCellBorders('b'))
    const row = next.doc.child(0).child(0).child(0)
    expect([row.child(0).attrs.borders, row.child(1).attrs.borders]).toEqual(['b', 'b'])
  })

  it('sets the preset of the table around the cursor, and does nothing outside a table', () => {
    const next = apply(tableState(), setTableLayout('layout'))
    expect(next.doc.child(0).child(0).attrs.layout).toBe('layout')
    expect(setTableLayout('layout')(stateAt(2))).toBe(false)
  })
})

describe('commands', () => {
  it('inserts a field at the cursor', () => {
    const next = apply(stateAt(4), insertField('person.lastName'))
    expect(next.doc.child(0).child(0).toJSON().content[1]).toEqual({ type: 'variable', attrs: { name: 'person.lastName', label: null } })
  })

  it('refuses a field name with markup', () => {
    expect(insertField('<b>')(stateAt(2))).toBe(false)
  })

  it('inserts a repeating block starting as a line or a table', () => {
    const lines = apply(stateAt(7), insertRepeat({ key: 'list', label: 'List', itemFields: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }] }))
    const block = lines.doc.child(0).child(1)
    expect(block.type.name).toBe('repeat')
    expect(block.textContent).toBe('– , ')
    const tabled = apply(stateAt(7), insertRepeat({ key: 'list', label: 'List', layout: 'table', itemFields: [{ key: 'a', label: 'A' }] }))
    const tableNode = tabled.doc.child(0).child(1).child(0).child(0)
    expect(tableNode.type.name).toBe('table')
    expect(tableNode.child(0).child(0).type.name).toBe('table_header')
    expect(tableNode.textContent).toBe('A')
  })

  it('inserts a valid block for both layouts', () => {
    for (const layout of ['table', 'lines'] as const) {
      const next = apply(stateAt(7), insertRepeat({ key: 'list', label: 'List', layout, itemFields: [{ key: 'a', label: 'A' }] }))
      const block = next.doc.child(0).child(1)
      expect(block.type.name).toBe('repeat')
      expect(block.child(0).type.name).toBe('repeat_body')
      expect(() => next.doc.check()).not.toThrow()
    }
  })

  it('inserts a block whose body is a table with a header row', () => {
    const source = { key: 'list.items', label: 'Items', layout: 'table' as const, itemFields: [{ key: 'item.name', label: 'Name' }] }
    const body = repeatContent(source)
    expect(body.type.name).toBe('repeat_body')
    const table = body.child(0)
    expect([table.child(0).attrs.zone, table.child(1).attrs.zone]).toEqual(['header', 'body'])
    expect(table.child(0).textContent).toBe('Name')
  })

  it('inserts an embedded template as a block', () => {
    const next = apply(stateAt(7), insertTemplate('signature'))
    expect(next.doc.child(0).child(1).toJSON()).toEqual({ type: 'template_ref', attrs: { templateId: 'signature' } })
  })

  it('inserts an image and updates its description and width while it stays selected', () => {
    let state = apply(stateAt(6), insertImage({ imageId: 'logo', alt: 'Logo', width: 5 }))
    const pos = state.selection.from - 1
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
    expect(selectedImage(state)?.node.attrs).toEqual({ imageId: 'logo', alt: 'Logo', width: 16 })
    expect(selectedKey(state)).toBe('image:logo')
    state = apply(state, updateSelectedImage({ alt: 'The logo', width: 300 }))
    expect(selectedImage(state)?.node.attrs).toEqual({ imageId: 'logo', alt: 'The logo', width: 300 })
  })

  it('aligns every paragraph the selection touches', () => {
    const next = apply(stateAt(3), setAlignment('right'))
    expect(next.doc.child(0).child(0).attrs.align).toBe('right')
  })
})
