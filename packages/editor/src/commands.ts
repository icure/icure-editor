// The toolbar's commands: marks, block style and alignment, tables, fields, repeating blocks,
// embedded templates and images, as ProseMirror commands over the editor schema.
import { setBlockType, toggleMark } from 'prosemirror-commands'
import type { MarkType, Node as ProseNode, ResolvedPos } from 'prosemirror-model'
import { NodeSelection, type Command, type EditorState } from 'prosemirror-state'
import { CellSelection, selectionCell } from 'prosemirror-tables'

import type { RepeatSourceDescriptor } from './context.ts'
import { fieldKey, imageKey, repeatKey, templateKey } from './document.ts'
import { clampImageWidth, safeAltText, safeImageId } from './images.ts'
import { cellSides, DEFAULT_BORDERS, editorSchema, safeAlignment, safeBorders, safeIdentifier, safeLayout, type Alignment, type TableLayout } from './schema.ts'

const { nodes, marks } = editorSchema

export const toggleStrong: Command = toggleMark(marks.strong)
export const toggleEm: Command = toggleMark(marks.em)
export const toggleUnderline: Command = toggleMark(marks.underlined)

export const isMarkActive = (state: EditorState, type: MarkType): boolean => {
  const { from, $from, to, empty } = state.selection
  return empty ? Boolean(type.isInSet(state.storedMarks ?? $from.marks())) : state.doc.rangeHasMark(from, to, type)
}

// A styled mark (font, size, colour) over the selection, replacing the previous value.
export function setStyleMark(type: MarkType, attrs: Record<string, string>): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (dispatch) {
      const mark = type.create(attrs)
      dispatch(empty ? state.tr.addStoredMark(mark) : state.tr.removeMark(from, to, type).addMark(from, to, mark))
    }
    return true
  }
}

export type BlockStyle = 'paragraph' | 'heading1' | 'heading2' | 'heading3'
export const BLOCK_STYLES: readonly BlockStyle[] = ['paragraph', 'heading1', 'heading2', 'heading3']

export const setBlockStyle = (style: BlockStyle): Command => (style === 'paragraph' ? setBlockType(nodes.paragraph) : setBlockType(nodes.heading, { level: Number(style.slice(-1)) }))

export function blockStyleOf(state: EditorState): BlockStyle {
  const parent = state.selection.$from.parent
  return parent.type === nodes.heading ? (`heading${Math.min(3, Number(parent.attrs.level))}` as BlockStyle) : 'paragraph'
}

// Alignment of every paragraph and heading the selection touches.
export function setAlignment(align: Alignment): Command {
  return (state, dispatch) => {
    const tr = state.tr
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type === nodes.paragraph || node.type === nodes.heading) tr.setNodeMarkup(pos, undefined, { ...node.attrs, align: safeAlignment(align) })
      return true
    })
    if (dispatch && tr.docChanged) dispatch(tr)
    return tr.docChanged
  }
}

export const alignmentOf = (state: EditorState): Alignment => safeAlignment(state.selection.$from.parent.attrs.align)

const insert =
  (node: ProseNode | null): Command =>
  (state, dispatch) => {
    if (!node) return false
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
    return true
  }

// A two-by-two table at the cursor.
export const insertTable: Command = (state, dispatch) => {
  const cell = () => nodes.table_cell.createAndFill()!
  const table = nodes.table.create(null, [nodes.table_row.create(null, [cell(), cell()]), nodes.table_row.create(null, [cell(), cell()])])
  return insert(table)(state, dispatch)
}

// The sides the selected cells draw (see `safeBorders`): 'tblr' all, '' none, 't' the top only.
// Every selected cell is visited (upstream's setCellAttr gives up when the selection cell already
// holds the value, leaving the others untouched).
export const setCellBorders =
  (sides: string): Command =>
  (state, dispatch) => {
    const value = safeBorders(sides)
    const positions: number[] = []
    if (state.selection instanceof CellSelection) state.selection.forEachCell((_, pos) => positions.push(pos))
    else {
      const $cell = cellOf(state)
      if (!$cell) return false
      positions.push($cell.pos)
    }
    const changed = positions.filter((pos) => state.doc.nodeAt(pos)?.attrs.borders !== value)
    if (changed.length === 0) return false
    if (dispatch) {
      const tr = state.tr
      for (const pos of changed) tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, borders: value })
      dispatch(tr)
    }
    return true
  }

// The cell of the selection (a cell selection's head cell), or null outside a table
// (prosemirror-tables' `selectionCell` throws there).
function cellOf(state: EditorState): ResolvedPos | null {
  try {
    return selectionCell(state)
  } catch {
    return null
  }
}

// The preset of the table around the selection; null outside a table.
export function tableLayoutOf(state: EditorState): TableLayout | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type === nodes.table) return safeLayout(node.attrs.layout)
  }
  return null
}

// The sides the selection's cell draws (a subset of 'tblr', what prints: in a layout table the
// default draws none); null outside a table.
export function cellSidesOf(state: EditorState): string | null {
  const $cell = cellOf(state)
  const cell = $cell?.nodeAfter
  if (!$cell || !cell) return null
  const table = $cell.node(-1)
  const sides = cellSides(table.type === nodes.table ? table.attrs.layout : null, cell.attrs.borders)
  if (!sides) return DEFAULT_BORDERS
  const [left, top, right, bottom] = sides
  return `${top ? 't' : ''}${bottom ? 'b' : ''}${left ? 'l' : ''}${right ? 'r' : ''}`
}

// The preset of the table around the selection: `grid` (ruled cells) or `layout` (no rules unless a
// cell names its sides; the editor outlines it, the output never does).
export const setTableLayout =
  (layout: TableLayout): Command =>
  (state, dispatch) => {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type !== nodes.table) continue
      if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, layout: safeLayout(layout) }))
      return true
    }
    return false
  }

const fieldNode = (name: string, label: string | null = null) => nodes.variable.create({ name, label })

export function insertField(name: string, label: string | null = null): Command {
  return insert(safeIdentifier(name) ? fieldNode(name, label) : null)
}

const headerCell = (text: string) => nodes.table_header.create(null, nodes.paragraph.create(null, text ? editorSchema.text(text) : null))
const fieldCell = (name: string) => nodes.table_cell.create(null, nodes.paragraph.create(null, fieldNode(name)))
// A line's lead (the schema has no list node: a line per item).
export const LIST_LEAD = '– '
const SEPARATOR = ', '

// The body a new block starts with: a table (a header row of the item fields' labels, a row of the
// item fields), or a line per item.
export function repeatContent(source: RepeatSourceDescriptor): ProseNode {
  const fields = source.itemFields
  if (source.layout === 'table' && fields.length > 0) {
    const table = nodes.table.create(null, [nodes.table_row.create({ zone: 'header' }, fields.map((f) => headerCell(f.label))), nodes.table_row.create(null, fields.map((f) => fieldCell(f.key)))])
    return nodes.repeat_body.create(null, table)
  }
  const inline = fields.flatMap((f, i) => (i === 0 ? [fieldNode(f.key)] : [editorSchema.text(SEPARATOR), fieldNode(f.key)]))
  return nodes.repeat_body.create(null, nodes.paragraph.create(null, [editorSchema.text(LIST_LEAD), ...inline]))
}

export function insertRepeat(source: RepeatSourceDescriptor): Command {
  return insert(safeIdentifier(source.key) ? nodes.repeat.create({ source: source.key }, repeatContent(source)) : null)
}

export function insertTemplate(templateId: string): Command {
  return insert(safeIdentifier(templateId) ? nodes.template_ref.create({ templateId }) : null)
}

export interface ImageAttrs {
  readonly imageId: string
  readonly alt?: string
  readonly width?: number | null
}

export function insertImage({ imageId, alt, width }: ImageAttrs): Command {
  const id = safeImageId(imageId)
  return insert(id ? nodes.image.create({ imageId: id, alt: safeAltText(alt), width: clampImageWidth(width) }) : null)
}

// The selected image, if the selection is on one.
export function selectedImage(state: EditorState): { readonly pos: number; readonly node: ProseNode } | null {
  const { selection } = state
  return selection instanceof NodeSelection && selection.node.type === nodes.image ? { pos: selection.from, node: selection.node } : null
}

// Updates the selected image's description or width (the selection stays on it).
export function updateSelectedImage(attrs: { readonly alt?: string; readonly width?: number | null }): Command {
  return (state, dispatch) => {
    const selected = selectedImage(state)
    if (!selected) return false
    if (dispatch) {
      let tr = state.tr
      if (attrs.alt !== undefined) tr = tr.setNodeAttribute(selected.pos, 'alt', safeAltText(attrs.alt))
      if (attrs.width !== undefined) tr = tr.setNodeAttribute(selected.pos, 'width', clampImageWidth(attrs.width))
      dispatch(tr)
    }
    return true
  }
}

// The key of the reference the selection is on (a tapped field, block, embed or image is
// node-selected): shown under the toolbar, the touch alternative to the hover tooltip.
export function selectedKey(state: EditorState): string | null {
  const { selection } = state
  if (!(selection instanceof NodeSelection)) return null
  const node = selection.node
  if (node.type === nodes.variable) return fieldKey(String(node.attrs.name), node.attrs.label as string | null)
  if (node.type === nodes.repeat) return repeatKey(String(node.attrs.source))
  if (node.type === nodes.template_ref) return templateKey(String(node.attrs.templateId))
  if (node.type === nodes.image) return imageKey(String(node.attrs.imageId))
  return null
}
