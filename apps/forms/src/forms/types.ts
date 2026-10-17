import type { PageFormat } from '@icure/editor'

import type { Json } from '../build.ts'

// A form of the example: its id (the URL), its title, its source document and its content.
export interface Form {
  readonly id: string
  readonly title: string
  // What the form replicates (a kind of document, not its publisher).
  readonly source: string
  readonly content: Json
  // The sheet (default A4 portrait, 20 mm margin).
  readonly page?: PageFormat
}
