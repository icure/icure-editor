import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'

import { insertField, insertImage, insertRepeat, insertTemplate, selectedImage, selectedKey, setAlignment, updateSelectedImage } from '../src/commands.ts'
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
    const tableNode = tabled.doc.child(0).child(1).child(0)
    expect(tableNode.type.name).toBe('table')
    expect(tableNode.child(0).child(0).type.name).toBe('table_header')
    expect(tableNode.textContent).toBe('A')
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
