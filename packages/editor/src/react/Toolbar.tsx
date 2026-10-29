// The editor's toolbar: undo and redo, block style, font, size, bold, italic, underline, colour,
// alignment, tables, fields, repeating blocks, embedded templates and images. Each control is an
// item with an id; the host may remove, reorder, wrap or add items (customize).
import type { Command, EditorState } from 'prosemirror-state'
import { Fragment, type ReactNode } from 'react'

import {
  alignmentOf,
  BLOCK_STYLES,
  blockStyleOf,
  cellSidesOf,
  insertField,
  insertRepeat,
  insertTable,
  insertTemplate,
  isMarkActive,
  setAlignment,
  setBlockStyle,
  setStyleMark,
  tableLayoutOf,
  toggleEm,
  toggleStrong,
  toggleUnderline,
  type BlockStyle,
} from '../commands.ts'
import type { FieldDescriptor, RepeatSourceDescriptor, TemplateSummary } from '../context.ts'
import { bodyTableRow, setRowZone } from '../editing.ts'
import type { EditorLabels, ShownAlignment, TableAction } from '../labels.ts'
import { editorSchema, FONT_SIZES, FONTS, ROW_ZONES, type TableLayout } from '../schema.ts'
import { AlignIcon, FieldIcon, ImageIcon, InsertTableIcon, RedoIcon, RepeatIcon, TableIcon, TemplateIcon, UndoIcon } from './icons.tsx'
import { Menu, type MenuItem } from './Menu.tsx'
import { Tooltip } from './Tooltip.tsx'

const { marks } = editorSchema
const SHOWN_ALIGNMENTS: readonly ShownAlignment[] = ['left', 'center', 'right', 'justify']
const TABLE_ACTIONS: readonly TableAction[] = ['addRow', 'addColumn', 'deleteRow', 'deleteColumn', 'layoutGrid', 'layoutPlain', 'bordersAll', 'bordersNone', 'bordersTop', 'bordersBottom', 'bordersLeft', 'bordersRight']
// The Table menu's choices: the table's preset and the cell's drawn sides (what each entry sets).
const PRESETS: Partial<Record<TableAction, TableLayout>> = { layoutGrid: 'grid', layoutPlain: 'layout' }
const SIDES: Partial<Record<TableAction, string>> = { bordersAll: 'tblr', bordersNone: '', bordersTop: 't', bordersBottom: 'b', bordersLeft: 'l', bordersRight: 'r' }

// The Table menu's entries: the presets and the borders are choices showing the current one; in a
// layout table "all borders" is unavailable (a cell framed all round belongs in a grid table).
function tableItems(state: EditorState, run: (command: Command) => void, labels: EditorLabels, commands: Readonly<Record<TableAction, Command>>): MenuItem[] {
  const layout = tableLayoutOf(state)
  const sides = cellSidesOf(state)
  return TABLE_ACTIONS.map((id) => {
    const item = { id, label: labels.table[id], onSelect: () => run(commands[id]) }
    const preset = PRESETS[id]
    if (preset) return { ...item, set: 'preset', checked: layout === preset }
    const drawn = SIDES[id]
    if (drawn !== undefined) return { ...item, set: 'borders', checked: sides === drawn, ...(id === 'bordersAll' && layout === 'layout' ? { disabled: true } : {}) }
    return item
  })
}
// The colour picker's starting value (the picker needs a hex value).
const DEFAULT_INK = '#000000'

// The built-in controls, in their default order.
export const TOOLBAR_ITEM_IDS = ['undo', 'redo', 'blockStyle', 'font', 'size', 'bold', 'italic', 'underline', 'colour', 'alignment', 'insertTable', 'tableMenu', 'insertField', 'insertBlock', 'insertTemplate', 'insertImage'] as const
export type ToolbarItemId = (typeof TOOLBAR_ITEM_IDS)[number]

// One control of the toolbar: a built-in one (its id is a ToolbarItemId) or the host's own.
export interface ToolbarItem {
  readonly id: string
  readonly render: () => ReactNode
}

// What a host's items act on: the active view's state (the innermost block open in place) and the
// command runner acting on that view.
export interface ToolbarContext {
  readonly state: EditorState
  readonly run: (command: Command) => void
  readonly labels: EditorLabels
}

// The host's hook: receives the built-in items (an unavailable control, such as a menu with nothing
// to offer, is absent) and returns the items to show, in order. Ids must be unique.
export type CustomizeToolbar = (items: readonly ToolbarItem[], context: ToolbarContext) => readonly ToolbarItem[]

export interface ToolbarProps {
  readonly state: EditorState
  readonly run: (command: Command) => void
  readonly labels: EditorLabels
  readonly fields: readonly FieldDescriptor[]
  readonly repeatSources: readonly RepeatSourceDescriptor[]
  readonly templates: readonly TemplateSummary[]
  readonly onInsertImage: (() => void) | null
  readonly tableCommands: Readonly<Record<TableAction, Command>>
  readonly undo: Command
  readonly redo: Command
  readonly customize?: CustomizeToolbar
  // Extra controls the host appends to the toolbar.
  readonly children?: ReactNode
}

export interface ToolButtonProps {
  readonly label: string
  // An icon, or a short glyph from the labels (B, I, U).
  readonly glyph: ReactNode
  readonly active?: boolean
  readonly disabled?: boolean
  readonly onPress: () => void
}

// A toolbar button: named by its label (aria-label and tooltip), pressed state when given; it keeps
// the focus in the document while pressed.
export function ToolButton({ label, glyph, active, disabled, onPress }: ToolButtonProps) {
  return (
    <Tooltip text={label}>
      <button type="button" className="ie-button ie-tool" aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onPress}>
        <span aria-hidden="true">{glyph}</span>
      </button>
    </Tooltip>
  )
}

function defaultItems({ state, run, labels, fields, repeatSources, templates, onInsertImage, tableCommands, undo, redo }: ToolbarProps): ToolbarItem[] {
  const items: Record<ToolbarItemId, (() => ReactNode) | null> = {
    undo: () => <ToolButton label={labels.undo} glyph={<UndoIcon />} disabled={!undo(state)} onPress={() => run(undo)} />,
    redo: () => <ToolButton label={labels.redo} glyph={<RedoIcon />} disabled={!redo(state)} onPress={() => run(redo)} />,
    blockStyle: () => (
      <select className="ie-select" aria-label={labels.blockStyle} value={blockStyleOf(state)} onChange={(e) => run(setBlockStyle(e.target.value as BlockStyle))}>
        {BLOCK_STYLES.map((style) => (
          <option key={style} value={style}>
            {labels.blockStyles[style]}
          </option>
        ))}
      </select>
    ),
    font: () => (
      <select className="ie-select" aria-label={labels.font} defaultValue="" onChange={(e) => e.target.value && run(setStyleMark(marks.font, { font: e.target.value }))}>
        <option value="" disabled>
          {labels.font}
        </option>
        {FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
    ),
    size: () => (
      <select className="ie-select" aria-label={labels.size} defaultValue="" onChange={(e) => e.target.value && run(setStyleMark(marks.size, { size: e.target.value }))}>
        <option value="" disabled>
          {labels.size}
        </option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    ),
    bold: () => <ToolButton label={labels.bold} glyph={labels.boldGlyph} active={isMarkActive(state, marks.strong)} onPress={() => run(toggleStrong)} />,
    italic: () => <ToolButton label={labels.italic} glyph={labels.italicGlyph} active={isMarkActive(state, marks.em)} onPress={() => run(toggleEm)} />,
    underline: () => <ToolButton label={labels.underline} glyph={labels.underlineGlyph} active={isMarkActive(state, marks.underlined)} onPress={() => run(toggleUnderline)} />,
    colour: () => (
      <Tooltip text={labels.colour}>
        <input type="color" className="ie-colour" aria-label={labels.colour} defaultValue={DEFAULT_INK} onChange={(e) => run(setStyleMark(marks.color, { color: e.target.value }))} />
      </Tooltip>
    ),
    alignment: () => (
      <div role="group" aria-label={labels.alignment} className="ie-group">
        {SHOWN_ALIGNMENTS.map((align) => (
          <ToolButton key={align} label={labels.align[align]} glyph={<AlignIcon align={align} />} active={alignmentOf(state) === align} onPress={() => run(setAlignment(align))} />
        ))}
      </div>
    ),
    insertTable: () => <ToolButton label={labels.insertTable} glyph={<InsertTableIcon />} onPress={() => run(insertTable)} />,
    tableMenu: () => (
      <Menu
        label={labels.tableMenu}
        icon={<TableIcon />}
        items={[
          ...tableItems(state, run, labels, tableCommands),
          // In a repeating block's table (while the block is edited): the row's zone.
          ...(bodyTableRow(state) ? ROW_ZONES.map((zone) => ({ id: `zone-${zone}`, label: labels.rowZone[zone], onSelect: () => run(setRowZone(zone)) })) : []),
        ]}
      />
    ),
    insertField:
      fields.length > 0
        ? () => <Menu label={labels.insertField} icon={<FieldIcon />} items={fields.map((f) => ({ id: `${f.group ?? ''}/${f.key}`, label: f.label, ...(f.group ? { group: f.group } : {}), onSelect: () => run(insertField(f.key)) }))} />
        : null,
    insertBlock: repeatSources.length > 0 ? () => <Menu label={labels.insertBlock} icon={<RepeatIcon />} items={repeatSources.map((s) => ({ id: s.key, label: s.label, onSelect: () => run(insertRepeat(s)) }))} /> : null,
    insertTemplate: templates.length > 0 ? () => <Menu label={labels.insertTemplate} icon={<TemplateIcon />} items={templates.map((t) => ({ id: t.id, label: t.name, onSelect: () => run(insertTemplate(t.id)) }))} /> : null,
    insertImage: onInsertImage ? () => <ToolButton label={labels.insertImage} glyph={<ImageIcon />} onPress={onInsertImage} /> : null,
  }
  return TOOLBAR_ITEM_IDS.flatMap((id) => {
    const render = items[id]
    return render ? [{ id, render }] : []
  })
}

export function Toolbar(props: ToolbarProps) {
  const { state, run, labels, customize, children } = props
  const defaults = defaultItems(props)
  const items = customize ? customize(defaults, { state, run, labels }) : defaults
  return (
    <div role="toolbar" aria-label={labels.toolbar} className="ie-toolbar">
      {items.map((item) => (
        <Fragment key={item.id}>{item.render()}</Fragment>
      ))}
      {children}
    </div>
  )
}
