// Small builders of ProseMirror JSON for the sample templates.
export const text = (value: string, marks: readonly object[] = []) => ({ type: 'text', text: value, ...(marks.length ? { marks } : {}) })
export const bold = (value: string) => text(value, [{ type: 'strong' }])
export const small = (value: string) => text(value, [{ type: 'size', attrs: { size: '10px' } }])
// A node carrying marks (a bold field…).
export const withMarks = <T extends object>(node: T, ...marks: object[]) => ({ ...node, marks })
export const STRONG = { type: 'strong' }
export const SMALL = { type: 'size', attrs: { size: '10px' } }
export const field = (name: string, label: string | null = null) => ({ type: 'variable', attrs: { name, label } })
export const p = (...content: object[]) => ({ type: 'paragraph', content })
export const pAligned = (align: 'left' | 'center' | 'right' | 'justify', ...content: object[]) => ({ type: 'paragraph', attrs: { align }, content })
export const h = (level: 1 | 2 | 3, ...content: object[]) => ({ type: 'heading', attrs: { level }, content })
export const repeat = (source: string, ...content: object[]) => ({ type: 'repeat', attrs: { source }, content })
export const embed = (templateId: string) => ({ type: 'template_ref', attrs: { templateId } })
export const image = (imageId: string, alt: string, width: number | null = null) => ({ type: 'image', attrs: { imageId, alt, width } })
const cell = (type: 'table_cell' | 'table_header', ...content: object[]) => ({ type, content: [p(...content)] })
export const headerRow = (...labels: string[]) => ({ type: 'table_row', content: labels.map((l) => cell('table_header', text(l))) })
export const fieldRow = (...names: string[]) => ({ type: 'table_row', content: names.map((n) => cell('table_cell', field(n))) })
export const table = (...rows: object[]) => ({ type: 'table', content: rows })
export const doc = (...pages: object[][]) => ({ type: 'doc', content: pages.map((content) => ({ type: 'page', content })) })
