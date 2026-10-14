// Editing a repeating block or an embedded template in place: a nested ProseMirror editor mounted in
// the block's node view (the footnote pattern), under a bar with Done and Cancel. The main document
// never holds a half-edited state: Done writes the block back in one transaction, Cancel and Escape
// discard. One `EditingLevel` per editor view (the document's, and each editing area's) holds at most
// one open `InlineSession`; a block inside an editing area opens one level down.
import { baseKeymap } from 'prosemirror-commands'
import { gapCursor } from 'prosemirror-gapcursor'
import { closeHistory, history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { Fragment, type Node as ProseNode } from 'prosemirror-model'
import { EditorState, NodeSelection, Plugin, Selection, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { goToNextCell, tableEditing } from 'prosemirror-tables'
import { EditorView, type Decoration } from 'prosemirror-view'

import { toggleEm, toggleStrong, toggleUnderline } from '../commands.ts'
import type { MaybePromise } from '../context.ts'
import { dropEmptyZones, editingKey, editingPlugin, editingTarget, SESSION_SPEC, templateBlocks, withAllZones } from '../editing.ts'
import type { EditorLabels } from '../labels.ts'
import { paginationPlugin } from '../pagination.ts'
import type { Resolution } from '../resolve.ts'
import { editorSchema } from '../schema.ts'
import { nodeViews } from './nodeViews.ts'

const { nodes } = editorSchema

export const KEYMAP: Readonly<Record<string, Command>> = { 'Mod-b': toggleStrong, 'Mod-i': toggleEm, 'Mod-u': toggleUnderline, 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo, Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) }

// What the editing areas ask of the editor around them.
export interface EditingHost {
  labels(): EditorLabels
  resolution(): Resolution
  // The provider's label of a repeat source (its key when unknown).
  sourceLabel(source: string): string
  saveTemplate(): ((id: string, content: unknown) => MaybePromise<void>) | null
  // A template was saved: forget the cached templates and resolve again.
  templateSaved(): void
  // An area opened or closed, or its editor changed: the toolbar follows.
  changed(): void
}

export type SessionKind = 'repeat' | 'template'

const isBlockAtom = (node: ProseNode | null | undefined): node is ProseNode => !!node && (node.type === nodes.repeat || node.type === nodes.template_ref)

// An arrow at the edge of a line next to a repeating block or an embedded template selects the block
// whole (the gap cursor would otherwise step inside a block whose body ends with a table).
function selectAdjacentBlock(dir: -1 | 1, vertical: boolean): Command {
  return (state, dispatch, view) => {
    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.empty || !view) return false
    if (!view.endOfTextblock(vertical ? (dir < 0 ? 'up' : 'down') : dir < 0 ? 'backward' : 'forward')) return false
    const { $head } = selection
    const side = dir > 0 ? $head.after() : $head.before()
    const $side = state.doc.resolve(side)
    const node = dir > 0 ? $side.nodeAfter : $side.nodeBefore
    if (!isBlockAtom(node)) return false
    dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, dir > 0 ? side : side - node.nodeSize)).scrollIntoView())
    return true
  }
}

// The plugins of an editor view (the document's, or an editing area's).
export function editorPlugins(level: EditingLevel, options: { readonly paginate?: boolean; readonly keys?: Readonly<Record<string, Command>> } = {}) {
  return [history(), ...level.plugins(), keymap({ ...options.keys }), keymap(KEYMAP), keymap(baseKeymap), gapCursor(), tableEditing(), ...(options.paginate ? [paginationPlugin()] : [])]
}

export class EditingLevel {
  view: EditorView | null = null
  session: InlineSession | null = null
  enabled = true

  constructor(
    readonly host: EditingHost,
    readonly parent: InlineSession | null,
  ) {}

  plugins(): Plugin[] {
    const openSelected: Command = (state) => {
      const { selection } = state
      return selection instanceof NodeSelection && this.open(selection.from)
    }
    // A block that left the document (or the view was rebuilt without it) closes its area.
    const watch = new Plugin({ view: () => ({ update: (view) => void (this.session && !editingTarget(view.state) && this.discard()) }) })
    const arrows = { ArrowLeft: selectAdjacentBlock(-1, false), ArrowRight: selectAdjacentBlock(1, false), ArrowUp: selectAdjacentBlock(-1, true), ArrowDown: selectAdjacentBlock(1, true) }
    return [editingPlugin(), watch, keymap({ Enter: openSelected, ...arrows })]
  }

  // The sessions from the outermost to this level's (excluded).
  chain(): InlineSession[] {
    const sessions: InlineSession[] = []
    for (let s = this.parent; s; s = s.parent.parent) sessions.unshift(s)
    return sessions
  }

  // The content an area for this node edits, or null when it can't be opened.
  private contentFor(node: ProseNode): ProseNode | null {
    if (node.type === nodes.repeat) return withAllZones(node)
    if (node.type !== nodes.template_ref) return null
    const id = String(node.attrs.templateId)
    const resolution = this.host.resolution()
    // A template that can't be drawn (missing, or embedding itself) has nothing to edit.
    if (id === resolution.rootId || this.chain().some((s) => s.kind === 'template' && s.key === id)) return null
    return resolution.templates.get(id)?.doc ?? null
  }

  open(pos: number): boolean {
    const view = this.view
    if (!view || !this.enabled) return false
    const node = view.state.doc.nodeAt(pos)
    const content = node && this.contentFor(node)
    if (!node || !content) return false
    this.session?.cancel()
    const session = new InlineSession(this, node, content)
    this.session = session
    view.dispatch(view.state.tr.setMeta(editingKey, { open: { pos, session } }))
    session.focusStart()
    this.host.changed()
    return true
  }

  // The session whose block these decorations mark (the node view adopts its area).
  adopt(decorations: readonly Decoration[]): InlineSession | null {
    const session = this.session
    return session && decorations.some((d) => (d.spec as Record<string, unknown>)[SESSION_SPEC] === session) ? session : null
  }

  innermost(): InlineSession | null {
    let session = this.session
    while (session?.level.session) session = session.level.session
    return session
  }

  // Closes the open area, discarding it. It may run inside the view's own update (the block left the
  // document), so the view is told afterwards: it drops the block's mark and becomes editable again.
  discard(): void {
    const session = this.session
    if (!session) return
    this.session = null
    session.destroy()
    this.host.changed()
    const view = this.view
    queueMicrotask(() => {
      if (!view || view.isDestroyed || this.session) return
      if (editingTarget(view.state)) view.dispatch(view.state.tr.setMeta(editingKey, { close: true }))
      else view.setProps({})
    })
  }

  // Cancels the open area (read-only switched on).
  closeAll(): void {
    this.session?.cancel()
  }

  // A new resolution or new labels: the areas draw their blocks again.
  refresh(): void {
    this.session?.refresh()
  }
}

let nextId = 0

const SVG = 'http://www.w3.org/2000/svg'

// The bar's icons (✓ Done, × Cancel): decorative, drawn in the text colour like the toolbar's.
const ICONS = { done: ['M20 6 9 17l-5-5'], cancel: ['M18 6 6 18', 'M6 6l12 12'] } as const

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  const attrs = { class: 'ie-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  for (const [name, value] of Object.entries(attrs)) svg.setAttribute(name, value)
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

export class InlineSession {
  readonly kind: SessionKind
  // The repeat source or the template id.
  readonly key: string
  title: string
  readonly dom: HTMLElement
  readonly view: EditorView
  readonly level: EditingLevel
  // The content as opened (a template that didn't change closes without asking).
  private readonly original: ProseNode
  private readonly hintId: string
  private readonly titleText: HTMLElement
  private readonly hint: HTMLElement
  private readonly actions: HTMLElement
  private readonly alert: HTMLElement
  private destroyed = false
  // The question is shown (Done on a changed template).
  private asking = false
  // The shared template is being saved: the area can't be edited, left or answered again.
  private saving = false

  constructor(
    readonly parent: EditingLevel,
    node: ProseNode,
    content: ProseNode,
  ) {
    const host = parent.host
    const labels = host.labels().inlineEditing
    this.kind = node.type === nodes.repeat ? 'repeat' : 'template'
    this.key = String(this.kind === 'repeat' ? node.attrs.source : node.attrs.templateId)
    this.title = this.titleFor()
    this.original = content
    this.level = new EditingLevel(host, this)

    const hintId = (this.hintId = `ie-inline-hint-${++nextId}`)
    this.dom = element('div', 'ie-inline')
    this.dom.setAttribute('role', 'group')
    this.dom.setAttribute('aria-label', this.title)
    this.dom.setAttribute('aria-describedby', hintId)
    const bar = element('div', 'ie-inline-bar')
    this.hint = element('span', 'ie-inline-hint', labels.hint)
    this.hint.id = hintId
    this.alert = element('div', 'ie-inline-alert')
    this.alert.setAttribute('role', 'alert')
    this.actions = element('div', 'ie-inline-actions')
    this.titleText = element('span', 'ie-inline-title', this.title)
    const heading = element('div', 'ie-inline-heading')
    heading.append(this.titleText, this.hint, this.alert)
    bar.append(heading, this.actions)
    const mount = element('div', 'ie-inline-canvas')
    this.dom.append(bar, mount)
    this.showEditing()
    // Escape cancels, from the editor or the bar; an inner area handles its own (ProseMirror marks
    // Escape as handled, so `defaultPrevented` can't tell). A tooltip shown in the bar is dismissed
    // first (WCAG 1.4.13).
    this.dom.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      const tooltip = this.actions.querySelector('.ie-tooltip')
      if (tooltip) tooltip.remove()
      else this.cancel()
    })

    const done: Command = () => {
      void this.done()
      return true
    }
    this.view = new EditorView(
      { mount },
      {
        state: EditorState.create({ doc: content, plugins: editorPlugins(this.level, { keys: { 'Mod-Enter': done } }) }),
        nodeViews: this.nodeViews(),
        editable: () => !this.level.session && !this.saving,
        attributes: this.attributes(),
        dispatchTransaction: (tr: Transaction) => {
          if (this.destroyed) return
          this.view.updateState(this.view.state.apply(tr))
          host.changed()
        },
      },
    )
    this.level.view = this.view
  }

  private attributes(): Record<string, string> {
    return { role: 'textbox', 'aria-multiline': 'true', 'aria-label': this.title, 'aria-describedby': this.hintId, class: 'ie-inline-canvas' }
  }

  private titleFor(): string {
    const host = this.parent.host
    const labels = host.labels().inlineEditing
    return this.kind === 'repeat' ? labels.editRepeat(host.sourceLabel(this.key)) : labels.editTemplate(host.resolution().templates.get(this.key)?.name ?? this.key)
  }

  private nodeViews() {
    const host = this.parent.host
    return nodeViews({ resolution: host.resolution(), showExpressions: true, labels: host.labels(), editing: this.level, zones: true })
  }

  private button(label: string, onPress: () => void): HTMLButtonElement {
    const button = element('button', 'ie-button', label)
    button.type = 'button'
    button.addEventListener('click', onPress)
    return button
  }

  // A small square button showing an icon; its name is its `aria-label`, and shows as a tooltip while
  // it is pointed at or focused (as the toolbar's).
  private iconButton(label: string, paths: readonly string[], onPress: () => void): HTMLElement {
    const button = element('button', 'ie-button ie-inline-icon')
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.append(icon(paths))
    button.addEventListener('click', onPress)
    const tip = element('span', 'ie-tip')
    const show = () => {
      if (tip.querySelector('.ie-tooltip')) return
      const bubble = element('span', 'ie-tooltip', label)
      bubble.setAttribute('aria-hidden', 'true')
      tip.append(bubble)
    }
    const hide = () => tip.querySelector('.ie-tooltip')?.remove()
    tip.addEventListener('pointerenter', show)
    tip.addEventListener('pointerleave', hide)
    button.addEventListener('focus', show)
    button.addEventListener('blur', hide)
    tip.append(button)
    return tip
  }

  private showEditing(): void {
    this.asking = false
    const labels = this.parent.host.labels().inlineEditing
    this.actions.replaceChildren(this.iconButton(labels.done, ICONS.done, () => void this.done()), this.iconButton(labels.cancel, ICONS.cancel, () => this.cancel()))
  }

  // Done on a template: update the shared template (when the host can save it), make a copy for this
  // document, or keep editing.
  private ask(focus = true): void {
    this.asking = true
    const host = this.parent.host
    const labels = host.labels().inlineEditing
    const save = host.saveTemplate()
    const question = element('div', 'ie-inline-question')
    question.setAttribute('role', 'group')
    question.setAttribute('aria-label', labels.question)
    question.append(
      ...(save ? [this.button(labels.updateShared, () => void this.updateShared(save, question))] : []),
      this.button(labels.makeCopy, () => this.makeCopy()),
      this.button(labels.keepEditing, () => {
        this.alert.textContent = ''
        this.showEditing()
        this.view.focus()
      }),
    )
    this.actions.replaceChildren(question)
    if (focus) question.querySelector('button')?.focus()
  }

  private async updateShared(save: (id: string, content: unknown) => MaybePromise<void>, question: HTMLElement): Promise<void> {
    if (this.saving) return
    const buttons = [...question.querySelectorAll('button')]
    buttons.forEach((b) => (b.disabled = true))
    this.alert.textContent = ''
    this.setSaving(true)
    try {
      // ProseMirror JSON of the editor schema, never HTML.
      await save(this.key, this.view.state.doc.toJSON())
    } catch {
      this.setSaving(false)
      if (this.destroyed) return
      buttons.forEach((b) => (b.disabled = false))
      this.alert.textContent = this.parent.host.labels().inlineEditing.saveFailed
      return
    }
    this.setSaving(false)
    // Saved, even if the area was closed meanwhile (the editor unmounted): the document shows it.
    if (!this.destroyed) this.finish(null)
    this.parent.host.templateSaved()
  }

  private setSaving(saving: boolean): void {
    this.saving = saving
    if (!this.destroyed) this.view.setProps({})
  }

  // The reference is replaced by the edited blocks (fields stay fields, resolved against the document).
  private makeCopy(): void {
    const blocks = Fragment.fromArray(templateBlocks(this.view.state.doc))
    this.finish((tr, pos, old) => void tr.replaceWith(pos, pos + old.nodeSize, blocks))
  }

  // The cursor at the start of the body (a block) or of the template.
  focusStart(): void {
    const { doc } = this.view.state
    let start = 0
    if (this.kind === 'repeat') doc.forEach((zone, offset) => void (zone.type === nodes.repeat_body && (start = offset + 1)))
    const selection = Selection.findFrom(doc.resolve(start), 1) ?? Selection.atStart(doc)
    this.view.dispatch(this.view.state.tr.setSelection(selection))
    this.view.focus()
  }

  // A new resolution or new labels: the bar and the blocks are drawn again.
  refresh(): void {
    if (this.destroyed) return
    this.title = this.titleFor()
    this.titleText.textContent = this.title
    this.dom.setAttribute('aria-label', this.title)
    this.hint.textContent = this.parent.host.labels().inlineEditing.hint
    if (!this.saving) {
      if (this.asking) this.ask(false)
      else this.showEditing()
    }
    this.view.setProps({ nodeViews: this.nodeViews(), attributes: this.attributes() })
    this.level.refresh()
  }

  async done(): Promise<void> {
    if (this.destroyed || this.saving) return
    // An area open inside this one is discarded first (one level at a time).
    this.level.discard()
    if (this.kind === 'repeat') {
      const next = dropEmptyZones(this.view.state.doc)
      this.finish((tr, pos, old) => {
        if (!next.eq(old)) tr.replaceWith(pos, pos + old.nodeSize, next)
      })
    } else if (this.view.state.doc.eq(this.original)) {
      this.finish(null)
    } else {
      this.ask()
    }
  }

  // While the shared template is being saved, the save decides (it may have reached the host already).
  cancel(): void {
    if (!this.destroyed && !this.saving) this.finish(null)
  }

  // Closes the area, applies `change` to the parent's document (in one undoable step), and gives the
  // focus back to the parent with the block selected.
  private finish(change: ((tr: Transaction, pos: number, old: ProseNode) => void) | null): void {
    const parent = this.parent
    const view = parent.view
    const target = view ? editingTarget(view.state) : null
    parent.session = null
    this.destroy()
    if (view && target) {
      const tr = view.state.tr
      const old = tr.doc.nodeAt(target.pos)!
      change?.(tr, target.pos, old)
      tr.setMeta(editingKey, { close: true })
      const now = tr.doc.nodeAt(target.pos)
      tr.setSelection(now && (now.type === nodes.repeat || now.type === nodes.template_ref) ? NodeSelection.create(tr.doc, target.pos) : Selection.near(tr.doc.resolve(target.pos)))
      view.dispatch(tr.docChanged ? closeHistory(tr) : tr)
      // The next edit starts its own undo step.
      if (tr.docChanged) view.dispatch(closeHistory(view.state.tr))
      view.focus()
    }
    parent.host.changed()
  }

  destroy(): void {
    if (this.destroyed) return
    this.level.discard()
    this.destroyed = true
    this.view.destroy()
    this.dom.remove()
  }
}
