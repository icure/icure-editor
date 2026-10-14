// The editor's toolbar: undo and redo, block style, font, size, bold, italic, underline, colour,
// alignment, tables, fields, repeating blocks, embedded templates and images.
import type { Command, EditorState } from 'prosemirror-state'
import type { ReactNode } from 'react'

import {
  alignmentOf,
  BLOCK_STYLES,
  blockStyleOf,
  insertField,
  insertRepeat,
  insertTable,
  insertTemplate,
  isMarkActive,
  setAlignment,
  setBlockStyle,
  setStyleMark,
  toggleEm,
  toggleStrong,
  toggleUnderline,
  type BlockStyle,
} from '../commands.ts'
import type { FieldDescriptor, RepeatSourceDescriptor, TemplateSummary } from '../context.ts'
import type { EditorLabels, ShownAlignment, TableAction } from '../labels.ts'
import { editorSchema, FONT_SIZES, FONTS } from '../schema.ts'
import { Menu } from './Menu.tsx'

const { marks } = editorSchema
const SHOWN_ALIGNMENTS: readonly ShownAlignment[] = ['left', 'center', 'right', 'justify']
const TABLE_ACTIONS: readonly TableAction[] = ['addRow', 'addColumn', 'deleteRow', 'deleteColumn']
// The colour picker's starting value (the picker needs a hex value).
const DEFAULT_INK = '#000000'

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
  // Extra controls the host appends to the toolbar.
  readonly children?: ReactNode
}

interface ToolButtonProps {
  readonly label: string
  readonly glyph: string
  readonly active?: boolean
  readonly disabled?: boolean
  readonly onPress: () => void
}

function ToolButton({ label, glyph, active, disabled, onPress }: ToolButtonProps) {
  return (
    <button type="button" className="ie-button ie-tool" aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onPress}>
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}

export function Toolbar({ state, run, labels, fields, repeatSources, templates, onInsertImage, tableCommands, undo, redo, children }: ToolbarProps) {
  return (
    <div role="toolbar" aria-label={labels.toolbar} className="ie-toolbar">
      <ToolButton label={labels.undo} glyph="↶" disabled={!undo(state)} onPress={() => run(undo)} />
      <ToolButton label={labels.redo} glyph="↷" disabled={!redo(state)} onPress={() => run(redo)} />
      <select className="ie-select" aria-label={labels.blockStyle} value={blockStyleOf(state)} onChange={(e) => run(setBlockStyle(e.target.value as BlockStyle))}>
        {BLOCK_STYLES.map((style) => (
          <option key={style} value={style}>
            {labels.blockStyles[style]}
          </option>
        ))}
      </select>
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
      <ToolButton label={labels.bold} glyph={labels.boldGlyph} active={isMarkActive(state, marks.strong)} onPress={() => run(toggleStrong)} />
      <ToolButton label={labels.italic} glyph={labels.italicGlyph} active={isMarkActive(state, marks.em)} onPress={() => run(toggleEm)} />
      <ToolButton label={labels.underline} glyph={labels.underlineGlyph} active={isMarkActive(state, marks.underlined)} onPress={() => run(toggleUnderline)} />
      <input type="color" className="ie-colour" aria-label={labels.colour} defaultValue={DEFAULT_INK} onChange={(e) => run(setStyleMark(marks.color, { color: e.target.value }))} />
      <div role="group" aria-label={labels.alignment} className="ie-group">
        {SHOWN_ALIGNMENTS.map((align) => (
          <ToolButton key={align} label={labels.align[align]} glyph={labels.alignGlyph[align]} active={alignmentOf(state) === align} onPress={() => run(setAlignment(align))} />
        ))}
      </div>
      <button type="button" className="ie-button" onMouseDown={(e) => e.preventDefault()} onClick={() => run(insertTable)}>
        {labels.insertTable}
      </button>
      <Menu label={labels.tableMenu} items={TABLE_ACTIONS.map((id) => ({ id, label: labels.table[id], onSelect: () => run(tableCommands[id]) }))} />
      {fields.length > 0 && <Menu label={labels.insertField} items={fields.map((f) => ({ id: f.key, label: f.label, ...(f.group ? { group: f.group } : {}), onSelect: () => run(insertField(f.key)) }))} />}
      {repeatSources.length > 0 && <Menu label={labels.insertBlock} items={repeatSources.map((s) => ({ id: s.key, label: s.label, onSelect: () => run(insertRepeat(s)) }))} />}
      {templates.length > 0 && <Menu label={labels.insertTemplate} items={templates.map((t) => ({ id: t.id, label: t.name, onSelect: () => run(insertTemplate(t.id)) }))} />}
      {onInsertImage && (
        <button type="button" className="ie-button" onMouseDown={(e) => e.preventDefault()} onClick={onInsertImage}>
          {labels.insertImage}
        </button>
      )}
      {children}
    </div>
  )
}
