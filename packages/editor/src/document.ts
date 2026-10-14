// A template's content as an editor document, and the keys a document refers to.
import { Node as ProseNode } from 'prosemirror-model'

import { editorSchema } from './schema.ts'

// A field's key: its name, qualified by its label when it has one (`measure.latest:Weight`).
export const fieldKey = (name: string, label?: string | null): string => (label ? `${name}:${label}` : name)
// The keys of the other references, as the unresolved list shows them.
export const repeatKey = (source: string): string => `repeat:${source}`
export const templateKey = (id: string): string => `template:${id}`
export const imageKey = (id: string): string => `image:${id}`

export const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'page', content: [{ type: 'paragraph' }] }] } as const

export class InvalidDocumentError extends Error {
  constructor(reason: string) {
    super(`The content does not fit the editor schema (${reason})`)
    this.name = 'InvalidDocumentError'
  }
}

// ProseMirror JSON (or an existing node) checked against the schema. Throws InvalidDocumentError when
// it doesn't fit: a half-parsed template is never shown.
export function toEditorDocument(content: unknown): ProseNode {
  if (content instanceof ProseNode) {
    if (content.type.schema !== editorSchema) throw new InvalidDocumentError('another schema')
    return content
  }
  try {
    const doc = ProseNode.fromJSON(editorSchema, content ?? EMPTY_DOCUMENT)
    doc.check()
    return doc
  } catch (error) {
    throw new InvalidDocumentError(error instanceof Error ? error.message : String(error))
  }
}

export const isEditorDocument = (content: unknown): boolean => {
  try {
    toEditorDocument(content)
    return true
  } catch {
    return false
  }
}
