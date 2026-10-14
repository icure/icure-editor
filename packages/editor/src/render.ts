// Rendering a document against its resolution: fields become text, repeating blocks are drawn once
// per item, embedded templates are inlined (guarded against cycles and depth, like the resolver).
// Pure, and nothing is evaluated: a value is text, looked up by key.
//
// Repeating blocks: the header and footer are drawn once in the enclosing scope, the body once per
// item in that item's scope (chained to its parent). A body made of one table repeats its body rows
// and keeps its header and footer rows once.
import { Fragment, type Node as ProseNode } from 'prosemirror-model'

import { fieldKey, templateKey } from './document.ts'
import { bodyTable, declaringField, declaringRepeat, EMPTY_SHAPE, rowZone, zonesOf, type RepeatShape, type ShapeScope } from './repeat.ts'
import type { ItemContext, ResolvedRepeat, Resolution } from './resolve.ts'
import { editorSchema, type RowZone } from './schema.ts'

const { nodes } = editorSchema

export interface RenderOptions {
  // `output`: what is printed (an unresolved reference prints nothing). `editor`: what the editor
  // draws inside blocks and embeds (an unresolved field shows its expression). `expressions`: every
  // field shown as its expression.
  readonly mode?: 'output' | 'editor' | 'expressions'
  // The text of an item field the item has no value for (default: '' in output, '—' in the editor).
  readonly missingItemValue?: string
}

interface ItemScope extends ShapeScope {
  readonly item: ItemContext | null
  readonly parent: ItemScope | null
}

interface Env {
  readonly resolution: Resolution
  readonly mode: 'output' | 'editor' | 'expressions'
  readonly missingItemValue: string
  readonly items: ItemScope | null
  readonly stack: readonly string[]
  readonly depth: number
}

// What a repeating block draws, zone by zone.
export interface RepeatParts {
  readonly header: ProseNode[]
  readonly body: ProseNode[]
  readonly footer: ProseNode[]
  // A resolved list with no item (the editor shows its "nothing to list" line).
  readonly empty: boolean
}

export const expression = (key: string): string => `{${key}}`
export const EDITOR_MISSING_ITEM_VALUE = '—'

function fieldText(node: ProseNode, env: Env): string {
  const name = String(node.attrs.name)
  const key = fieldKey(name, node.attrs.label as string | null)
  if (env.mode === 'expressions') return expression(key)
  // Read from the innermost item that declares it; missing there is missing (no fallback outward).
  const holder = declaringField(env.items, name)
  if (holder) return holder.item?.values.get(key) ?? env.missingItemValue
  const value = env.resolution.fields.get(key)
  if (value !== undefined) return value
  return env.mode === 'editor' ? expression(key) : ''
}

const childrenOf = (node: ProseNode): ProseNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))

// The list a block draws: held by an enclosing item (missing there: empty), else the provider's
// answer (none: unresolved, null).
function listOf(repeat: ProseNode, env: Env): { readonly list: ResolvedRepeat | null; readonly shape: RepeatShape } {
  const source = String(repeat.attrs.source)
  const holder = declaringRepeat(env.items, source)
  if (holder) {
    const shape = env.resolution.shapes.get(source) ?? EMPTY_SHAPE
    return { list: holder.item?.lists.get(source) ?? { ...shape, items: [], nested: new Map() }, shape }
  }
  const data = env.resolution.repeats.get(source) ?? null
  return { list: data, shape: data ?? env.resolution.shapes.get(source) ?? EMPTY_SHAPE }
}

function expandTable(table: ProseNode, items: readonly ItemContext[], outer: Env, inner: (item: ItemContext) => Env): ProseNode[] {
  const rows = childrenOf(table)
  const once = (zone: RowZone) => rows.filter((row) => rowZone(row) === zone).flatMap((row) => renderNode(row, outer))
  const body = rows.filter((row) => rowZone(row) === 'body')
  const all = [...once('header'), ...items.flatMap((item) => body.flatMap((row) => renderNode(row, inner(item)))), ...once('footer')]
  // A table left with no row (no item, no header or footer row) isn't drawn.
  return all.length === 0 ? [] : [table.copy(Fragment.fromArray(all))]
}

function repeatParts(repeat: ProseNode, env: Env): RepeatParts {
  const { list, shape } = listOf(repeat, env)
  const zones = zonesOf(repeat)
  const blocksOf = (zone: ProseNode | null, e: Env) => (zone ? childrenOf(zone).flatMap((block) => renderNode(block, e)) : [])
  // Shown as written: with expressions, and in the editor while the block is unresolved.
  if (env.mode === 'expressions' || (env.mode === 'editor' && !list)) {
    const written: Env = { ...env, mode: 'expressions', items: { shape, item: null, parent: env.items } }
    return { header: blocksOf(zones.header, written), body: blocksOf(zones.body, written), footer: blocksOf(zones.footer, written), empty: false }
  }
  // An unresolved block prints nothing.
  if (!list) return { header: [], body: [], footer: [], empty: false }
  const inner = (item: ItemContext): Env => ({ ...env, items: { shape, item, parent: env.items } })
  const table = bodyTable(zones.body)
  const body = table ? expandTable(table, list.items, env, inner) : list.items.flatMap((item) => blocksOf(zones.body, inner(item)))
  return { header: blocksOf(zones.header, env), body, footer: blocksOf(zones.footer, env), empty: list.items.length === 0 }
}

function renderRepeat(repeat: ProseNode, env: Env): ProseNode[] {
  const parts = repeatParts(repeat, env)
  return [...parts.header, ...parts.body, ...parts.footer]
}

// Why an embed can't be drawn here, or null.
export function embedProblem(id: string, resolution: Resolution, stack: readonly string[], depth: number): 'cycle' | 'depth' | 'missing' | null {
  if (stack.includes(id)) return 'cycle'
  if (depth >= resolution.maxDepth) return 'depth'
  return resolution.templates.has(id) ? null : 'missing'
}

function renderEmbed(ref: ProseNode, env: Env): ProseNode[] {
  const id = String(ref.attrs.templateId)
  if (embedProblem(id, env.resolution, env.stack, env.depth)) {
    return env.mode === 'output' ? [] : [nodes.paragraph.create(null, editorSchema.text(expression(templateKey(id))))]
  }
  const template = env.resolution.templates.get(id)!
  const inner: Env = { ...env, stack: [...env.stack, id], depth: env.depth + 1 }
  return childrenOf(template.doc).flatMap((page) => childrenOf(page).flatMap((block) => renderNode(block, inner)))
}

function renderNode(node: ProseNode, env: Env): ProseNode[] {
  if (node.type === nodes.variable) {
    const value = fieldText(node, env)
    return value.length > 0 ? [editorSchema.text(value, node.marks)] : []
  }
  if (node.type === nodes.repeat) return renderRepeat(node, env)
  if (node.type === nodes.template_ref) return renderEmbed(node, env)
  if (node.isLeaf) return [node]
  const children = childrenOf(node).flatMap((child) => renderNode(child, env))
  const content = Fragment.fromArray(children)
  // A page or cell emptied by its blocks keeps an empty paragraph, so the result stays valid.
  if (!node.type.validContent(content)) return [node.type.createAndFill(node.attrs, children.length ? content : null, node.marks) ?? node.copy(content)]
  // Rendered rows carry no zone: zones belong to the template.
  if (node.type === nodes.table_row && rowZone(node) !== 'body') return [node.type.create({ ...node.attrs, zone: 'body' }, content, node.marks)]
  return [node.copy(content)]
}

function envOf(resolution: Resolution, options: RenderOptions, stack: readonly string[], depth: number): Env {
  const mode = options.mode ?? 'output'
  return { resolution, mode, missingItemValue: options.missingItemValue ?? (mode === 'output' ? '' : EDITOR_MISSING_ITEM_VALUE), items: null, stack, depth }
}

const rootStack = (resolution: Resolution): readonly string[] => (resolution.rootId ? [resolution.rootId] : [])

// The whole document as it prints: same schema, no field, repeat or embed left.
export function renderDocument(doc: ProseNode, resolution: Resolution, options: RenderOptions = {}): ProseNode {
  return renderNode(doc, envOf(resolution, options, rootStack(resolution), 0))[0]!
}

// The blocks one node (a repeat or an embed met at the top of the document) draws in the editor.
export function renderBlocks(node: ProseNode, resolution: Resolution, options: RenderOptions = {}): ProseNode[] {
  return renderNode(node, envOf(resolution, { mode: 'editor', ...options }, rootStack(resolution), 0))
}

// A repeat's blocks as written, each field shown by its expression.
export const templateOf = (repeat: ProseNode, resolution: Resolution): ProseNode[] => renderBlocks(repeat, resolution, { mode: 'expressions' })

// The zones of one repeating block as the editor draws them.
export function renderRepeatParts(node: ProseNode, resolution: Resolution, options: RenderOptions = {}): RepeatParts {
  return repeatParts(node, envOf(resolution, { mode: 'editor', ...options }, rootStack(resolution), 0))
}
