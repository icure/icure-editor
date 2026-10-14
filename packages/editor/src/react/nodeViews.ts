// How the editor draws its references: a field as its value (or its expression), a repeating block
// expanded for its items, an embedded template inlined, an image from the provider's source. Every
// value goes in as text (`textContent`, or text nodes through the schema's serializer), never as HTML.
import { Fragment, type Node as ProseNode } from 'prosemirror-model'
import type { EditorView, NodeViewConstructor } from 'prosemirror-view'

import { fieldKey, imageKey, templateKey } from '../document.ts'
import { clampImageWidth, safeAltText } from '../images.ts'
import type { EditorLabels } from '../labels.ts'
import { createSerializer } from '../output/html.ts'
import { embedProblem, expression, renderBlocks } from '../render.ts'
import type { Resolution } from '../resolve.ts'
import { EMBED_CLASS, FIELD_CLASS, IMAGE_CLASS, REPEAT_CLASS } from '../schema.ts'
import { reflow } from '../pagination.ts'

export interface ViewInputs {
  readonly resolution: Resolution
  readonly showExpressions: boolean
  readonly labels: EditorLabels
}

const UNRESOLVED_CLASS = 'ie-unresolved-ref'

function blocksDom(blocks: readonly ProseNode[], resolution: Resolution): Node {
  return createSerializer(resolution, { missingImage: 'expression' }).serializeFragment(Fragment.fromArray([...blocks]))
}

function repeatView(node: ProseNode, { resolution, showExpressions, labels }: ViewInputs) {
  const source = String(node.attrs.source)
  const resolved = resolution.repeats.has(source)
  const dom = document.createElement('div')
  dom.className = [REPEAT_CLASS, resolved ? null : UNRESOLVED_CLASS].filter(Boolean).join(' ')
  dom.dataset.repeat = source
  const shown = renderBlocks(node, resolution, { mode: showExpressions ? 'expressions' : 'editor' })
  if (shown.length > 0) dom.append(blocksDom(shown, resolution))
  else {
    const empty = document.createElement('p')
    empty.className = 'ie-repeat-empty'
    empty.textContent = labels.repeatEmpty
    dom.append(empty)
  }
  // Drawn from the items: its content isn't edited in place.
  return { dom, ignoreMutation: () => true, stopEvent: () => false }
}

function embedView(node: ProseNode, { resolution, showExpressions, labels }: ViewInputs) {
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
  }
  return { dom, ignoreMutation: () => true }
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
  // A loaded image changes the page's height: paginate again.
  dom.addEventListener('load', () => queueMicrotask(() => !view.isDestroyed && reflow(view)), { once: true })
  return { dom }
}

export function nodeViews(inputs: ViewInputs): Record<string, NodeViewConstructor> {
  const { resolution, showExpressions } = inputs
  return {
    variable: (node) => {
      const key = fieldKey(String(node.attrs.name), node.attrs.label as string | null)
      const value = resolution.fields.get(key)
      const dom = document.createElement('span')
      dom.className = [FIELD_CLASS, value === undefined ? UNRESOLVED_CLASS : null].filter(Boolean).join(' ')
      dom.dataset.field = key
      dom.textContent = showExpressions || value === undefined ? expression(key) : value
      return { dom }
    },
    repeat: (node) => repeatView(node, inputs),
    template_ref: (node) => embedView(node, inputs),
    image: (node, view) => imageView(node, view, inputs),
  }
}
