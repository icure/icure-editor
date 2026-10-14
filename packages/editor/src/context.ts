// The data provider: what the host supplies so the editor can fill a template. Interfaces only; the
// library never knows where the values come from. Every method may answer synchronously or with a
// promise. A value is looked up by name (a "field key"), never evaluated.

export type MaybePromise<T> = T | Promise<T>

// A field the toolbar offers to insert. `label` and `group` are already in the user's language.
export interface FieldDescriptor {
  readonly key: string
  readonly label: string
  readonly group?: string
}

// The fields one item of a repeating block fills (inside the block, they are read from the item).
export interface ItemFieldDescriptor {
  readonly key: string
  readonly label: string
}

// A source of repeating data the toolbar offers. `layout` picks the starting content of a new block:
// one line per item (`lines`), or a table with a header row and one row per item (`table`).
export interface RepeatSourceDescriptor {
  readonly key: string
  readonly label: string
  readonly itemFields: readonly ItemFieldDescriptor[]
  readonly layout?: 'lines' | 'table'
}

// The values of one item: field key → text.
export type ItemValues = Readonly<Record<string, string>> | ReadonlyMap<string, string>

// The items of a repeating block. `itemFields` names the keys read from the item (default: those of
// the matching descriptor, else every key any item holds). An empty `items` list is a resolved block
// with nothing to list.
export interface RepeatData {
  readonly items: readonly ItemValues[]
  readonly itemFields?: readonly string[]
}

export interface TemplateSummary {
  readonly id: string
  readonly name: string
  readonly description?: string
}

// A template's content: a ProseMirror JSON document of the editor's schema (`{ type: 'doc', ... }`).
export interface TemplateContent {
  readonly id: string
  readonly name: string
  readonly content: unknown
}

// What an image reference resolves to. `src` follows the rules of images.ts (raster `data:` URI,
// `blob:` URL, or an `https:` URL the host vouches for); anything else is treated as unresolved.
export interface ResolvedImage {
  readonly src: string
  readonly alt?: string
  readonly width?: number
  readonly height?: number
}

export interface PickedImage {
  readonly id: string
  readonly alt?: string
  readonly width?: number
}

export interface ImageProvider {
  resolve(id: string): MaybePromise<ResolvedImage | null | undefined>
  // The host's own picker (a gallery, a scanner…); when absent the editor offers a file input.
  pick?(): MaybePromise<PickedImage | null>
  // Stores a file the user chose (already checked for type, size and content) and returns its id.
  upload?(file: File): MaybePromise<PickedImage>
}

export interface EditorDataProvider {
  // Fields offered by the toolbar's "Insert field" menu.
  listFields?(): MaybePromise<readonly FieldDescriptor[]>
  // A field's text; null, undefined or a blank string leaves it unresolved.
  resolveField(key: string): MaybePromise<string | null | undefined>
  listRepeatSources?(): MaybePromise<readonly RepeatSourceDescriptor[]>
  // The items of a repeating block; null or undefined leaves the block unresolved.
  resolveRepeat?(source: string): MaybePromise<RepeatData | null | undefined>
  // Templates offered by "Insert template", and the content of an embedded one.
  listTemplates?(): MaybePromise<readonly TemplateSummary[]>
  loadTemplate?(id: string): MaybePromise<TemplateContent | null | undefined>
  readonly images?: ImageProvider
}

// Why a key stays unresolved.
export type UnresolvedReason = 'missing' | 'cycle' | 'depth' | 'invalid'
export type UnresolvedKind = 'field' | 'repeat' | 'template' | 'image'

export interface UnresolvedEntry {
  readonly key: string
  readonly kind: UnresolvedKind
  readonly reason: UnresolvedReason
}
