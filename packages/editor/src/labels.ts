// Every user-facing string of the editor. The host passes its own (any subset); English defaults
// fill the rest. Field, block and template names come from the data provider, already translated.
import type { BlockStyle } from './commands.ts'
import type { ImageFileError } from './images.ts'
import type { UnresolvedReason } from './context.ts'

export type ShownAlignment = 'left' | 'center' | 'right' | 'justify'
export type TableAction = 'addRow' | 'addColumn' | 'deleteRow' | 'deleteColumn'

export interface EditorLabels {
  readonly canvas: string
  readonly toolbar: string
  readonly undo: string
  readonly redo: string
  readonly blockStyle: string
  readonly blockStyles: Readonly<Record<BlockStyle, string>>
  readonly font: string
  readonly size: string
  readonly bold: string
  readonly italic: string
  readonly underline: string
  readonly boldGlyph: string
  readonly italicGlyph: string
  readonly underlineGlyph: string
  readonly colour: string
  readonly alignment: string
  readonly align: Readonly<Record<ShownAlignment, string>>
  readonly insertTable: string
  readonly tableMenu: string
  readonly table: Readonly<Record<TableAction, string>>
  readonly insertField: string
  readonly insertBlock: string
  readonly insertTemplate: string
  readonly insertImage: string
  readonly showExpressions: string
  readonly selectedExpression: (expression: string) => string
  // The editor-only line of a block with nothing to list (never printed).
  readonly repeatEmpty: string
  // The caption over an embedded template.
  readonly embeddedTemplate: (name: string) => string
  readonly embedProblem: Readonly<Record<'cycle' | 'depth' | 'missing', string>>
  readonly image: {
    readonly panel: string
    readonly alt: string
    readonly altHint: string
    readonly width: string
    readonly widthHint: string
    readonly smaller: string
    readonly larger: string
    readonly naturalSize: string
    readonly chooseFile: string
    readonly uploading: string
    readonly errors: Readonly<Record<ImageFileError | 'upload', string>>
  }
  readonly unresolved: {
    readonly chip: (count: number) => string
    readonly title: string
    readonly hint: string
    readonly reasons: Readonly<Record<UnresolvedReason, string>>
  }
}

export const DEFAULT_LABELS: EditorLabels = {
  canvas: 'Document',
  toolbar: 'Formatting',
  undo: 'Undo',
  redo: 'Redo',
  blockStyle: 'Text style',
  blockStyles: { paragraph: 'Paragraph', heading1: 'Heading 1', heading2: 'Heading 2', heading3: 'Heading 3' },
  font: 'Font',
  size: 'Size',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  boldGlyph: 'B',
  italicGlyph: 'I',
  underlineGlyph: 'U',
  colour: 'Text colour',
  alignment: 'Alignment',
  align: { left: 'Align left', center: 'Centre', right: 'Align right', justify: 'Justify' },
  insertTable: 'Insert table',
  tableMenu: 'Table',
  table: { addRow: 'Add row', addColumn: 'Add column', deleteRow: 'Delete row', deleteColumn: 'Delete column' },
  insertField: 'Insert field',
  insertBlock: 'Insert repeating block',
  insertTemplate: 'Insert template',
  insertImage: 'Insert image',
  showExpressions: 'Show expressions',
  selectedExpression: (expression) => `Selected: ${expression}`,
  repeatEmpty: 'Nothing to list',
  embeddedTemplate: (name) => `Template: ${name}`,
  embedProblem: { cycle: 'This template embeds itself', depth: 'Templates are nested too deeply', missing: 'Template not found' },
  image: {
    panel: 'Image',
    alt: 'Image description',
    altHint: 'Read aloud by screen readers; leave empty only for a decorative image.',
    width: 'Width (px)',
    widthHint: 'Empty for the natural size, never wider than the page.',
    smaller: 'Smaller',
    larger: 'Larger',
    naturalSize: 'Natural size',
    chooseFile: 'Choose an image file',
    uploading: 'Adding the image…',
    errors: { type: 'Only PNG, JPEG, GIF and WebP images are accepted.', size: 'The image is too large.', content: 'The file is not the image it claims to be.', upload: 'The image could not be added.' },
  },
  unresolved: {
    chip: (count) => (count === 1 ? '1 unresolved reference' : `${count} unresolved references`),
    title: 'Unresolved references',
    hint: 'These print as nothing. Fill them in the source data or remove them from the document.',
    reasons: { missing: 'no value', cycle: 'embeds itself', depth: 'nested too deeply', invalid: 'invalid' },
  },
}

export type PartialLabels = {
  readonly [K in keyof EditorLabels]?: EditorLabels[K] extends (...args: never[]) => unknown ? EditorLabels[K] : EditorLabels[K] extends object ? Partial<EditorLabels[K]> : EditorLabels[K]
}

// The host's labels over the defaults (nested groups merged one level deep).
export function mergeLabels(labels: PartialLabels = {}): EditorLabels {
  const merged: Record<string, unknown> = { ...DEFAULT_LABELS }
  for (const [key, value] of Object.entries(labels)) {
    if (value === undefined) continue
    const base = (DEFAULT_LABELS as unknown as Record<string, unknown>)[key]
    merged[key] = base && typeof base === 'object' && typeof value === 'object' ? { ...base, ...value } : value
  }
  const image = merged.image as EditorLabels['image']
  const partialImage = (labels.image ?? {}) as Partial<EditorLabels['image']>
  merged.image = { ...image, errors: { ...DEFAULT_LABELS.image.errors, ...(partialImage.errors ?? {}) } }
  const unresolved = merged.unresolved as EditorLabels['unresolved']
  const partialUnresolved = (labels.unresolved ?? {}) as Partial<EditorLabels['unresolved']>
  merged.unresolved = { ...unresolved, reasons: { ...DEFAULT_LABELS.unresolved.reasons, ...(partialUnresolved.reasons ?? {}) } }
  return merged as unknown as EditorLabels
}
