import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Node as ProseNode } from 'prosemirror-model'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { EditorDataProvider } from '../src/context.ts'
import { DEFAULT_LABELS } from '../src/labels.ts'
import { DocumentEditor, type DocumentEditorHandle } from '../src/react/DocumentEditor.tsx'
import { cell, docJson, embed, field, page, paragraph, repeat, row, table, text, zoned, zoneRow } from './helpers.ts'

const L = DEFAULT_LABELS
const IE = L.inlineEditing

function provider(overrides: Partial<EditorDataProvider> = {}): EditorDataProvider {
  return {
    listFields: () => [{ key: 'person.lastName', label: 'Last name', group: 'Person' }],
    resolveField: (key) => ({ 'person.lastName': 'Doe' })[key],
    listRepeatSources: () => [{ key: 'list.items', label: 'Items', itemFields: [{ key: 'item.name', label: 'Name' }] }],
    resolveRepeat: (source) => (source === 'list.items' ? { items: [{ 'item.name': 'First' }, { 'item.name': 'Second' }] } : null),
    listTemplates: () => [{ id: 'signature', name: 'Signature' }],
    loadTemplate: (id) => (id === 'signature' ? { id, name: 'Signature', content: docJson(page(paragraph(text('Regards')))) } : null),
    ...overrides,
  }
}

const canvas = () => screen.getByRole('textbox', { name: L.canvas })
const block = () => canvas().querySelector<HTMLElement>('.ie-repeat')!
const LIST = repeat('list.items', paragraph(text('– '), field('item.name')))

async function setup(content: object[], options: { readonly provider?: EditorDataProvider; readonly readOnly?: boolean } = {}) {
  const ref = createRef<DocumentEditorHandle>()
  const onEdit = vi.fn()
  const initial = docJson(page(...content))
  render(<DocumentEditor ref={ref} onEdit={onEdit} initial={initial} provider={options.provider ?? provider()} readOnly={options.readOnly} />)
  await waitFor(() => expect(canvas()).toHaveTextContent('First'))
  return { ref, onEdit, initial: ref.current!.getDocument()!.toJSON() }
}

// The position of the first node of a type in a document.
function posOf(doc: ProseNode, type: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos
    return found < 0
  })
  return found
}

// Types into the first paragraph of a zone of the open block (jsdom can't type into ProseMirror).
function typeInto(view: EditorView, zone: 'repeat_header' | 'repeat_body' | 'repeat_footer', value: string) {
  const at = posOf(view.state.doc, zone) + 2
  act(() => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)).insertText(value)))
}

const area = (name = 'Items') => screen.getByRole('group', { name: IE.editRepeat(name) })
const noArea = (name = 'Items') => expect(screen.queryByRole('group', { name: IE.editRepeat(name) })).toBeNull()

describe('editing a repeating block in place', () => {
  it('opens on double-click with its three zones, freezes the document, and Escape discards', async () => {
    const { ref, onEdit, initial } = await setup([paragraph(text('Intro')), LIST])
    fireEvent.dblClick(block())
    const group = area()
    const editor = within(group).getByRole('textbox', { name: IE.editRepeat('Items') })
    expect(editor).toHaveAttribute('aria-describedby')
    expect(document.getElementById(editor.getAttribute('aria-describedby')!)).toHaveTextContent(IE.hint)
    for (const zone of [IE.header, IE.body, IE.footer]) expect(within(group).getByRole('group', { name: zone })).toBeInTheDocument()
    expect(group.querySelector(`[data-placeholder="${IE.addHeader}"]`)).not.toBeNull()
    expect(group.querySelector(`[data-placeholder="${IE.addFooter}"]`)).not.toBeNull()
    // Fields show as placeholders, not values; an item field is not flagged as unresolved.
    expect(editor).toHaveTextContent('– {item.name}')
    expect(group.querySelector('[data-field="item.name"]')).not.toHaveClass('ie-unresolved-ref')
    expect(canvas()).toHaveAttribute('contenteditable', 'false')
    typeInto(ref.current!.activeView!, 'repeat_body', 'Changed ')
    fireEvent.keyDown(editor, { key: 'Escape', keyCode: 27 })
    noArea()
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
    expect(onEdit).not.toHaveBeenCalled()
    const selection = ref.current!.view!.state.selection
    expect(selection instanceof NodeSelection && selection.node.type.name).toBe('repeat')
    expect(canvas()).toHaveAttribute('contenteditable', 'true')
  })

  it('opens with Enter on the selected block, and Cancel discards', async () => {
    const { ref, initial } = await setup([paragraph(text('Intro')), LIST])
    const view = ref.current!.view!
    act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, posOf(view.state.doc, 'repeat')))))
    fireEvent.keyDown(canvas(), { key: 'Enter', keyCode: 13 })
    typeInto(ref.current!.activeView!, 'repeat_header', 'Head')
    fireEvent.click(within(area()).getByRole('button', { name: IE.cancel }))
    noArea()
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
  })

  it('writes the zones back on Done, drops the empty header, and one undo reverts it', async () => {
    const { ref, onEdit, initial } = await setup([paragraph(text('Intro')), LIST])
    fireEvent.dblClick(block())
    typeInto(ref.current!.activeView!, 'repeat_footer', 'Foot')
    fireEvent.click(within(area()).getByRole('button', { name: IE.done }))
    noArea()
    const written = ref.current!.getDocument()!.child(0).child(1)
    expect(written.content.content.map((zone) => zone.type.name)).toEqual(['repeat_body', 'repeat_footer'])
    expect(written.lastChild!.textContent).toBe('Foot')
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(block()).toHaveTextContent('– First– SecondFoot')
    const selection = ref.current!.view!.state.selection
    expect(selection instanceof NodeSelection && selection.node.type.name).toBe('repeat')
    fireEvent.keyDown(canvas(), { key: 'z', ctrlKey: true })
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
  })

  it('applies with Ctrl+Enter', async () => {
    const { ref } = await setup([LIST])
    fireEvent.dblClick(block())
    typeInto(ref.current!.activeView!, 'repeat_header', 'Head')
    fireEvent.keyDown(within(area()).getByRole('textbox'), { key: 'Enter', keyCode: 13, ctrlKey: true })
    noArea()
    expect(ref.current!.getDocument()!.child(0).child(0).firstChild!.textContent).toBe('Head')
  })

  it('keeps the editing area and its edits when the document is resolved again', async () => {
    const resolveRepeat = vi.fn((source: string) => (source === 'list.items' ? { items: [{ 'item.name': 'First' }] } : null))
    const { ref } = await setup([LIST], { provider: provider({ resolveRepeat }) })
    fireEvent.dblClick(block())
    typeInto(ref.current!.activeView!, 'repeat_body', 'Kept ')
    act(() => ref.current!.refresh())
    await waitFor(() => expect(resolveRepeat).toHaveBeenCalledTimes(2))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(canvas()).toContainElement(area())
    expect(within(area()).getByRole('textbox')).toHaveTextContent('Kept – {item.name}')
  })

  it('opens a block inside the editing area one level at a time; Escape closes the inner one only', async () => {
    await setup([zoned('list.items', { body: [paragraph(field('item.name')), repeat('other.list', paragraph(text('inner')))] })])
    fireEvent.dblClick(block())
    const outer = area()
    fireEvent.dblClick(outer.querySelector<HTMLElement>('.ie-repeat[data-repeat="other.list"]')!)
    const inner = area('other.list')
    expect(outer).toContainElement(inner)
    fireEvent.keyDown(within(inner).getByRole('textbox'), { key: 'Escape', keyCode: 27 })
    noArea('other.list')
    expect(area()).toBeInTheDocument()
  })

  it('closes, and the document is editable again, when the host removes the open block', async () => {
    const { ref } = await setup([paragraph(text('Intro')), LIST])
    fireEvent.dblClick(block())
    expect(canvas()).toHaveAttribute('contenteditable', 'false')
    const view = ref.current!.view!
    const at = posOf(view.state.doc, 'repeat')
    act(() => view.dispatch(view.state.tr.delete(at, at + view.state.doc.nodeAt(at)!.nodeSize)))
    noArea()
    await waitFor(() => expect(canvas()).toHaveAttribute('contenteditable', 'true'))
  })

  it('shows Done and Cancel as icons named by their labels, with a tooltip Escape dismisses first', async () => {
    await setup([LIST])
    fireEvent.dblClick(block())
    const done = within(area()).getByRole('button', { name: IE.done })
    const cancel = within(area()).getByRole('button', { name: IE.cancel })
    for (const button of [done, cancel]) {
      expect(button).toHaveTextContent('')
      expect(button.querySelector('svg')).not.toBeNull()
    }
    act(() => cancel.focus())
    expect(area()).toHaveTextContent(IE.cancel)
    fireEvent.keyDown(cancel, { key: 'Escape', keyCode: 27 })
    expect(area()).not.toHaveTextContent(IE.cancel)
    fireEvent.keyDown(cancel, { key: 'Escape', keyCode: 27 })
    noArea()
  })

  it('cannot be opened when read only', async () => {
    const { ref } = await setup([LIST], { readOnly: true })
    fireEvent.dblClick(block())
    const view = ref.current!.view!
    act(() => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, posOf(view.state.doc, 'repeat')))))
    fireEvent.keyDown(canvas(), { key: 'Enter', keyCode: 13 })
    noArea()
  })
})

// A provider whose signature template lives in a store `saveTemplate` writes.
function templateStore(save?: (id: string, content: unknown) => Promise<void> | void) {
  const store = new Map<string, unknown>([['signature', docJson(page(paragraph(text('Regards'))))]])
  const saveTemplate = save ? vi.fn(save) : undefined
  const p = provider({
    loadTemplate: (id) => (store.has(id) ? { id, name: 'Signature', content: store.get(id) } : null),
    ...(saveTemplate ? { saveTemplate: vi.fn(async (id: string, content: unknown) => { await saveTemplate(id, content); store.set(id, content) }) } : {}),
  })
  return { provider: p, store }
}

const templateArea = () => screen.getByRole('group', { name: IE.editTemplate('Signature') })
const embedded = () => canvas().querySelector<HTMLElement>('.ie-embed')!

async function openSignature(p: EditorDataProvider) {
  const result = await setup([LIST, embed('signature')], { provider: p })
  await waitFor(() => expect(embedded()).toHaveTextContent('Regards'))
  fireEvent.dblClick(embedded())
  const view = result.ref.current!.activeView!
  // Types at the start of the template.
  act(() => view.dispatch(view.state.tr.insertText('Best ')))
  fireEvent.click(within(templateArea()).getByRole('button', { name: IE.done }))
  return result
}

describe('editing an embedded template in place', () => {
  it('opens on double-click with the template, its fields shown as placeholders', async () => {
    const { ref } = await setup([LIST, embed('signature')], { provider: provider({ loadTemplate: () => ({ id: 'signature', name: 'Signature', content: docJson(page(paragraph(text('By '), field('person.lastName')))) }) }) })
    await waitFor(() => expect(embedded()).toHaveTextContent('By Doe'))
    fireEvent.dblClick(embedded())
    expect(within(templateArea()).getByRole('textbox', { name: IE.editTemplate('Signature') })).toHaveTextContent('By {person.lastName}')
    expect(ref.current!.activeView).not.toBe(ref.current!.view)
  })

  it('updates the shared template on request, and shows it re-resolved', async () => {
    const { provider: p } = templateStore(() => undefined)
    const { ref, initial, onEdit } = await openSignature(p)
    const question = within(templateArea()).getByRole('group', { name: IE.question })
    expect(within(question).getAllByRole('button').map((b) => b.textContent)).toEqual([IE.updateShared, IE.makeCopy, IE.keepEditing])
    fireEvent.click(within(question).getByRole('button', { name: IE.updateShared }))
    await waitFor(() => expect(screen.queryByRole('group', { name: IE.editTemplate('Signature') })).toBeNull())
    const [id, content] = (p.saveTemplate as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(id).toBe('signature')
    expect(content).toMatchObject({ type: 'doc', content: [{ type: 'page' }] })
    await waitFor(() => expect(embedded()).toHaveTextContent('Best Regards'))
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('makes a copy for the document: the reference is replaced by the edited blocks', async () => {
    const { provider: p } = templateStore(() => undefined)
    const { ref, onEdit } = await openSignature(p)
    fireEvent.click(within(templateArea()).getByRole('button', { name: IE.makeCopy }))
    const json = JSON.stringify(ref.current!.getDocument()!.toJSON())
    expect(json).not.toContain('template_ref')
    expect(ref.current!.getDocument()!.textContent).toContain('Best Regards')
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(p.saveTemplate).not.toHaveBeenCalled()
  })

  it('offers only the copy without saveTemplate', async () => {
    await openSignature(templateStore().provider)
    const question = within(templateArea()).getByRole('group', { name: IE.question })
    expect(within(question).getAllByRole('button').map((b) => b.textContent)).toEqual([IE.makeCopy, IE.keepEditing])
  })

  it('keeps the area open with an alert when the template cannot be saved, and keeps editing on request', async () => {
    const { provider: p } = templateStore(() => Promise.reject(new Error('offline')))
    await openSignature(p)
    fireEvent.click(within(templateArea()).getByRole('button', { name: IE.updateShared }))
    expect(await within(templateArea()).findByRole('alert')).toHaveTextContent(IE.saveFailed)
    fireEvent.click(within(templateArea()).getByRole('button', { name: IE.keepEditing }))
    expect(within(templateArea()).getByRole('button', { name: IE.done })).toBeInTheDocument()
    expect(within(templateArea()).getByRole('textbox')).toHaveTextContent('Best Regards')
  })

  it('cannot be left, answered again or edited while the shared template is being saved', async () => {
    let finishSave = () => {}
    const { provider: p } = templateStore(() => new Promise<void>((resolve) => (finishSave = resolve)))
    const { ref, initial } = await openSignature(p)
    fireEvent.click(within(templateArea()).getByRole('button', { name: IE.updateShared }))
    const editor = within(templateArea()).getByRole('textbox')
    expect(editor).toHaveAttribute('contenteditable', 'false')
    // Neither Ctrl+Enter (a second question) nor Escape (a discard the save would contradict) acts.
    fireEvent.keyDown(editor, { key: 'Enter', keyCode: 13, ctrlKey: true })
    fireEvent.keyDown(editor, { key: 'Escape', keyCode: 27 })
    expect(within(templateArea()).queryByRole('button', { name: IE.makeCopy })).toBeDisabled()
    await act(async () => finishSave())
    await waitFor(() => expect(screen.queryByRole('group', { name: IE.editTemplate('Signature') })).toBeNull())
    await waitFor(() => expect(embedded()).toHaveTextContent('Best Regards'))
    expect(p.saveTemplate).toHaveBeenCalledTimes(1)
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
  })

  it('closes without asking when nothing changed', async () => {
    const { provider: p } = templateStore(() => undefined)
    await setup([LIST, embed('signature')], { provider: p })
    await waitFor(() => expect(embedded()).toHaveTextContent('Regards'))
    fireEvent.dblClick(embedded())
    fireEvent.click(within(templateArea()).getByRole('button', { name: IE.done }))
    expect(screen.queryByRole('group', { name: IE.editTemplate('Signature') })).toBeNull()
    expect(p.saveTemplate).not.toHaveBeenCalled()
  })
})

describe('the toolbar inside an editing area', () => {
  const toolbar = () => screen.getByRole('toolbar', { name: L.toolbar })

  it('acts on the editing area: the document only changes on Done', async () => {
    const user = userEvent.setup()
    const { ref, initial } = await setup([LIST])
    fireEvent.dblClick(block())
    await user.click(within(toolbar()).getByRole('button', { name: L.insertField }))
    const menu = screen.getByRole('menu', { name: L.insertField })
    // The block's item fields first, named after its source, then the document's fields.
    expect(within(menu).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Items', 'Person'])
    await user.click(within(within(menu).getByRole('group', { name: 'Items' })).getByRole('menuitem', { name: 'Name' }))
    expect(within(area()).getByRole('textbox')).toHaveTextContent('{item.name}– {item.name}')
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
    await user.click(within(toolbar()).getByRole('button', { name: L.bold }))
    await user.click(within(toolbar()).getByRole('button', { name: L.undo }))
    expect(within(area()).getByRole('textbox')).toHaveTextContent('– {item.name}')
    fireEvent.click(within(area()).getByRole('button', { name: IE.cancel }))
    expect(ref.current!.getDocument()!.toJSON()).toEqual(initial)
  })

  it('makes a row of the block’s table a header, footer or repeated row', async () => {
    const user = userEvent.setup()
    const tableBlock = repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), row(cell('table_cell', field('item.name')))))
    const { ref } = await setup([paragraph(text('Intro')), tableBlock, table(row(cell('table_cell', text('plain'))))])
    // A table outside a block has no row zones.
    const main = ref.current!.view!
    let plainCell = -1
    main.state.doc.descendants((node, pos) => void (node.type.name === 'table_cell' && (plainCell = pos)))
    act(() => main.dispatch(main.state.tr.setSelection(TextSelection.create(main.state.doc, plainCell + 2))))
    expect(main.state.selection.$from.parent.textContent).toBe('plain')
    await user.click(within(toolbar()).getByRole('button', { name: L.tableMenu }))
    expect(screen.queryByRole('menuitem', { name: L.rowZone.footer })).toBeNull()
    await user.keyboard('{Escape}')
    fireEvent.dblClick(block())
    const nested = ref.current!.activeView!
    let itemCell = -1
    nested.state.doc.descendants((node, pos) => {
      if (itemCell < 0 && node.type.name === 'table_cell') itemCell = pos
      return itemCell < 0
    })
    act(() => nested.dispatch(nested.state.tr.setSelection(TextSelection.create(nested.state.doc, itemCell + 2))))
    await user.click(within(toolbar()).getByRole('button', { name: L.tableMenu }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([...Object.values(L.table), L.rowZone.header, L.rowZone.body, L.rowZone.footer])
    await user.click(screen.getByRole('menuitem', { name: L.rowZone.footer }))
    expect(area().querySelectorAll('tr[data-zone="footer"]')).toHaveLength(1)
    fireEvent.click(within(area()).getByRole('button', { name: IE.done }))
    const rows: string[] = []
    ref.current!.getDocument()!.child(0).child(1).descendants((node) => void (node.type.name === 'table_row' && rows.push(String(node.attrs.zone))))
    expect(rows).toEqual(['header', 'footer'])
  })

  it('does not offer to embed the template being edited', async () => {
    await setup([LIST, embed('signature')])
    expect(await within(toolbar()).findByRole('button', { name: L.insertTemplate })).toBeInTheDocument()
    await waitFor(() => expect(embedded()).toHaveTextContent('Regards'))
    fireEvent.dblClick(embedded())
    expect(within(toolbar()).queryByRole('button', { name: L.insertTemplate })).toBeNull()
  })
})
