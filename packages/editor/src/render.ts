// Rendering a document against its resolution: fields become text, repeating blocks are drawn once
// per item, embedded templates are inlined (guarded against cycles and depth, like the resolver).
// Pure, and nothing is evaluated: a value is text, looked up by key.
//
// Repeating blocks: a block whose content is a single table repeats the table's body rows and keeps
// its header rows once; any other block repeats all its content.
import { Fragment, type Node as ProseNode } from 'prosemirror-model'

import { fieldKey, templateKey } from './document.ts'
import type { ItemContext, Resolution } from './resolve.ts'
import { editorSchema } from './schema.ts'

const { nodes } = editorSchema

export interface RenderOptions {
  // `output`: what is printed (an unresolved reference prints nothing). `editor`: what the editor
  // draws inside blocks and embeds (an unresolved field shows its expression). `expressions`: every
  // field shown as its expression.
  readonly mode?: 'output' | 'editor' | 'expressions'
  // The text of an item field the item has no value for (default: '' in output, '—' in the editor).
  readonly missingItemValue?: string
}

interface Env {
  readonly resolution: Resolution
  readonly mode: 'output' | 'editor' | 'expressions'
  readonly missingItemValue: string
  readonly item: ItemContext | null
  readonly itemFields: ReadonlySet<string> | null
  readonly stack: readonly string[]
  readonly depth: number
}

export const expression = (key: string): string => `{${key}}`
export const EDITOR_MISSING_ITEM_VALUE = '—'

function fieldText(node: ProseNode, env: Env): string {
  const name = String(node.attrs.name)
  const key = fieldKey(name, node.attrs.label as string | null)
  if (env.mode === 'expressions') return expression(key)
  if (env.itemFields?.has(name)) return env.item?.get(key) ?? env.missingItemValue
  const value = env.resolution.fields.get(key)
  if (value !== undefined) return value
  return env.mode === 'editor' ? expression(key) : ''
}

const isHeaderRow = (row: ProseNode): boolean => row.childCount > 0 && Array.from({ length: row.childCount }, (_, i) => row.child(i)).every((cell) => cell.type === nodes.table_header)
const childrenOf = (node: ProseNode): ProseNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))

function expandTable(table: ProseNode, items: readonly ItemContext[], env: Env): ProseNode[] {
  const rows = childrenOf(table)
  const header = rows.filter(isHeaderRow).flatMap((row) => renderNode(row, { ...env, item: null }))
  const body = rows.filter((row) => !isHeaderRow(row))
  const repeated = items.flatMap((item) => body.flatMap((row) => renderNode(row, { ...env, item })))
  // A table without body rows lists nothing: it isn't drawn.
  return repeated.length === 0 ? [] : [table.copy(Fragment.fromArray([...header, ...repeated]))]
}

// The blocks a repeating block draws.
function renderRepeat(repeat: ProseNode, env: Env): ProseNode[] {
  const source = String(repeat.attrs.source)
  const data = env.resolution.repeats.get(source)
  const itemFields = data?.itemFields ?? env.resolution.itemFieldsOf.get(source) ?? new Set<string>()
  // Shown as written: with expressions, and in the editor while the block is unresolved.
  if (env.mode === 'expressions' || (env.mode === 'editor' && !data)) {
    return childrenOf(repeat).flatMap((block) => renderNode(block, { ...env, mode: 'expressions', item: null, itemFields }))
  }
  const items = data?.items ?? []
  const inner: Env = { ...env, itemFields }
  const only = repeat.childCount === 1 ? repeat.child(0) : null
  if (only?.type === nodes.table) return expandTable(only, items, inner)
  return items.flatMap((item) => childrenOf(repeat).flatMap((block) => renderNode(block, { ...inner, item })))
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
  return [node.copy(content)]
}

function envOf(resolution: Resolution, options: RenderOptions, stack: readonly string[], depth: number): Env {
  const mode = options.mode ?? 'output'
  return { resolution, mode, missingItemValue: options.missingItemValue ?? (mode === 'output' ? '' : EDITOR_MISSING_ITEM_VALUE), item: null, itemFields: null, stack, depth }
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
