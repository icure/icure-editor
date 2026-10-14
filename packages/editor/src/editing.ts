// Editing a repeating block or an embedded template in place: which block is open (a node decoration
// the block's node view reads), the zones shown while editing, and the row zones of a block's table.
// No DOM here: the editing area itself is in react/inlineEditing.ts.
import { Fragment, type Node as ProseNode } from 'prosemirror-model'
import { Plugin, PluginKey, type Command, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

import { bodyTable } from './repeat.ts'
import { editorSchema, type RowZone } from './schema.ts'

const { nodes } = editorSchema

// The open block: its position, and the session the node view adopts.
export interface EditingTarget {
  readonly pos: number
  readonly session: unknown
}

export interface EditingMeta {
  readonly open?: EditingTarget
  readonly close?: true
}

export const editingKey = new PluginKey<DecorationSet>('ie-editing')
export const EDITING_CLASS = 'ie-editing'
// The decoration spec's key holding the session.
export const SESSION_SPEC = 'ieSession'

export function editingPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: editingKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => {
        const meta = tr.getMeta(editingKey) as EditingMeta | undefined
        if (meta?.close) return DecorationSet.empty
        if (meta?.open) {
          const { pos, session } = meta.open
          const target = tr.doc.nodeAt(pos)
          if (!target) return DecorationSet.empty
          return DecorationSet.create(tr.doc, [Decoration.node(pos, pos + target.nodeSize, { class: EDITING_CLASS }, { [SESSION_SPEC]: session })])
        }
        return set.map(tr.mapping, tr.doc)
      },
    },
    props: { decorations: (state) => editingKey.getState(state) },
  })
}

// The block open in this state, or null.
export function editingTarget(state: EditorState): EditingTarget | null {
  const found = editingKey.getState(state)?.find()[0]
  return found ? { pos: found.from, session: (found.spec as Record<string, unknown>)[SESSION_SPEC] } : null
}

const emptyZone = (zone: ProseNode | null): boolean => !!zone && zone.childCount === 1 && zone.child(0).type === nodes.paragraph && zone.child(0).content.size === 0

const zoneChildren = (repeat: ProseNode): ProseNode[] => Array.from({ length: repeat.childCount }, (_, i) => repeat.child(i))

// The block with a header and a footer: a missing one is added holding one empty paragraph.
export function withAllZones(repeat: ProseNode): ProseNode {
  const zones = zoneChildren(repeat)
  const fresh = (type: typeof nodes.repeat_header) => type.create(null, nodes.paragraph.create())
  const header = zones[0]?.type === nodes.repeat_header ? [] : [fresh(nodes.repeat_header)]
  const footer = zones.at(-1)?.type === nodes.repeat_footer ? [] : [fresh(nodes.repeat_footer)]
  return header.length + footer.length === 0 ? repeat : repeat.copy(Fragment.fromArray([...header, ...zones, ...footer]))
}

// The block without a header or footer left as one empty paragraph (the body always stays).
export function dropEmptyZones(repeat: ProseNode): ProseNode {
  const zones = zoneChildren(repeat)
  const kept = zones.filter((zone) => zone.type === nodes.repeat_body || !emptyZone(zone))
  return kept.length === zones.length ? repeat : repeat.copy(Fragment.fromArray(kept))
}

// The blocks of every page of a template (what a copy puts in the document).
export function templateBlocks(doc: ProseNode): ProseNode[] {
  const blocks: ProseNode[] = []
  doc.forEach((page) => page.forEach((block) => blocks.push(block)))
  return blocks
}

// The row under the cursor, when it is a row of a block's table (a body holding one table).
export function bodyTableRow(state: EditorState): { readonly pos: number; readonly node: ProseNode } | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 2; depth--) {
    const node = $from.node(depth)
    if (node.type !== nodes.table_row) continue
    const tableNode = $from.node(depth - 1)
    const body = $from.node(depth - 2)
    return body.type === nodes.repeat_body && bodyTable(body) === tableNode ? { pos: $from.before(depth), node } : null
  }
  return null
}

// Makes the row under the cursor a header row (drawn once before the items), a footer row (once
// after) or a repeated row.
export function setRowZone(zone: RowZone): Command {
  return (state, dispatch) => {
    const found = bodyTableRow(state)
    if (!found) return false
    if (dispatch && found.node.attrs.zone !== zone) dispatch(state.tr.setNodeAttribute(found.pos, 'zone', zone))
    return true
  }
}
