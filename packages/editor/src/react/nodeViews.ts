// How the editor draws its references: a field as its value (or its expression), a repeating block
// expanded for its items, an embedded template inlined, an image from the provider's source. Every
// value goes in as text (`textContent`, or text nodes through the schema's serializer), never as HTML.
import { Fragment, type Node as ProseNode } from 'prosemirror-model'
import type { Decoration, EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view'

import { fieldKey, imageKey, templateKey } from '../document.ts'
import { isEmptyZone } from '../editing.ts'
import { clampImageWidth, safeAltText } from '../images.ts'
import type { EditorLabels } from '../labels.ts'
import { createSerializer } from '../output/html.ts'
import { embedProblem, expression, renderBlocks, renderRepeatParts } from '../render.ts'
import type { Resolution } from '../resolve.ts'
import { EMBED_CLASS, FIELD_CLASS, IMAGE_CLASS, REPEAT_BODY_CLASS, REPEAT_CLASS, REPEAT_FOOTER_CLASS, REPEAT_HEADER_CLASS, type RowZone } from '../schema.ts'
import { scheduleReflow } from '../pagination.ts'
import type { EditingLevel, InlineSession } from './inlineEditing.ts'

export interface ViewInputs {
  readonly resolution: Resolution
  readonly showExpressions: boolean
  readonly labels: EditorLabels
  // Where a block opens in place (null: read only, nothing opens).
  readonly editing?: EditingLevel | null
  // Inside an editing area: the zones of the block being edited are captioned.
  readonly zones?: boolean
}

type GetPos = () => number | undefined

// The block being edited: its editing area, adopted again whenever the node view is redrawn. The outer
// editor leaves every event and mutation inside it to the nested editor.
function editingView(className: string, session: InlineSession): NodeView {
  const hadFocus = session.view.hasFocus()
  const dom = document.createElement('div')
  dom.className = className
  dom.append(session.dom)
  if (hadFocus) queueMicrotask(() => !session.view.isDestroyed && session.view.focus())
  return { dom, ignoreMutation: () => true, stopEvent: () => true, update: () => false }
}

// A double-click opens the block in place (Enter, on the selected block, is the keyboard path).
function openOnDoubleClick(dom: HTMLElement, getPos: GetPos, editing: EditingLevel | null | undefined): void {
  if (!editing?.enabled) return
  dom.addEventListener('dblclick', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const pos = getPos()
    if (pos !== undefined) editing.open(pos)
  })
}

const ZONES: ReadonlyMap<string, RowZone> = new Map([
  ['repeat_header', 'header'],
  ['repeat_body', 'body'],
  ['repeat_footer', 'footer'],
])
const ZONE_CLASS: Readonly<Record<RowZone, string>> = { header: REPEAT_HEADER_CLASS, body: REPEAT_BODY_CLASS, footer: REPEAT_FOOTER_CLASS }

// A zone of the block being edited: a labelled area, with a placeholder while a header or footer is empty.
function zoneView(node: ProseNode, labels: EditorLabels): NodeView {
  const zone = ZONES.get(node.type.name) ?? 'body'
  const dom = document.createElement('div')
  dom.className = `ie-zone ${ZONE_CLASS[zone]}`
  dom.dataset.zone = zone
  dom.setAttribute('role', 'group')
  dom.setAttribute('aria-label', labels.inlineEditing[zone])
  const caption = document.createElement('div')
  caption.className = 'ie-zone-caption'
  caption.contentEditable = 'false'
  caption.setAttribute('aria-hidden', 'true')
  caption.textContent = labels.inlineEditing[zone]
  const contentDOM = document.createElement('div')
  contentDOM.className = 'ie-zone-content'
  if (zone !== 'body') contentDOM.dataset.placeholder = zone === 'header' ? labels.inlineEditing.addHeader : labels.inlineEditing.addFooter
  dom.append(caption, contentDOM)
  const mark = (current: ProseNode) => dom.toggleAttribute('data-empty', zone !== 'body' && isEmptyZone(current))
  mark(node)
  return {
    dom,
    contentDOM,
    update: (next) => {
      if (next.type !== node.type) return false
      mark(next)
      return true
    },
    ignoreMutation: (mutation) => caption.contains(mutation.target),
  }
}

const UNRESOLVED_CLASS = 'ie-unresolved-ref'

function blocksDom(blocks: readonly ProseNode[], resolution: Resolution): Node {
  return createSerializer(resolution, { missingImage: 'expression' }).serializeFragment(Fragment.fromArray([...blocks]))
}

function repeatView(node: ProseNode, getPos: GetPos, decorations: readonly Decoration[], { resolution, showExpressions, labels, editing }: ViewInputs): NodeView {
  const session = editing?.adopt(decorations)
  if (session) return editingView(REPEAT_CLASS, session)
  const source = String(node.attrs.source)
  const resolved = resolution.repeats.has(source)
  const dom = document.createElement('div')
  dom.className = [REPEAT_CLASS, resolved ? null : UNRESOLVED_CLASS].filter(Boolean).join(' ')
  dom.dataset.repeat = source
  const parts = renderRepeatParts(node, resolution, { mode: showExpressions ? 'expressions' : 'editor' })
  const before = [...parts.header, ...parts.body]
  if (before.length > 0) dom.append(blocksDom(before, resolution))
  if (parts.empty) {
    const empty = document.createElement('p')
    empty.className = 'ie-repeat-empty'
    empty.textContent = labels.repeatEmpty
    dom.append(empty)
  }
  if (parts.footer.length > 0) dom.append(blocksDom(parts.footer, resolution))
  openOnDoubleClick(dom, getPos, editing)
  // Drawn from the items: its content isn't edited here. Redrawn on any change (opening it included).
  return { dom, ignoreMutation: () => true, stopEvent: () => false, update: () => false }
}

function embedView(node: ProseNode, getPos: GetPos, decorations: readonly Decoration[], { resolution, showExpressions, labels, editing }: ViewInputs): NodeView {
  const session = editing?.adopt(decorations)
  if (session) return editingView(EMBED_CLASS, session)
  const id = String(node.attrs.templateId)
  const problem = embedProblem(id, resolution, resolution.rootId ? [resolution.rootId] : [], 0)
  const dom = document.createElement('div')
  dom.className = [EMBED_CLASS, problem ? UNRESOLVED_CLASS : null].filter(Boolean).join(' ')
  dom.dataset.template = id
  dom.contentEditable = 'false'
  const caption = document.createElement('p')
  caption.className = 'ie-embed-caption'
  caption.textContent = problem ? `${labels.embedProblem[problem]} ${expression(templateKey(id))}` : labels.embeddedTemplate(resolution.templates.get(id)?.name ?? id)
  dom.append(caption)
  if (!problem) {
    const body = document.createElement('div')
    body.className = 'ie-embed-body'
    body.append(blocksDom(renderBlocks(node, resolution, { mode: showExpressions ? 'expressions' : 'editor' }), resolution))
    dom.append(body)
    openOnDoubleClick(dom, getPos, editing)
  }
  // Redrawn on any change (opening it included: a leaf would otherwise keep its view).
  return { dom, ignoreMutation: () => true, update: () => false }
}

function imageView(node: ProseNode, view: EditorView, { resolution }: ViewInputs) {
  const id = String(node.attrs.imageId)
  const resolved = resolution.images.get(id)
  if (!resolved) {
    const dom = document.createElement('span')
    dom.className = `${IMAGE_CLASS} ${UNRESOLVED_CLASS}`
    dom.dataset.imageId = id
    dom.textContent = expression(imageKey(id))
    return { dom }
  }
  const dom = document.createElement('img')
  dom.className = IMAGE_CLASS
  dom.dataset.imageId = id
  // The source was checked when resolved (images.ts): a data:, blob: or provider https: URL.
  dom.src = resolved.src
  dom.alt = safeAltText(node.attrs.alt) || safeAltText(resolved.alt)
  dom.draggable = false
  const width = clampImageWidth(node.attrs.width)
  if (width) dom.width = width
  // A loaded image (or one that failed, drawn as its description) changes the page's height:
  // paginate again (once a frame, however many load).
  for (const event of ['load', 'error']) dom.addEventListener(event, () => scheduleReflow(view), { once: true })
  return { dom }
}

export function nodeViews(inputs: ViewInputs): Record<string, NodeViewConstructor> {
  const { resolution, showExpressions } = inputs
  const zone: NodeViewConstructor = (node) => zoneView(node, inputs.labels)
  return {
    ...(inputs.zones ? { repeat_header: zone, repeat_body: zone, repeat_footer: zone } : {}),
    variable: (node) => {
      const name = String(node.attrs.name)
      const key = fieldKey(name, node.attrs.label as string | null)
      const value = resolution.fields.get(key)
      // In an editing area, an item field is filled per item: not a missing document field.
      const itemField = inputs.zones === true && [...resolution.shapes.values()].some((shape) => shape.itemFields.has(name))
      const dom = document.createElement('span')
      dom.className = [FIELD_CLASS, value === undefined && !itemField ? UNRESOLVED_CLASS : null].filter(Boolean).join(' ')
      dom.dataset.field = key
      dom.textContent = showExpressions || value === undefined ? expression(key) : value
      return { dom }
    },
    repeat: (node, _view, getPos, decorations) => repeatView(node, getPos, decorations, inputs),
    template_ref: (node, _view, getPos, decorations) => embedView(node, getPos, decorations, inputs),
    image: (node, view) => imageView(node, view, inputs),
  }
}
