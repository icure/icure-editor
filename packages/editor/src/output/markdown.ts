// Markdown output (CommonMark with GFM tables): the rendered document's nodes written as Markdown.
// Pages are separated by a thematic break; bold and italic are kept; what Markdown can't say
// (underline, font, size, colour, alignment, cell colours) is dropped. Every character of a value
// that Markdown would read as syntax is escaped, so a value stays text.
import type { Mark, Node as ProseNode } from 'prosemirror-model'

import { safeAltText } from '../images.ts'
import { renderDocument, type RenderOptions } from '../render.ts'
import type { Resolution } from '../resolve.ts'
import { editorSchema } from '../schema.ts'

const { nodes, marks } = editorSchema

export interface MarkdownOptions {
  // What a field writes: its value (`output`, default) or its expression (`expressions`).
  readonly mode?: Extract<RenderOptions['mode'], 'output' | 'expressions'>
  // Whether images are written (with their provider-resolved source, often a long `data:` URI).
  readonly images?: boolean
}

export const PAGE_BREAK = '---'

// Emphasis delimiters, outermost first.
const EMPHASES: readonly { readonly mark: (typeof marks)[keyof typeof marks]; readonly delimiter: string }[] = [
  { mark: marks.strong, delimiter: '**' },
  { mark: marks.em, delimiter: '*' },
]

// Characters that are Markdown syntax anywhere in a line (CommonMark lets any ASCII punctuation be
// backslash-escaped); `|` too, for table cells.
const escapeInline = (text: string): string => text.replace(/[\\`*_[\]<>&~|]/g, '\\$&')

// Line starts Markdown would read as a heading, list item, quote or setext underline.
const escapeLineStart = (line: string): string =>
  line
    .replace(/^[ \t]+/, '')
    .replace(/^(#{1,6})(?=\s|$)/, '\\$1')
    .replace(/^([-+])(?=\s|$)/, '\\$1')
    .replace(/^(=+|-+)$/, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2')

// A link destination: no whitespace, parentheses or angle brackets left raw.
const escapeDestination = (src: string): string => src.replace(/[\s()<>]/g, (c) => encodeURIComponent(c))

const emphasesOf = (markSet: readonly Mark[]) => EMPHASES.filter(({ mark }) => mark.isInSet(markSet))

function inlineContent(block: ProseNode, resolution: Resolution, options: MarkdownOptions): string {
  let out = ''
  let open: (typeof EMPHASES)[number][] = []
  // Closes delimiters down to `keep`, leaving trailing spaces outside them (CommonMark flanking).
  const closeTo = (keep: number) => {
    if (open.length <= keep) return
    const trailing = /\s*$/.exec(out)![0]
    out = out.slice(0, out.length - trailing.length)
    for (let i = open.length - 1; i >= keep; i--) out += open[i]!.delimiter
    out += trailing
    open = open.slice(0, keep)
  }
  block.forEach((node) => {
    let text: string
    if (node.isText) text = escapeInline(node.text ?? '')
    else if (node.type === nodes.hard_break) text = '\\\n'
    else if (node.type === nodes.image) {
      const resolved = resolution.images.get(String(node.attrs.imageId))
      if (!resolved || options.images === false) return
      const alt = safeAltText(node.attrs.alt) || safeAltText(resolved.alt)
      text = `![${escapeInline(alt)}](${escapeDestination(resolved.src)})`
    } else return
    const want = emphasesOf(node.marks)
    let keep = 0
    while (keep < open.length && open[keep] === want[keep]) keep++
    closeTo(keep)
    // Leading spaces stay outside the delimiters being opened.
    const leading = want.length > open.length ? /^\s*/.exec(text)![0] : ''
    out += leading
    for (const emphasis of want.slice(keep)) out += emphasis.delimiter
    open = want
    out += text.slice(leading.length)
  })
  closeTo(0)
  return out.split('\n').map(escapeLineStart).join('\n').trimEnd()
}

const childrenOf = (node: ProseNode): ProseNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))

// A cell's blocks on one line (a GFM cell can't hold line breaks).
const cellText = (cell: ProseNode, resolution: Resolution, options: MarkdownOptions): string =>
  childrenOf(cell)
    .map((block) => blockText(block, resolution, options).replace(/\\?\n/g, ' '))
    .filter((text) => text.length > 0)
    .join(' ')

function tableText(table: ProseNode, resolution: Resolution, options: MarkdownOptions): string {
  const rows = childrenOf(table).map((row) => ({
    header: row.childCount > 0 && childrenOf(row).every((cell) => cell.type === nodes.table_header),
    // A cell spanning columns is followed by empty ones, so the columns stay aligned.
    cells: childrenOf(row).flatMap((cell) => [cellText(cell, resolution, options), ...Array<string>(Math.max(0, Number(cell.attrs.colspan) - 1 || 0)).fill('')]),
  }))
  if (rows.length === 0) return ''
  const columns = Math.max(1, ...rows.map((row) => row.cells.length))
  const line = (cells: readonly string[]) => `| ${Array.from({ length: columns }, (_, i) => cells[i] ?? '').join(' | ')} |`
  // GFM needs a header row: the table's own, else an empty one.
  const [first, ...rest] = rows
  const header = first!.header ? first!.cells : []
  const body = first!.header ? rest : rows
  return [line(header), line(Array<string>(columns).fill('---')), ...body.map((row) => line(row.cells))].join('\n')
}

function blockText(block: ProseNode, resolution: Resolution, options: MarkdownOptions): string {
  if (block.type === nodes.heading) {
    const text = inlineContent(block, resolution, options)
    return text ? `${'#'.repeat(Math.min(6, Math.max(1, Number(block.attrs.level) || 1)))} ${text.replace(/\\\n/g, ' ')}` : ''
  }
  if (block.type === nodes.table) return tableText(block, resolution, options)
  if (block.inlineContent) return inlineContent(block, resolution, options)
  return childrenOf(block)
    .map((child) => blockText(child, resolution, options))
    .filter((text) => text.length > 0)
    .join('\n\n')
}

// The filled document as Markdown: blocks separated by a blank line (an empty paragraph writes
// nothing), pages by a thematic break.
export function toMarkdown(doc: ProseNode, resolution: Resolution, options: MarkdownOptions = {}): string {
  const rendered = renderDocument(doc, resolution, { mode: options.mode ?? 'output' })
  const pages = childrenOf(rendered)
    .map((page) => blockText(page, resolution, options))
    .filter((text) => text.length > 0)
  return pages.length ? `${pages.join(`\n\n${PAGE_BREAK}\n\n`)}\n` : ''
}
