// Builders of ProseMirror JSON for the tests, and an in-memory provider.
import type { EditorDataProvider, RepeatData, RepeatSourceDescriptor, TemplateContent } from '../src/context.ts'
import { toEditorDocument } from '../src/document.ts'

export const text = (value: string, marks: object[] = []) => ({ type: 'text', text: value, ...(marks.length > 0 ? { marks } : {}) })
export const field = (name: string, label: string | null = null) => ({ type: 'variable', attrs: { name, label } })
export const paragraph = (...content: object[]) => ({ type: 'paragraph', content })
export const aligned = (align: string, ...content: object[]) => ({ type: 'paragraph', attrs: { align }, content })
export const page = (...content: object[]) => ({ type: 'page', content })
// A repeating block whose content is its body (the common case).
export const repeat = (source: string, ...content: object[]) => ({ type: 'repeat', attrs: { source }, content: [{ type: 'repeat_body', content }] })
// A repeating block with explicit zones.
export const zoned = (source: string, zones: { readonly header?: object[]; readonly body: object[]; readonly footer?: object[] }) => ({
  type: 'repeat',
  attrs: { source },
  content: [
    ...(zones.header ? [{ type: 'repeat_header', content: zones.header }] : []),
    { type: 'repeat_body', content: zones.body },
    ...(zones.footer ? [{ type: 'repeat_footer', content: zones.footer }] : []),
  ],
})
export const embed = (templateId: string) => ({ type: 'template_ref', attrs: { templateId } })
export const image = (imageId: string, alt = '', width: number | null = null) => ({ type: 'image', attrs: { imageId, alt, width } })
export const cell = (type: 'table_cell' | 'table_header', ...content: object[]) => ({ type, content: [paragraph(...content)] })
export const row = (...cells: object[]) => ({ type: 'table_row', content: cells })
// A table row in a zone.
export const zoneRow = (zone: 'header' | 'body' | 'footer', ...cells: object[]) => ({ type: 'table_row', attrs: { zone }, content: cells })
export const table = (...rows: object[]) => ({ type: 'table', content: rows })
export const docJson = (...pages: object[]) => ({ type: 'doc', content: pages })
export const doc = (...pages: object[]) => toEditorDocument(docJson(...pages))

// A 1×1 transparent PNG.
export const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface FakeData {
  readonly fields?: Record<string, string>
  readonly repeats?: Record<string, RepeatData>
  readonly templates?: Record<string, Omit<TemplateContent, 'id'>>
  readonly images?: Record<string, string>
  readonly sources?: readonly RepeatSourceDescriptor[]
}

export function fakeProvider({ fields = {}, repeats = {}, templates = {}, images = {}, sources = [] }: FakeData): EditorDataProvider & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    resolveField: (key) => (calls.push(`field:${key}`), fields[key]),
    listRepeatSources: () => sources,
    resolveRepeat: async (source) => (calls.push(`repeat:${source}`), repeats[source]),
    loadTemplate: (id) => (calls.push(`template:${id}`), templates[id] ? { id, ...templates[id]! } : null),
    images: { resolve: (id) => (calls.push(`image:${id}`), images[id] ? { src: images[id]! } : null) },
  }
}
