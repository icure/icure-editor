// Pagination: a block that overflows its page moves to the next one, and a page with room pulls the
// next page's first block back, so the document reads as sheets of the configured format. Measured on
// the rendered pages; without a layout (tests, a hidden editor) nothing moves, nor while a block is
// edited in place. The reflow's moves are
// kept out of the undo history.
import type { Node as ProseNode } from 'prosemirror-model'
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import { editingTarget } from './editing.ts'
import { editorSchema } from './schema.ts'

// A sheet's size and margin, shared by the editor and the HTML output.
export interface PageFormat {
  readonly widthMm: number
  readonly heightMm: number
  readonly marginMm: number
}
export const A4_PAGE: PageFormat = { widthMm: 210, heightMm: 297, marginMm: 20 }

// One reflow moves at most this many blocks, so a block taller than a page can't loop.
const MAX_MOVES = 50
// Marks a transaction as the pagination's own (not a user edit).
export const PAGINATION_META = 'ie-pagination'

interface PageBox {
  readonly pos: number
  readonly node: ProseNode
  readonly dom: HTMLElement
}

function pages(view: EditorView): PageBox[] {
  const boxes: PageBox[] = []
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset)
    if (dom instanceof HTMLElement) boxes.push({ pos: offset, node, dom })
  })
  return boxes
}

const overflows = (dom: HTMLElement): boolean => dom.clientHeight > 0 && dom.scrollHeight > dom.clientHeight + 1

const own = (tr: Transaction): Transaction => tr.setMeta('addToHistory', false).setMeta(PAGINATION_META, true)

// The last block of an overflowing page, moved to the start of the next page (created if needed).
function pushLastBlock(state: EditorState, box: PageBox): Transaction | null {
  if (box.node.childCount < 2) return null
  const last = box.node.lastChild!
  const end = box.pos + box.node.nodeSize
  const from = end - 1 - last.nodeSize
  const tr = state.tr.delete(from, end - 1)
  const nextPos = tr.mapping.map(end)
  const next = tr.doc.nodeAt(nextPos)
  if (next && next.type === editorSchema.nodes.page) tr.insert(nextPos + 1, last)
  else tr.insert(nextPos, editorSchema.nodes.page.create(null, last))
  return own(tr)
}

// The next page's first block fits in this page's free room: pull it back (and drop an emptied page).
function pullFirstBlock(state: EditorState, box: PageBox, next: PageBox): Transaction | null {
  const first = next.node.firstChild
  const firstDom = next.dom.firstElementChild
  if (!first || !(firstDom instanceof HTMLElement)) return null
  const used = box.dom.lastElementChild instanceof HTMLElement ? box.dom.lastElementChild.offsetTop + box.dom.lastElementChild.offsetHeight - box.dom.offsetTop : 0
  const room = box.dom.clientHeight - used
  if (firstDom.offsetHeight >= room) return null
  const tr = next.node.childCount === 1 ? state.tr.delete(next.pos, next.pos + next.node.nodeSize) : state.tr.delete(next.pos + 1, next.pos + 1 + first.nodeSize)
  tr.insert(box.pos + box.node.nodeSize - 1, first)
  return own(tr)
}

function reflowOnce(view: EditorView): Transaction | null {
  const boxes = pages(view)
  for (const [index, box] of boxes.entries()) {
    if (overflows(box.dom)) return pushLastBlock(view.state, box)
    const next = boxes[index + 1]
    if (next && box.dom.clientHeight > 0) {
      const pulled = pullFirstBlock(view.state, box, next)
      if (pulled) return pulled
    }
  }
  return null
}

// Nothing moves while a block is open in place: a move would take the block (and its editing area)
// out of the document. The commit reflows.
export function reflow(view: EditorView): void {
  if (editingTarget(view.state)) return
  for (let moves = 0; moves < MAX_MOVES; moves++) {
    const tr = reflowOnce(view)
    if (!tr) return
    view.dispatch(tr)
  }
}

// The reflow runs after the view has drawn the change (never inside its update).
export function paginationPlugin(): Plugin {
  return new Plugin({
    view: (view) => {
      let alive = true
      // The reflow's own moves don't schedule another reflow (no oscillation between two layouts).
      let reflowing = false
      const run = () => {
        if (!alive || view.isDestroyed) return
        reflowing = true
        try {
          reflow(view)
        } finally {
          reflowing = false
        }
      }
      const schedule = () => queueMicrotask(run)
      schedule()
      return {
        update: (updated, previous) => {
          if (!reflowing && !updated.state.doc.eq(previous.doc)) schedule()
        },
        destroy: () => {
          alive = false
        },
      }
    },
  })
}
