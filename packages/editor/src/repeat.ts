// Repeating blocks: their zones, and the chain of item scopes a body is filled in. Shared by the
// resolver and the renderer, so both read a field from the same place: the body in its item's scope,
// header and footer in the enclosing one; a field from the innermost scope that declares it.
import type { Node as ProseNode } from 'prosemirror-model'

import { editorSchema, safeRowZone, type RowZone } from './schema.ts'

const { nodes } = editorSchema

// What one item of a source holds: field names, and the sources of the lists it holds.
export interface RepeatShape {
  readonly itemFields: ReadonlySet<string>
  readonly itemRepeats: ReadonlySet<string>
}
export const EMPTY_SHAPE: RepeatShape = { itemFields: new Set(), itemRepeats: new Set() }

export interface ShapeScope {
  readonly shape: RepeatShape
  readonly parent: ShapeScope | null
}

export interface RepeatZones {
  readonly header: ProseNode | null
  readonly body: ProseNode
  readonly footer: ProseNode | null
}

export function zonesOf(repeat: ProseNode): RepeatZones {
  let header: ProseNode | null = null
  let body: ProseNode | null = null
  let footer: ProseNode | null = null
  repeat.forEach((zone) => {
    if (zone.type === nodes.repeat_header) header = zone
    else if (zone.type === nodes.repeat_body) body = zone
    else if (zone.type === nodes.repeat_footer) footer = zone
  })
  // The schema requires a body.
  return { header, body: body!, footer }
}

// A body made of one table: its header and footer rows are drawn once, its body rows per item.
export const bodyTable = (body: ProseNode): ProseNode | null => (body.childCount === 1 && body.child(0).type === nodes.table ? body.child(0) : null)
export const rowZone = (row: ProseNode): RowZone => safeRowZone(row.attrs.zone)

// The scope a zone (or a row of a body table) is filled in.
export const scopeFor = <S>(zone: RowZone, outer: S, inner: S): S => (zone === 'body' ? inner : outer)

// The innermost scope whose source declares the field name (or holds the list), or null.
export function declaringField<S extends ShapeScope>(scope: S | null, name: string): S | null {
  for (let s: ShapeScope | null = scope; s; s = s.parent) if (s.shape.itemFields.has(name)) return s as S
  return null
}
export function declaringRepeat<S extends ShapeScope>(scope: S | null, source: string): S | null {
  for (let s: ShapeScope | null = scope; s; s = s.parent) if (s.shape.itemRepeats.has(source)) return s as S
  return null
}
