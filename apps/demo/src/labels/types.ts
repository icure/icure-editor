import type { PartialLabels } from '@icure/editor'

export const LANGUAGES = ['en', 'fr', 'nl'] as const
export type Language = (typeof LANGUAGES)[number]

// The demo's own strings (its chrome, and the names the fake provider gives its fields).
export interface AppStrings {
  readonly title: string
  readonly subtitle: string
  readonly language: string
  readonly theme: string
  readonly themes: Readonly<Record<'system' | 'light' | 'dark', string>>
  readonly templates: string
  readonly output: string
  readonly preview: string
  readonly previewTitle: string
  readonly downloadHtml: string
  readonly downloadPdf: string
  readonly printPdf: string
  readonly readOnly: string
  readonly fieldGroups: Readonly<Record<'recipient' | 'organisation' | 'sender' | 'document', string>>
  readonly fields: Readonly<Record<string, string>>
  readonly sources: Readonly<Record<string, string>>
  readonly templateNames: Readonly<Record<string, string>>
}

export interface LabelSet {
  readonly editor: PartialLabels
  readonly app: AppStrings
}
