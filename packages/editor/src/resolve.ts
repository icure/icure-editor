// Resolution: everything a document refers to, looked up once through the data provider. Fields,
// repeating blocks, embedded templates (recursively, with cycle detection and a depth limit) and
// images. The result is a plain snapshot the editor draws from and the output functions print.
import type { Node as ProseNode } from 'prosemirror-model'

import type { EditorDataProvider, ItemValues, RepeatData, RepeatSourceDescriptor, ResolvedImage, UnresolvedEntry, UnresolvedKind, UnresolvedReason } from './context.ts'
import { fieldKey, imageKey, repeatKey, templateKey, toEditorDocument } from './document.ts'
import { safeImageSrc, safeAltText } from './images.ts'
import { bodyTable, declaringField, declaringRepeat, EMPTY_SHAPE, rowZone, scopeFor, zonesOf, type RepeatShape, type ShapeScope } from './repeat.ts'
import { editorSchema } from './schema.ts'

const { nodes } = editorSchema

// Deepest nesting of lists inside items; data holding itself is cut there.
export const MAX_REPEAT_NESTING = 8

export interface ItemContext {
  readonly values: ReadonlyMap<string, string>
  readonly lists: ReadonlyMap<string, ResolvedRepeat>
}

// `itemFields` are the field names read from the item inside the block, `itemRepeats` the sources of
// the lists an item holds.
export interface ResolvedRepeat extends RepeatShape {
  readonly items: readonly ItemContext[]
  // The shapes of the lists its items hold, at every depth (merged across items).
  readonly nested: ReadonlyMap<string, RepeatShape>
}

export interface ResolvedTemplate {
  readonly id: string
  readonly name: string
  readonly doc: ProseNode
}

export interface Resolution {
  readonly fields: ReadonlyMap<string, string>
  readonly repeats: ReadonlyMap<string, ResolvedRepeat>
  readonly templates: ReadonlyMap<string, ResolvedTemplate>
  readonly images: ReadonlyMap<string, ResolvedImage>
  // The shape of each known repeat source (from the descriptors, merged with the nested shapes of the
  // resolved data), used even when the block itself is unresolved, so its item fields are never
  // listed as fields of their own.
  readonly shapes: ReadonlyMap<string, RepeatShape>
  // In reading order, once each.
  readonly unresolved: readonly UnresolvedEntry[]
  // The id of the document being edited, so that it can't embed itself.
  readonly rootId: string | null
  readonly maxDepth: number
}

export const DEFAULT_MAX_TEMPLATE_DEPTH = 5

export const EMPTY_RESOLUTION: Resolution = {
  fields: new Map(),
  repeats: new Map(),
  templates: new Map(),
  images: new Map(),
  shapes: new Map(),
  unresolved: [],
  rootId: null,
  maxDepth: DEFAULT_MAX_TEMPLATE_DEPTH,
}

export interface ResolveOptions {
  readonly rootId?: string | null
  readonly maxDepth?: number
  // Largest `data:` image accepted from the provider.
  readonly maxImageBytes?: number
}

// Only non-blank strings count: an absent or blank value is unresolved.
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim().length > 0 ? value : null)

const isRepeatData = (value: unknown): value is RepeatData => typeof value === 'object' && value !== null && Array.isArray((value as RepeatData).items)

const mergeShape = (into: Map<string, RepeatShape>, key: string, shape: RepeatShape): void => {
  const found = into.get(key)
  into.set(key, found ? { itemFields: new Set([...found.itemFields, ...shape.itemFields]), itemRepeats: new Set([...found.itemRepeats, ...shape.itemRepeats]) } : { itemFields: shape.itemFields, itemRepeats: shape.itemRepeats })
}

// The descriptors' shapes, nested sources included (flattened by key).
function descriptorShapes(list: readonly RepeatSourceDescriptor[], into = new Map<string, RepeatShape>(), depth = 0): Map<string, RepeatShape> {
  if (depth > MAX_REPEAT_NESTING) return into
  for (const d of list) {
    mergeShape(into, d.key, { itemFields: new Set(d.itemFields.map((f) => f.key)), itemRepeats: new Set((d.itemRepeats ?? []).map((r) => r.key)) })
    descriptorShapes(d.itemRepeats ?? [], into, depth + 1)
  }
  return into
}

export function toItemContext(values: ItemValues, shapes: ReadonlyMap<string, RepeatShape> = new Map(), depth = 0): ItemContext {
  const entries = values instanceof Map ? [...values.entries()] : Object.entries(values)
  const texts = new Map<string, string>()
  const lists = new Map<string, ResolvedRepeat>()
  for (const [key, value] of entries) {
    if (text(value)) texts.set(String(key), value as string)
    // A list deeper than MAX_REPEAT_NESTING is dropped: the host's data may hold itself.
    else if (isRepeatData(value) && depth < MAX_REPEAT_NESTING) lists.set(String(key), normaliseRepeat(value, shapes, String(key), depth + 1))
  }
  return { values: texts, lists }
}

function normaliseRepeat(data: RepeatData, shapes: ReadonlyMap<string, RepeatShape>, source: string, depth = 0): ResolvedRepeat {
  const declared = shapes.get(source)
  const items = (Array.isArray(data.items) ? data.items : []).map((values) => toItemContext(values, shapes, depth))
  const itemFields = data.itemFields ? new Set(data.itemFields) : (declared?.itemFields ?? new Set(items.flatMap((item) => [...item.values.keys()].map((key) => key.split(':')[0]!))))
  const itemRepeats = new Set([...(data.itemRepeats ?? []), ...(declared?.itemRepeats ?? []), ...items.flatMap((item) => [...item.lists.keys()])])
  const nested = new Map<string, RepeatShape>()
  for (const item of items) {
    for (const [key, list] of item.lists) {
      mergeShape(nested, key, list)
      for (const [deeper, shape] of list.nested) mergeShape(nested, deeper, shape)
    }
  }
  return { items, itemFields, itemRepeats, nested }
}

const childrenOf = (node: ProseNode): ProseNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))

// A cache of provider answers, shared by successive resolutions of the same provider: typing in the
// editor re-resolves the document without asking the provider again for keys it already answered.
export interface Resolver {
  resolve(doc: ProseNode): Promise<Resolution>
  // Forgets every cached answer (the host's data changed).
  clear(): void
}

interface Walk {
  readonly items: ShapeScope | null
  readonly stack: readonly string[]
  readonly depth: number
}

type Loaded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: UnresolvedReason }

export function createResolver(provider: EditorDataProvider, options: ResolveOptions = {}): Resolver {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_TEMPLATE_DEPTH
  const rootId = options.rootId ?? null
  let fieldCache = new Map<string, Promise<string | null>>()
  let repeatCache = new Map<string, Promise<ResolvedRepeat | null>>()
  let templateCache = new Map<string, Promise<Loaded<ResolvedTemplate>>>()
  let imageCache = new Map<string, Promise<Loaded<ResolvedImage>>>()
  let descriptors: Promise<ReadonlyMap<string, RepeatShape>> | null = null

  const memo = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> => {
    let found = cache.get(key)
    if (!found) {
      found = load()
      cache.set(key, found)
    }
    return found
  }
  // A provider that throws leaves the key unresolved: the editor never breaks on the host's errors.
  const safely = async <T>(load: () => T | Promise<T>, fallback: T): Promise<T> => {
    try {
      return await load()
    } catch {
      return fallback
    }
  }

  const loadDescriptors = () =>
    (descriptors ??= safely(async () => {
      const list: readonly RepeatSourceDescriptor[] = (await provider.listRepeatSources?.()) ?? []
      return descriptorShapes(list)
    }, new Map()))

  const field = (key: string) => memo(fieldCache, key, () => safely(async () => text(await provider.resolveField(key)), null))
  // Normalised once per answer, so successive resolutions share the same objects.
  const repeat = (source: string) =>
    memo(repeatCache, source, () =>
      safely(async () => {
        const data = await provider.resolveRepeat?.(source)
        return data ? normaliseRepeat(data, await loadDescriptors(), source) : null
      }, null),
    )
  const template = (id: string) =>
    memo(templateCache, id, () =>
      safely(async (): Promise<Loaded<ResolvedTemplate>> => {
        const found = await provider.loadTemplate?.(id)
        if (!found) return { ok: false, reason: 'missing' }
        try {
          return { ok: true, value: { id, name: String(found.name ?? id), doc: toEditorDocument(found.content) } }
        } catch {
          return { ok: false, reason: 'invalid' }
        }
      }, { ok: false, reason: 'missing' }),
    )
  const image = (id: string) =>
    memo(imageCache, id, () =>
      safely(async (): Promise<Loaded<ResolvedImage>> => {
        const found = await provider.images?.resolve(id)
        if (!found) return { ok: false, reason: 'missing' }
        const src = safeImageSrc(found.src, options.maxImageBytes ? { maxBytes: options.maxImageBytes } : {})
        if (!src) return { ok: false, reason: 'invalid' }
        return { ok: true, value: { src, ...(found.alt ? { alt: safeAltText(found.alt) } : {}), ...(found.width ? { width: found.width } : {}), ...(found.height ? { height: found.height } : {}) } }
      }, { ok: false, reason: 'missing' }),
    )

  async function resolve(doc: ProseNode): Promise<Resolution> {
    const shapes = new Map(await loadDescriptors())
    const order: { key: string; kind: UnresolvedKind }[] = []
    const reasons = new Map<string, UnresolvedReason>()
    const fieldKeys = new Set<string>()
    const repeats = new Map<string, ResolvedRepeat>()
    const templates = new Map<string, ResolvedTemplate>()
    const images = new Map<string, ResolvedImage>()
    const mark = (key: string, kind: UnresolvedKind, reason: UnresolvedReason | null) => {
      order.push({ key, kind })
      if (reason && !reasons.has(key)) reasons.set(key, reason)
    }

    async function walk(node: ProseNode, scope: Walk): Promise<void> {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child.type === nodes.variable) {
          const name = String(child.attrs.name)
          if (declaringField(scope.items, name)) continue
          const key = fieldKey(name, child.attrs.label as string | null)
          fieldKeys.add(key)
          mark(key, 'field', null)
        } else if (child.type === nodes.repeat) {
          await walkRepeat(child, scope)
        } else if (child.type === nodes.template_ref) {
          await embed(String(child.attrs.templateId), scope)
        } else if (child.type === nodes.image) {
          const id = String(child.attrs.imageId)
          const loaded = await image(id)
          if (loaded.ok) images.set(id, loaded.value)
          mark(imageKey(id), 'image', loaded.ok ? null : loaded.reason)
        } else if (!child.isLeaf) {
          await walk(child, scope)
        }
      }
    }

    async function walkRepeat(node: ProseNode, scope: Walk): Promise<void> {
      const source = String(node.attrs.source)
      let shape: RepeatShape
      if (declaringRepeat(scope.items, source)) {
        // A list an enclosing item holds: never asked of the provider, never unresolved.
        shape = shapes.get(source) ?? EMPTY_SHAPE
      } else {
        const resolved = await repeat(source)
        mark(repeatKey(source), 'repeat', resolved ? null : 'missing')
        if (resolved) {
          repeats.set(source, resolved)
          for (const [key, nestedShape] of resolved.nested) mergeShape(shapes, key, nestedShape)
        }
        shape = resolved ?? shapes.get(source) ?? EMPTY_SHAPE
      }
      const inner: Walk = { ...scope, items: { shape, parent: scope.items } }
      const { header, body, footer } = zonesOf(node)
      if (header) await walk(header, scope)
      const table = bodyTable(body)
      if (table) for (const row of childrenOf(table)) await walk(row, scopeFor(rowZone(row), scope, inner))
      else await walk(body, inner)
      if (footer) await walk(footer, scope)
    }

    async function embed(id: string, scope: Walk): Promise<void> {
      const key = templateKey(id)
      if (scope.stack.includes(id)) return mark(key, 'template', 'cycle')
      if (scope.depth >= maxDepth) return mark(key, 'template', 'depth')
      const loaded = await template(id)
      mark(key, 'template', loaded.ok ? null : loaded.reason)
      if (!loaded.ok) return
      templates.set(id, loaded.value)
      await walk(loaded.value.doc, { items: scope.items, stack: [...scope.stack, id], depth: scope.depth + 1 })
    }

    await walk(doc, { items: null, stack: rootId ? [rootId] : [], depth: 0 })
    const fields = new Map<string, string>()
    await Promise.all(
      [...fieldKeys].map(async (key) => {
        const value = await field(key)
        if (value === null) reasons.set(key, 'missing')
        else fields.set(key, value)
      }),
    )
    const seen = new Set<string>()
    const unresolved = order.flatMap(({ key, kind }): UnresolvedEntry[] => {
      const reason = reasons.get(key)
      if (!reason || seen.has(key)) return []
      seen.add(key)
      return [{ key, kind, reason }]
    })
    return { fields, repeats, templates, images, shapes, unresolved, rootId, maxDepth }
  }

  return {
    resolve,
    clear: () => {
      fieldCache = new Map()
      repeatCache = new Map()
      templateCache = new Map()
      imageCache = new Map()
      descriptors = null
    },
  }
}

// One-shot resolution (output, tests).
export const resolveDocument = (doc: ProseNode, provider: EditorDataProvider, options: ResolveOptions = {}): Promise<Resolution> => createResolver(provider, options).resolve(doc)

const sameMap = <V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>): boolean => a.size === b.size && [...a].every(([key, value]) => b.has(key) && b.get(key) === value)

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((key) => b.has(key))

// Shapes are rebuilt by every resolution, so they are compared by content.
const sameShapes = (a: ReadonlyMap<string, RepeatShape>, b: ReadonlyMap<string, RepeatShape>): boolean =>
  a.size === b.size && [...a].every(([key, shape]) => { const other = b.get(key); return !!other && sameSet(shape.itemFields, other.itemFields) && sameSet(shape.itemRepeats, other.itemRepeats) })

// Two resolutions that draw the same (the editor keeps the previous one to avoid a redraw).
export function sameResolution(a: Resolution, b: Resolution): boolean {
  return (
    a.rootId === b.rootId &&
    a.maxDepth === b.maxDepth &&
    sameMap(a.fields, b.fields) &&
    sameMap(a.repeats, b.repeats) &&
    sameMap(a.templates, b.templates) &&
    sameMap(a.images, b.images) &&
    sameShapes(a.shapes, b.shapes) &&
    JSON.stringify(a.unresolved) === JSON.stringify(b.unresolved)
  )
}
