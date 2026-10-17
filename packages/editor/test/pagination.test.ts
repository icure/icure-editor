// Pagination against a stubbed layout (jsdom has none): every page is PAGE_HEIGHT tall with PADDING
// on each side, and a block is as tall as its text says ("Block 50" is 50 px), plus its margins.
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reflow, scheduleReflow } from '../src/pagination.ts'
import { doc, image, page, paragraph, text } from './helpers.ts'

const PAGE_HEIGHT = 300
const PADDING = 20
// Blocks whose text ends with "*" have 8 px margins above and below.
const MARGIN = 8
// An image is 20 px tall until it has loaded, 50 px after.
const IMAGE_PENDING = 20
const IMAGE_LOADED = 50
let imagesLoaded = true

const isPage = (el: Element): boolean => el.classList.contains('ie-page')
const margin = (el: Element): number => (!isPage(el) && el.textContent?.endsWith('*') ? MARGIN : 0)
function height(el: Element): number {
  if (isPage(el)) return PAGE_HEIGHT
  if (el.querySelector('img')) return imagesLoaded ? IMAGE_LOADED : IMAGE_PENDING
  return Number(/\d+/.exec(el.textContent ?? '')?.[0] ?? 20)
}
const outer = (el: Element): number => height(el) + 2 * margin(el)
function top(el: Element): number {
  if (isPage(el)) return 0
  let y = PADDING
  for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) y += outer(sibling)
  return y + margin(el)
}
const contentHeight = (pageDom: Element): number => [...pageDom.children].reduce((sum, child) => sum + outer(child), 0)

const layout: Record<string, (el: Element) => number> = {
  clientHeight: (el) => (isPage(el) ? PAGE_HEIGHT : 0),
  scrollHeight: (el) => (isPage(el) ? Math.max(PAGE_HEIGHT, PADDING + contentHeight(el) + PADDING) : 0),
  offsetHeight: height,
  offsetTop: top,
}

let restore: (() => void)[] = []
beforeEach(() => {
  imagesLoaded = true
  restore = Object.entries(layout).map(([prop, measure]) => {
    const owner = prop.startsWith('offset') ? HTMLElement.prototype : Element.prototype
    const original = Object.getOwnPropertyDescriptor(owner, prop)!
    Object.defineProperty(owner, prop, { configurable: true, get(this: Element) { return measure(this) } })
    return () => Object.defineProperty(owner, prop, original)
  })
  const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete')!
  Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => imagesLoaded })
  restore.push(() => Object.defineProperty(HTMLImageElement.prototype, 'complete', complete))
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const pad = isPage(el) ? `${PADDING}px` : '0px'
    const mar = `${margin(el)}px`
    return { paddingTop: pad, paddingBottom: pad, marginTop: mar, marginBottom: mar } as CSSStyleDeclaration
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  restore.forEach((undo) => undo())
})

// Page 1 holds 11 blocks of 20 px: 40 px of its 260 px content box are free.
const fullPage = () => page(...Array.from({ length: 11 }, () => paragraph(text('Line'))))

function mount(...pages: object[]) {
  const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: doc(...pages) }) })
  let moves = 0
  view.setProps({ dispatchTransaction: (tr) => (moves++, view.updateState(view.state.apply(tr))) })
  const pageTexts = () => {
    const texts: string[][] = []
    view.state.doc.forEach((p) => {
      const blocks: string[] = []
      p.forEach((block) => blocks.push(block.textContent || (block.firstChild?.type.name ?? '')))
      texts.push(blocks)
    })
    return texts
  }
  return { view, pageTexts, moves: () => moves }
}

describe('pagination', () => {
  it('pulls back the next page’s first block when it fits the free room', () => {
    const { view, pageTexts } = mount(fullPage(), page(paragraph(text('Block 30')), paragraph(text('Block 20'))))
    reflow(view)
    expect(pageTexts()[0]!.at(-1)).toBe('Block 30')
    view.destroy()
  })

  it('settles when a block fits the room counted with the page’s bottom margin but not without it', () => {
    // 50 px: under the 40 px free plus the 20 px padding, over the 40 px free. Measured against the
    // padding, it was pulled, then overflowed and was pushed, in turn, every reflow.
    const { view, pageTexts, moves } = mount(fullPage(), page(paragraph(text('Block 50'))))
    reflow(view)
    reflow(view)
    expect(moves()).toBe(0)
    expect(pageTexts()).toHaveLength(2)
    expect(pageTexts()[1]).toEqual(['Block 50'])
    view.destroy()
  })

  it('counts a block’s margins in the room it needs', () => {
    // 30 px fits the 40 px free; with 8 px margins above and below it doesn't.
    const { view, pageTexts, moves } = mount(fullPage(), page(paragraph(text('Block 30*'))))
    reflow(view)
    expect(moves()).toBe(0)
    expect(pageTexts()[1]).toEqual(['Block 30*'])
    view.destroy()
  })

  it('pulls back only a block that fits with room to spare', () => {
    const { view, pageTexts, moves } = mount(fullPage(), page(paragraph(text('Block 39'))))
    reflow(view)
    expect(moves()).toBe(0)
    expect(pageTexts()).toHaveLength(2)
    view.destroy()
  })

  it('settles while an image alternates between its height before and after loading', () => {
    // Before loading, the image's 20 px fit the 40 px free; loaded, its 50 px don't. A block moved
    // between pages is drawn again, its image loading again: the two layouts alternate.
    imagesLoaded = false
    const { view, pageTexts, moves } = mount(fullPage(), page(paragraph(image('logo')), paragraph(text('After'))))
    for (let load = 0; load < 5; load++) {
      imagesLoaded = false
      reflow(view)
      imagesLoaded = true
      reflow(view)
    }
    expect(moves()).toBe(0)
    expect(pageTexts()[1]).toEqual(['image', 'After'])
    view.destroy()
  })

  it('reflows once a frame, however many images load meanwhile', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    try {
      const { view, pageTexts } = mount(fullPage(), page(paragraph(text('Block 30'))))
      for (let i = 0; i < 5; i++) scheduleReflow(view)
      expect(frames).toHaveLength(1)
      expect(pageTexts()).toHaveLength(2)
      frames.shift()!(0)
      expect(pageTexts()).toHaveLength(1)
      scheduleReflow(view)
      expect(frames).toHaveLength(1)
      view.destroy()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
