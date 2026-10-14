// Resolution: everything a document refers to, looked up once through the data provider. Fields,
// repeating blocks, embedded templates (recursively, with cycle detection and a depth limit) and
// images. The result is a plain snapshot the editor draws from and the output functions print.
import type { Node as ProseNode } from 'prosemirror-model'

import type { EditorDataProvider, ItemValues, RepeatData, RepeatSourceDescriptor, ResolvedImage, UnresolvedEntry, UnresolvedKind, UnresolvedReason } from './context.ts'
import { fieldKey, imageKey, repeatKey, templateKey, toEditorDocument } from './document.ts'
import { safeImageSrc, safeAltText } from './images.ts'
import { editorSchema } from './schema.ts'

const { nodes } = editorSchema

export type ItemContext = ReadonlyMap<string, string>

export interface ResolvedRepeat {
  readonly items: readonly ItemContext[]
  // Field names read from the item inside the block.
  readonly itemFields: ReadonlySet<string>
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
  // Item fields of each known repeat source (from the descriptors), used even when the block
  // itself is unresolved, so its item fields are never listed as fields of their own.
  readonly itemFieldsOf: ReadonlyMap<string, ReadonlySet<string>>
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
  itemFieldsOf: new Map(),
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

export function toItemContext(values: ItemValues): ItemContext {
  const entries = values instanceof Map ? [...values.entries()] : Object.entries(values)
  return new Map(entries.flatMap(([key, value]) => (text(value) ? [[String(key), value as string] as const] : [])))
}

function normaliseRepeat(data: RepeatData, descriptor: ReadonlySet<string> | undefined): ResolvedRepeat {
  const items = (Array.isArray(data.items) ? data.items : []).map(toItemContext)
  const itemFields = data.itemFields ? new Set(data.itemFields) : (descriptor ?? new Set(items.flatMap((item) => [...item.keys()].map((key) => key.split(':')[0]!))))
  return { items, itemFields }
}

// A cache of provider answers, shared by successive resolutions of the same provider: typing in the
// editor re-resolves the document without asking the provider again for keys it already answered.
export interface Resolver {
  resolve(doc: ProseNode): Promise<Resolution>
  // Forgets every cached answer (the host's data changed).
  clear(): void
}

interface Scope {
  readonly itemFields: ReadonlySet<string> | null
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
  let descriptors: Promise<ReadonlyMap<string, ReadonlySet<string>>> | null = null

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
      return new Map(list.map((d) => [d.key, new Set(d.itemFields.map((f) => f.key))] as const))
    }, new Map()))

  const field = (key: string) => memo(fieldCache, key, () => safely(async () => text(await provider.resolveField(key)), null))
  // Normalised once per answer, so successive resolutions share the same objects.
  const repeat = (source: string) =>
    memo(repeatCache, source, () =>
      safely(async () => {
        const data = await provider.resolveRepeat?.(source)
        return data ? normaliseRepeat(data, (await loadDescriptors()).get(source)) : null
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
    const itemFieldsOf = await loadDescriptors()
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

    async function walk(node: ProseNode, scope: Scope): Promise<void> {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child.type === nodes.variable) {
          const name = String(child.attrs.name)
          if (scope.itemFields?.has(name)) continue
          const key = fieldKey(name, child.attrs.label as string | null)
          fieldKeys.add(key)
          mark(key, 'field', null)
        } else if (child.type === nodes.repeat) {
          const source = String(child.attrs.source)
          const resolved = await repeat(source)
          mark(repeatKey(source), 'repeat', resolved ? null : 'missing')
          if (resolved) repeats.set(source, resolved)
          const itemFields = resolved?.itemFields ?? itemFieldsOf.get(source) ?? new Set<string>()
          await walk(child, { ...scope, itemFields })
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

    async function embed(id: string, scope: Scope): Promise<void> {
      const key = templateKey(id)
      if (scope.stack.includes(id)) return mark(key, 'template', 'cycle')
      if (scope.depth >= maxDepth) return mark(key, 'template', 'depth')
      const loaded = await template(id)
      mark(key, 'template', loaded.ok ? null : loaded.reason)
      if (!loaded.ok) return
      templates.set(id, loaded.value)
      await walk(loaded.value.doc, { itemFields: scope.itemFields, stack: [...scope.stack, id], depth: scope.depth + 1 })
    }

    await walk(doc, { itemFields: null, stack: rootId ? [rootId] : [], depth: 0 })
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
    return { fields, repeats, templates, images, itemFieldsOf, unresolved, rootId, maxDepth }
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

// Two resolutions that draw the same (the editor keeps the previous one to avoid a redraw).
export function sameResolution(a: Resolution, b: Resolution): boolean {
  return (
    a.rootId === b.rootId &&
    a.maxDepth === b.maxDepth &&
    sameMap(a.fields, b.fields) &&
    sameMap(a.repeats, b.repeats) &&
    sameMap(a.templates, b.templates) &&
    sameMap(a.images, b.images) &&
    sameMap(a.itemFieldsOf, b.itemFieldsOf) &&
    JSON.stringify(a.unresolved) === JSON.stringify(b.unresolved)
  )
}
