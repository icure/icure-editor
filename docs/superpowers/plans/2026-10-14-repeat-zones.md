# Repeating-block zones and item scopes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeating block becomes a template with a header zone, a body zone repeated once per item, and a footer zone. Each body pass is filled in a scope set to its item and chained to the scope around it, so blocks nest.

**Architecture:** `repeat` (still an atom) holds `repeat_header? repeat_body repeat_footer?`. A body made of a single table uses row zones (`table_row.attrs.zone`) instead, because a ProseMirror table cannot span three sibling nodes. A new module, `src/repeat.ts`, holds two things shared by the resolver and the renderer: the zones and the scope chain. Both therefore decide in the same way where a field is read from:

- The body is filled in the item's scope; header and footer are filled in the enclosing scope.
- A field is read from the innermost scope whose source **declares** it as an item field. If that item has no value, the field is missing and does **not** fall back to an outer scope.
- A field no scope declares is a document field, asked of the provider.

The resolver needs this rule to know, without data, which keys it must not ask the provider for. It refines what was first described to the user ("the item first, then the parent, then the document"). Item data may hold nested lists. A nested block whose source an enclosing item declares reads that item's list. If the item has no such list, the block counts as an empty list: the provider is never asked and nothing is marked unresolved.

**Tech Stack:** TypeScript (strict, ESM, `verbatimModuleSyntax`), ProseMirror (`prosemirror-model`, `prosemirror-tables`), React 19, vitest + jsdom, Playwright, bun.

**Spec:** this plan is the spec: Goal, Architecture and the decisions below, agreed with the user in conversation on 2026-10-14. Decisions:

- Header and footer are shown when the list is empty.
- An **unresolved** block (the provider returned nothing) still prints nothing, as today. Only a resolved empty list draws its header and footer.
- In the editor, a resolved empty block shows the "Nothing to list" line after its body, before its footer.
- Step 1 does not change editing: the block stays one unit, edited only by insertion. Editing zones in place, and a body that embeds a template with the item passed in, are step 2 and out of scope.
- Rendered output carries no zones: rendered rows have `zone: 'body'`, and no zone element remains.

## Global Constraints

- Product-agnostic library: no product, domain or backend name in `packages/editor` or the demo; sample data is fictitious.
- No user-facing string in the library; every label goes through `EditorLabels` (this plan adds none).
- Security invariants hold: values are text nodes; the schema accepts only closed-set attribute values (`zone` ∈ `header | body | footer`, anything else → `body`); nested data is bounded (`MAX_REPEAT_NESTING = 8`), so cyclic host data can't loop.
- TypeScript strict, `import type`, no unused locals or parameters; English identifiers and comments; comment density like the surrounding code.
- Tests assert behaviour (what is printed or shown). e2e selectors use label objects (`L`, `APP`), never literals.
- A task is done when `bun run typecheck`, `bun run test` and (for tasks touching the demo or the editor view) `bun run test:e2e` are green. Run them from the repo root.

## Public API changes

The library has never been used, so there is no migration and no compatibility layer: the new shapes simply replace the old ones. `ItemValues` values become `string | RepeatData`; `ItemContext` becomes `{ values, lists }`; `ResolvedRepeat` gains `itemRepeats` and `nested`; `Resolution.itemFieldsOf` becomes `Resolution.shapes`; `repeatContent` returns the `repeat_body`; a `repeat` holds `repeat_header? repeat_body repeat_footer?`; table header rows are marked by `table_row.attrs.zone`. New exports: `RepeatShape`, `ItemValue`, `MAX_REPEAT_NESTING`, `renderRepeatParts`, `RepeatParts`.

## Review Focus

1. **Header and footer in the enclosing scope, in both the resolver and the renderer.** An item-field name in a footer is a document field: printed empty and shown as `{expression}` in the editor. A document field in the body is still asked of the provider. A nested block's footer reads the outer item. Pinned in Task 2 (resolver) and Task 3 (renderer).
2. **Nested list missing from an item.** It is an empty list: inner header and footer drawn, `resolveRepeat` never called for that source, no unresolved entry. Pinned in Tasks 2 and 3.
3. **Pasted HTML.** A pasted `div.ie-repeat` holding blocks directly parses into a valid body. Copy and paste of a zoned block round-trips. `data-zone` outside the closed set becomes `body`. Pinned in Task 1.
4. **An embedded template in a body.** It is filled from the item, as it was before zones. Pinned in Task 3.
5. **Cyclic or very deep host data.** A list that contains itself is cut at `MAX_REPEAT_NESTING` with no stack overflow. A rendered empty table-only block leaves a valid page (`check()`). Pinned in Tasks 2 and 3.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/editor/src/schema.ts` (modify) | zone nodes, `repeat` content, `table_row.zone`, `safeRowZone` |
| `packages/editor/src/repeat.ts` (create) | `RepeatShape`, `ShapeScope`, `zonesOf`, `bodyTable`, `rowZone`, `scopeFor`, `declaringField`, `declaringRepeat`, `EMPTY_SHAPE` |
| `packages/editor/src/context.ts` (modify) | `ItemValue`, `RepeatData.itemRepeats`, `RepeatSourceDescriptor.itemRepeats` |
| `packages/editor/src/resolve.ts` (modify) | nested normalisation, `shapes`, scope-chain walk |
| `packages/editor/src/render.ts` (modify) | zones, scope chain, empty rule, row-zone reset, `renderRepeatParts` |
| `packages/editor/src/commands.ts` (modify) | `repeatContent` / `insertRepeat` build zones |
| `packages/editor/src/react/nodeViews.ts` (modify) | "Nothing to list" placed between body and footer |
| `packages/editor/src/index.ts` (modify) | exports |
| `packages/editor/test/helpers.ts` (modify) | `repeat` wraps a body; `zoned`, `zoneRow`; `FakeData.sources` |
| `packages/editor/test/zones.test.ts` (create) | rendering of zones and scopes |
| `packages/editor/test/schema.test.ts`, `resolve.test.ts`, `render.test.ts`, `commands.test.ts` (modify) | updated and new cases |
| `apps/demo/src/samples/build.ts`, `templates.ts`, `fakeContext.ts`, `labels/*.ts` (modify) | invoice footer row, waiting-list header, nested "programme" sample |
| `apps/demo/e2e/repeat.spec.ts` (modify) | zones, empty list, nesting |
| `packages/editor/README.md` (modify) | the model and the breaking changes |

---

### Task 0: Green base

The earlier work is committed on `master` (`f7035ef`). This feature is also committed on `master` directly, as the user asked: no branch.

- [ ] **Step 1:** Run `bun run typecheck && bun run test && bun run test:e2e` to confirm a green base (69 unit tests, 30 e2e tests).

---

### Task 1: Schema zones and row zones

**Files:**
- Modify: `packages/editor/src/schema.ts`
- Modify: `packages/editor/test/helpers.ts`
- Test: `packages/editor/test/schema.test.ts`

**Interfaces:**
- Produces: node types `repeat_header`, `repeat_body`, `repeat_footer` (each `content: 'block+'`, not in group `block`); `repeat.content = 'repeat_header? repeat_body repeat_footer?'`; `table_row.attrs.zone` (default `'body'`); `export const ROW_ZONES = ['header', 'body', 'footer'] as const`; `export type RowZone`; `export const safeRowZone(value: unknown): RowZone`; classes `REPEAT_HEADER_CLASS = 'ie-repeat-header'`, `REPEAT_BODY_CLASS = 'ie-repeat-body'`, `REPEAT_FOOTER_CLASS = 'ie-repeat-footer'`.
- Test helpers produced (used by every later task):

```ts
// test/helpers.ts
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
// A table row in a zone.
export const zoneRow = (zone: 'header' | 'body' | 'footer', ...cells: object[]) => ({ type: 'table_row', attrs: { zone }, content: cells })
```

- [ ] **Step 1: Write the failing tests** (append to `test/schema.test.ts`, inside the existing `describe` for pasted HTML; import `toEditorDocument` already exists; add `zoned`, `zoneRow`, `cell`, `paragraph`, `text`, `docJson`, `page`, `table` from `./helpers.ts`):

```ts
it('parses a pasted block without zones into a valid body', () => {
  const node = parse('<div class="ie-page"><div class="ie-repeat" data-source="list.items"><p>a</p></div></div>')
  node.check()
  const repeat = node.child(0).child(0)
  expect(repeat.type.name).toBe('repeat')
  expect(repeat.child(0).type.name).toBe('repeat_body')
  expect(repeat.child(0).textContent).toBe('a')
})

it('round-trips a block with zones and a table with row zones through copy and paste', () => {
  const doc = toEditorDocument(docJson(page(zoned('list.items', { header: [paragraph(text('H'))], body: [table(zoneRow('header', cell('table_header', text('N'))), zoneRow('body', cell('table_cell', text('B'))), zoneRow('footer', cell('table_cell', text('F'))))], footer: [paragraph(text('F2'))] }))))
  const host = document.createElement('div')
  host.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(doc.content))
  expect(ProseParser.fromSchema(editorSchema).parse(host).eq(doc)).toBe(true)
})

it('reads a row zone from a closed set only', () => {
  const node = parse('<div class="ie-page"><table><tr data-zone="footer"><td><p>a</p></td></tr><tr data-zone="&lt;x&gt;"><td><p>b</p></td></tr></table></div>')
  const table = node.child(0).child(0)
  expect(table.child(0).attrs.zone).toBe('footer')
  expect(table.child(1).attrs.zone).toBe('body')
})
```

Note: `parse` returns the `doc` node; adjust `.child(0)` depth to what the existing tests in the file do if the parser wraps differently. The assertions on node types and texts are what matters.

- [ ] **Step 2: Run them, expect failure.** `cd packages/editor && bunx vitest run test/schema.test.ts`. Expected: failures (`repeat_body` unknown / zone undefined).

- [ ] **Step 3: Implement** in `src/schema.ts`:

```ts
export const ROW_ZONES = ['header', 'body', 'footer'] as const
export type RowZone = (typeof ROW_ZONES)[number]
export const safeRowZone = (value: unknown): RowZone => ROW_ZONES.find((zone) => zone === value) ?? 'body'

export const REPEAT_HEADER_CLASS = 'ie-repeat-header'
export const REPEAT_BODY_CLASS = 'ie-repeat-body'
export const REPEAT_FOOTER_CLASS = 'ie-repeat-footer'

// A zone of a repeating block: drawn once (header, footer) or once per item (body).
const zone = (className: string): NodeSpec => ({
  content: 'block+',
  isolating: true,
  toDOM: (): DOMOutputSpec => ['div', { class: className }, 0],
  parseDOM: [{ tag: `div.${className}` }],
})
```

In `repeat`, set `content: 'repeat_header? repeat_body repeat_footer?'` and keep `atom: true`, `isolating`, `attrs`, `toDOM`, `parseDOM`. ProseMirror's parser wraps bare blocks pasted into a `repeat` in `repeat_body` (the only required zone), which the first test pins.

Replace the inline `...tableNodes(...)` in the schema with a variable, and override `table_row` (keep its `tableRole`):

```ts
const tables = tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: { borderColor: cellStyle('border-color'), background: cellStyle('background-color') } })
// A row of a repeating block's table: drawn once before (header) or after (footer) the items, or per item (body).
const table_row: NodeSpec = {
  ...tables.table_row,
  attrs: { zone: { default: 'body' } },
  toDOM: (node): DOMOutputSpec => ['tr', safeRowZone(node.attrs.zone) === 'body' ? {} : { 'data-zone': safeRowZone(node.attrs.zone) }, 0],
  parseDOM: [{ tag: 'tr', getAttrs: (dom: HTMLElement | string) => ({ zone: safeRowZone(elementOf(dom)?.dataset.zone) }) }],
}
```

In `new Schema({ nodes: { … } })`: add `repeat_header: zone(REPEAT_HEADER_CLASS), repeat_body: zone(REPEAT_BODY_CLASS), repeat_footer: zone(REPEAT_FOOTER_CLASS)` right after `repeat`. Replace `...tableNodes(...)` with `...tables, table_row`.

Update `test/helpers.ts` with the three helpers above, replacing the old `repeat`.

Bridge in `src/render.ts` until Task 3: a block's blocks are now its body's. In `renderRepeat`, define `const body = repeat.child(repeat.childCount === 1 ? 0 : repeat.child(0).type === nodes.repeat_header ? 1 : 0)`. Use `body` where the function read `repeat` (`repeat.childCount === 1 ? repeat.child(0)` becomes `body.childCount === 1 ? body.child(0)`, and `childrenOf(repeat)` becomes `childrenOf(body)`). Header detection by cell type stays until Task 3. The resolver needs no change: it walks zone nodes like any other non-leaf node.

- [ ] **Step 4: Run.** `bunx vitest run test/schema.test.ts` passes. The whole suite (`bunx vitest run`) stays green, because tests build repeats through the helper, which now wraps a body. `bun run typecheck` passes.

- [ ] **Step 5: Commit.**

```bash
git add packages/editor/src/schema.ts packages/editor/src/render.ts packages/editor/test/schema.test.ts packages/editor/test/helpers.ts
git commit -m "feat(schema): zones for repeating blocks and row zones for their tables"
```

---

### Task 2: Item scopes, nested data and the resolver

**Files:**
- Create: `packages/editor/src/repeat.ts`
- Modify: `packages/editor/src/context.ts`, `packages/editor/src/resolve.ts`, `packages/editor/src/index.ts`, `packages/editor/test/helpers.ts`
- Test: `packages/editor/test/resolve.test.ts`

**Interfaces:**
- Consumes: Task 1 node types and `safeRowZone` / `RowZone`.
- Produces (`src/repeat.ts`):

```ts
// Repeating blocks: their zones, and the chain of item scopes a body is filled in. Shared by the
// resolver and the renderer, so both read a field from the same place: the body in its item's scope,
// header and footer in the enclosing one; a field from the innermost scope that declares it.
import type { Node as ProseNode } from 'prosemirror-model'

import { editorSchema, safeRowZone, type RowZone } from './schema.ts'

const { nodes } = editorSchema

// What one item of a source holds: field names, and the sources of the lists it holds.
export interface RepeatShape {
  readonly itemFields: ReadonlySet<string>
  readonly itemRepeats: ReadonlySet<string>
}
export const EMPTY_SHAPE: RepeatShape = { itemFields: new Set(), itemRepeats: new Set() }

export interface ShapeScope {
  readonly shape: RepeatShape
  readonly parent: ShapeScope | null
}

export interface RepeatZones {
  readonly header: ProseNode | null
  readonly body: ProseNode
  readonly footer: ProseNode | null
}

export function zonesOf(repeat: ProseNode): RepeatZones {
  let header: ProseNode | null = null
  let body: ProseNode | null = null
  let footer: ProseNode | null = null
  repeat.forEach((zone) => {
    if (zone.type === nodes.repeat_header) header = zone
    else if (zone.type === nodes.repeat_body) body = zone
    else if (zone.type === nodes.repeat_footer) footer = zone
  })
  // The schema requires a body.
  return { header, body: body!, footer }
}

// A body made of one table: its header and footer rows are drawn once, its body rows per item.
export const bodyTable = (body: ProseNode): ProseNode | null => (body.childCount === 1 && body.child(0).type === nodes.table ? body.child(0) : null)
export const rowZone = (row: ProseNode): RowZone => safeRowZone(row.attrs.zone)

// The scope a zone (or a row of a body table) is filled in.
export const scopeFor = <S>(zone: RowZone, outer: S, inner: S): S => (zone === 'body' ? inner : outer)

// The innermost scope whose source declares the field name (or holds the list), or null.
export function declaringField<S extends ShapeScope>(scope: S | null, name: string): S | null {
  for (let s: ShapeScope | null = scope; s; s = s.parent) if (s.shape.itemFields.has(name)) return s as S
  return null
}
export function declaringRepeat<S extends ShapeScope>(scope: S | null, source: string): S | null {
  for (let s: ShapeScope | null = scope; s; s = s.parent) if (s.shape.itemRepeats.has(source)) return s as S
  return null
}
```

- Produces (`src/context.ts`):

```ts
// One value of an item: a text, or a list the item holds (a nested repeating block reads it).
export type ItemValue = string | RepeatData
export type ItemValues = Readonly<Record<string, ItemValue>> | ReadonlyMap<string, ItemValue>
// RepeatData gains:   readonly itemRepeats?: readonly string[]   (sources of the lists an item holds)
// RepeatSourceDescriptor gains:   readonly itemRepeats?: readonly RepeatSourceDescriptor[]   (the lists one item holds)
```

Update the doc comments: `itemFields` names text keys read from the item, and `itemRepeats` names list keys.

- Produces (`src/resolve.ts`):

```ts
export interface ItemContext {
  readonly values: ReadonlyMap<string, string>
  readonly lists: ReadonlyMap<string, ResolvedRepeat>
}
export interface ResolvedRepeat extends RepeatShape {
  readonly items: readonly ItemContext[]
  // The shapes of the lists its items hold, at every depth (merged across items).
  readonly nested: ReadonlyMap<string, RepeatShape>
}
// Resolution: `itemFieldsOf` is replaced by
//   readonly shapes: ReadonlyMap<string, RepeatShape>   (descriptors, merged with the nested shapes of resolved data)
export const MAX_REPEAT_NESTING = 8
export function toItemContext(values: ItemValues, shapes?: ReadonlyMap<string, RepeatShape>, depth?: number): ItemContext
```

- [ ] **Step 1: Write the failing tests.** In `test/helpers.ts`, add `readonly sources?: readonly RepeatSourceDescriptor[]` to `FakeData`, and `listRepeatSources: () => sources` to `fakeProvider` (default `[]`). Then add to `test/resolve.test.ts` (import `zoned`, `zoneRow`, `repeat`, `cell`, `table`, `paragraph`, `field`, `text`, `doc`, `page`, `fakeProvider` from helpers, and `toItemContext`, `MAX_REPEAT_NESTING` from `../src/resolve.ts`):

```ts
describe('item scopes', () => {
  const DAYS = {
    items: [
      { 'day.label': 'Saturday', 'day.sessions': { items: [{ 'session.title': 'Opening' }, { 'session.title': 'Tour' }] } },
      { 'day.label': 'Sunday' },
    ],
    itemFields: ['day.label'],
  }
  const nested = doc(page(repeat('programme.days', paragraph(field('day.label')), zoned('day.sessions', { header: [paragraph(text('Sessions of '), field('day.label'))], body: [paragraph(field('session.title'), text(' '), field('person.lastName'))], footer: [paragraph(field('day.label'))] }))))

  it('never asks the provider for a list an enclosing item holds, nor for an item field', async () => {
    const provider = fakeProvider({ fields: { 'person.lastName': 'Doe' }, repeats: { 'programme.days': DAYS } })
    const r = await resolveDocument(nested, provider)
    expect(provider.calls).toContain('repeat:programme.days')
    expect(provider.calls).not.toContain('repeat:day.sessions')
    expect(provider.calls).not.toContain('field:day.label')
    expect(provider.calls).not.toContain('field:session.title')
    // A document field in a body is still a document field.
    expect(provider.calls).toContain('field:person.lastName')
    expect(r.unresolved).toEqual([])
    expect(r.shapes.get('day.sessions')?.itemFields).toEqual(new Set(['session.title']))
  })

  it('treats an item-field name in a footer as a document field', async () => {
    const document = doc(page(zoned('list.items', { body: [paragraph(field('item.name'))], footer: [paragraph(field('item.name'))] })))
    const provider = fakeProvider({ repeats: { 'list.items': { items: [{ 'item.name': 'A' }] } } })
    const r = await resolveDocument(document, provider)
    expect(provider.calls).toContain('field:item.name')
    expect(r.unresolved).toEqual([{ key: 'item.name', kind: 'field', reason: 'missing' }])
  })

  it('reads the header and footer rows of a body table in the enclosing scope', async () => {
    const document = doc(page(repeat('list.items', table(zoneRow('header', cell('table_header', field('item.name'))), zoneRow('body', cell('table_cell', field('item.name')))))))
    const provider = fakeProvider({ repeats: { 'list.items': { items: [{ 'item.name': 'A' }] } } })
    await resolveDocument(document, provider)
    expect(provider.calls.filter((call) => call === 'field:item.name')).toHaveLength(1)
  })

  it('knows a nested source from the descriptors even when the outer block is unresolved', async () => {
    const provider = fakeProvider({ sources: [{ key: 'programme.days', label: 'Days', itemFields: [{ key: 'day.label', label: 'Day' }], itemRepeats: [{ key: 'day.sessions', label: 'Sessions', itemFields: [{ key: 'session.title', label: 'Title' }] }] }] })
    const r = await resolveDocument(nested, provider)
    expect(provider.calls).not.toContain('repeat:day.sessions')
    expect(r.unresolved.map((u) => u.key)).toEqual(['repeat:programme.days', 'person.lastName'])
  })

  it('cuts a list that holds itself at the nesting limit', () => {
    const cyclic: { items: object[] } = { items: [] }
    cyclic.items.push({ name: 'x', self: cyclic })
    let context = toItemContext({ list: cyclic as never })
    let depth = 0
    while (context.lists.get(depth === 0 ? 'list' : 'self')?.items[0]) {
      context = context.lists.get(depth === 0 ? 'list' : 'self')!.items[0]!
      depth++
    }
    expect(depth).toBe(MAX_REPEAT_NESTING)
  })
})
```

Update the existing `resolve.test.ts` cases that read `resolution.itemFieldsOf` to read `resolution.shapes.get(source)?.itemFields`, and those that read item values as a `Map` (`item.get(key)`) to read `item.values.get(key)`.

- [ ] **Step 2: Run, expect failure.** `bunx vitest run test/resolve.test.ts`. Expected: `shapes`, `itemRepeats`, `MAX_REPEAT_NESTING` and `toItemContext(…).lists` are missing.

- [ ] **Step 3: Implement.** Write `src/repeat.ts` as above. In `src/context.ts`, make the type changes. In `src/resolve.ts`:

```ts
const isRepeatData = (value: unknown): value is RepeatData => typeof value === 'object' && value !== null && Array.isArray((value as RepeatData).items)

const mergeShape = (into: Map<string, RepeatShape>, key: string, shape: RepeatShape): void => {
  const found = into.get(key)
  into.set(key, found ? { itemFields: new Set([...found.itemFields, ...shape.itemFields]), itemRepeats: new Set([...found.itemRepeats, ...shape.itemRepeats]) } : shape)
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
```

Note that `mergeShape(nested, key, list)` stores a `ResolvedRepeat` as a shape. When merging, copy only `itemFields` and `itemRepeats` (as the `found` branch does). For the first insert, store `{ itemFields: list.itemFields, itemRepeats: list.itemRepeats }`, not `list` itself.

In `createResolver`:
- `loadDescriptors` returns `descriptorShapes(list)`.
- `repeat(source)` normalises with those shapes.
- In `resolve(doc)`, start with `const shapes = new Map(await loadDescriptors())`.
- Replace the `Scope` type with:

```ts
interface Walk {
  readonly items: ShapeScope | null
  readonly stack: readonly string[]
  readonly depth: number
}
```

In `walk`:
- For a variable, `if (declaringField(scope.items, name)) continue`.
- Replace the `repeat` branch with `await walkRepeat(child, scope)`.
- Templates keep the chain: `embed(id, scope)` walks with `{ items: scope.items, stack: […], depth: … }`.

```ts
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
```

(`childrenOf`: add `const childrenOf = (node: ProseNode): ProseNode[] => Array.from({ length: node.childCount }, (_, i) => node.child(i))` to `resolve.ts`.) The initial walk scope is `{ items: null, stack: …, depth: 0 }`. Return `shapes` in the `Resolution` instead of `itemFieldsOf`. In `EMPTY_RESOLUTION`, set `shapes: new Map()`. In `sameResolution`, compare `sameMap(a.shapes, b.shapes)`. In `index.ts`, export `MAX_REPEAT_NESTING`, `type RepeatShape` (from `repeat.ts`), and `type ItemValue`.

- [ ] **Step 4: Run.** `bunx vitest run test/resolve.test.ts` passes. `bun run typecheck` reports errors in `render.ts` (it still reads `itemFieldsOf` and `Map` items). Make the minimum change that compiles: in `fieldText`, use `env.item?.values.get(key)`; in `renderRepeat`, use `env.resolution.shapes.get(source)?.itemFields`. Task 3 replaces both. The full suite may still fail only in `render.test.ts` header-row and empty-table cases (fixed in Task 3).

- [ ] **Step 5: Commit.**

```bash
git add packages/editor/src/repeat.ts packages/editor/src/context.ts packages/editor/src/resolve.ts packages/editor/src/render.ts packages/editor/src/index.ts packages/editor/test/helpers.ts packages/editor/test/resolve.test.ts
git commit -m "feat(resolve): item scopes chained to their parent and lists held by items"
```

---

### Task 3: Rendering zones in item scopes

**Files:**
- Modify: `packages/editor/src/render.ts`, `packages/editor/src/index.ts`
- Test: `packages/editor/test/zones.test.ts` (create), `packages/editor/test/render.test.ts` (update)

**Interfaces:**
- Consumes: `src/repeat.ts` (Task 2), `Resolution.shapes`, `ItemContext { values, lists }`.
- Produces:

```ts
export interface RepeatParts {
  readonly header: ProseNode[]
  readonly body: ProseNode[]
  readonly footer: ProseNode[]
  // A resolved list with no item (the editor shows its "nothing to list" line).
  readonly empty: boolean
}
export function renderRepeatParts(node: ProseNode, resolution: Resolution, options?: RenderOptions): RepeatParts  // editor mode by default, like renderBlocks
```

- [ ] **Step 1: Write the failing tests** (`test/zones.test.ts`):

```ts
import { describe, expect, it } from 'vitest'

import { toHtml } from '../src/output/html.ts'
import { renderBlocks, renderDocument, renderRepeatParts } from '../src/render.ts'
import { resolveDocument } from '../src/resolve.ts'
import { cell, doc, embed, docJson, fakeProvider, field, page, paragraph, repeat, table, text, zoned, zoneRow } from './helpers.ts'

const texts = (nodes: readonly { readonly textContent: string }[]) => nodes.map((node) => node.textContent)
const LIST = (...names: string[]) => ({ 'list.items': { items: names.map((name) => ({ 'item.name': name })), itemFields: ['item.name'] } })
const block = zoned('list.items', { header: [paragraph(text('Header'))], body: [paragraph(text('– '), field('item.name'))], footer: [paragraph(text('Footer'))] })

async function draw(content: object, repeats: object, fields: Record<string, string> = {}) {
  const document = doc(page(content))
  const resolution = await resolveDocument(document, fakeProvider({ fields, repeats: repeats as never }))
  return { document, resolution, node: document.child(0).child(0) }
}

describe('repeating block zones', () => {
  it('draws the header once, the body per item, the footer once', async () => {
    const { node, resolution } = await draw(block, LIST('A', 'B'))
    expect(texts(renderBlocks(node, resolution))).toEqual(['Header', '– A', '– B', 'Footer'])
  })

  it('draws the header and footer of an empty list, and says it is empty', async () => {
    const { node, resolution, document } = await draw(block, LIST())
    expect(renderDocument(document, resolution).textContent).toBe('HeaderFooter')
    expect(renderRepeatParts(node, resolution).empty).toBe(true)
  })

  it('prints nothing for an unresolved block and shows every zone as written in the editor', async () => {
    const { node, resolution, document } = await draw(block, {})
    expect(renderDocument(document, resolution).textContent).toBe('')
    expect(texts(renderBlocks(node, resolution))).toEqual(['Header', '– {item.name}', 'Footer'])
  })

  it('keeps a body table header and footer rows once, around a row per item', async () => {
    const t = repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), zoneRow('body', cell('table_cell', field('item.name'))), zoneRow('footer', cell('table_cell', text('End')))))
    const { node, resolution } = await draw(t, LIST('A', 'B'))
    const [expanded] = renderBlocks(node, resolution)
    expect(expanded!.textContent).toBe('NameABEnd')
    expanded!.check()
  })

  it('keeps an empty table header and footer rows, and drops a table left with no row', async () => {
    const withRows = repeat('list.items', table(zoneRow('header', cell('table_header', text('Name'))), zoneRow('body', cell('table_cell', field('item.name'))), zoneRow('footer', cell('table_cell', text('End')))))
    const empty = await draw(withRows, LIST())
    expect(texts(renderBlocks(empty.node, empty.resolution))).toEqual(['NameEnd'])
    const bare = await draw(repeat('list.items', table(zoneRow('body', cell('table_cell', field('item.name'))))), LIST())
    const rendered = renderDocument(bare.document, bare.resolution)
    rendered.check()
    expect(rendered.textContent).toBe('')
  })

  it('prints no row zone: zones belong to the template', async () => {
    const t = repeat('list.items', table(zoneRow('header', cell('table_header', text('N'))), zoneRow('body', cell('table_cell', field('item.name')))))
    const { document, resolution } = await draw(t, LIST('A'))
    expect(toHtml(document, resolution)).not.toContain('data-zone')
  })

  it('reads an item-field name in the footer as a document field', async () => {
    const t = zoned('list.items', { body: [paragraph(field('item.name'))], footer: [paragraph(field('item.name'))] })
    const { node, resolution, document } = await draw(t, LIST('A'))
    expect(renderDocument(document, resolution).textContent).toBe('A')
    expect(texts(renderBlocks(node, resolution))).toEqual(['A', '{item.name}'])
  })
})

describe('nested blocks', () => {
  const DAYS = {
    'programme.days': {
      items: [
        { 'day.label': 'Saturday', 'day.sessions': { items: [{ 'session.title': 'Opening' }, { 'session.title': 'Tour' }] } },
        { 'day.label': 'Sunday' },
      ],
      itemFields: ['day.label'],
    },
  }
  const programme = repeat('programme.days', paragraph(field('day.label')), zoned('day.sessions', { body: [paragraph(text('– '), field('session.title'), text(' ('), field('day.label'), text(')'))], footer: [paragraph(text('End of '), field('day.label'))] }))

  it('fills an inner body from its item and the outer item, and an inner footer from the outer item', async () => {
    const { document, resolution } = await draw(programme, DAYS)
    const lines = texts(renderDocument(document, resolution).child(0).content.content)
    expect(lines).toEqual(['Saturday', '– Opening (Saturday)', '– Tour (Saturday)', 'End of Saturday', 'Sunday', 'End of Sunday'])
  })

  it('does not fall back to an outer value when the declaring item lacks it', async () => {
    const outer = { 'outer.items': { items: [{ name: 'Outer', 'inner.items': { items: [{}], itemFields: ['name'] } }], itemFields: ['name'] } }
    const { document, resolution } = await draw(repeat('outer.items', repeat('inner.items', paragraph(text('['), field('name'), text(']')))), outer)
    expect(renderDocument(document, resolution).textContent).toBe('[]')
  })

  it('fills an embedded template in a body from the item', async () => {
    const document = doc(page(repeat('list.items', embed('line'))))
    const resolution = await resolveDocument(document, fakeProvider({ repeats: LIST('A', 'B') as never, templates: { line: { name: 'Line', content: docJson(page(paragraph(text('* '), field('item.name')))) } } }))
    expect(renderDocument(document, resolution).textContent).toBe('* A* B')
  })
})
```

Update `test/render.test.ts`:
- "keeps a table header once…": build the header row with `zoneRow('header', …)` (header detection is now by zone).
- "does not draw a table without items, even with its header": rename to "keeps the header of an empty table" and expect `['Name']` (texts of the rendered blocks).
- Other cases keep their expectations; they go through the `repeat` helper, which wraps a body.

- [ ] **Step 2: Run, expect failure.** `bunx vitest run test/zones.test.ts test/render.test.ts`. Expected: `renderRepeatParts` is not exported, and zones are not drawn.

- [ ] **Step 3: Implement** in `src/render.ts`. Replace `item` and `itemFields` in `Env` with a scope chain:

```ts
interface ItemScope extends ShapeScope {
  readonly item: ItemContext | null
  readonly parent: ItemScope | null
}
interface Env {
  readonly resolution: Resolution
  readonly mode: 'output' | 'editor' | 'expressions'
  readonly missingItemValue: string
  readonly items: ItemScope | null
  readonly stack: readonly string[]
  readonly depth: number
}

function fieldText(node: ProseNode, env: Env): string {
  const name = String(node.attrs.name)
  const key = fieldKey(name, node.attrs.label as string | null)
  if (env.mode === 'expressions') return expression(key)
  // Read from the innermost item that declares it; missing there is missing (no fallback outward).
  const holder = declaringField(env.items, name)
  if (holder) return holder.item?.values.get(key) ?? env.missingItemValue
  const value = env.resolution.fields.get(key)
  if (value !== undefined) return value
  return env.mode === 'editor' ? expression(key) : ''
}

// The list a block draws: held by an enclosing item (missing there: empty), else the provider's
// answer (none: unresolved, null).
function listOf(repeat: ProseNode, env: Env): { readonly list: ResolvedRepeat | null; readonly shape: RepeatShape } {
  const source = String(repeat.attrs.source)
  const holder = declaringRepeat(env.items, source)
  if (holder) {
    const shape = env.resolution.shapes.get(source) ?? EMPTY_SHAPE
    return { list: holder.item?.lists.get(source) ?? { ...shape, items: [], nested: new Map() }, shape }
  }
  const data = env.resolution.repeats.get(source) ?? null
  return { list: data, shape: data ?? env.resolution.shapes.get(source) ?? EMPTY_SHAPE }
}

function expandTable(table: ProseNode, items: readonly ItemContext[], outer: Env, inner: (item: ItemContext) => Env): ProseNode[] {
  const rows = childrenOf(table)
  const once = (zone: RowZone) => rows.filter((row) => rowZone(row) === zone).flatMap((row) => renderNode(row, outer))
  const body = rows.filter((row) => rowZone(row) === 'body')
  const all = [...once('header'), ...items.flatMap((item) => body.flatMap((row) => renderNode(row, inner(item)))), ...once('footer')]
  // A table left with no row (no item, no header or footer row) isn't drawn.
  return all.length === 0 ? [] : [table.copy(Fragment.fromArray(all))]
}

function repeatParts(repeat: ProseNode, env: Env): RepeatParts {
  const { list, shape } = listOf(repeat, env)
  const zones = zonesOf(repeat)
  const blocksOf = (zone: ProseNode | null, e: Env) => (zone ? childrenOf(zone).flatMap((block) => renderNode(block, e)) : [])
  // Shown as written: with expressions, and in the editor while the block is unresolved.
  if (env.mode === 'expressions' || (env.mode === 'editor' && !list)) {
    const written: Env = { ...env, mode: 'expressions', items: { shape, item: null, parent: env.items } }
    return { header: blocksOf(zones.header, written), body: blocksOf(zones.body, written), footer: blocksOf(zones.footer, written), empty: false }
  }
  // An unresolved block prints nothing.
  if (!list) return { header: [], body: [], footer: [], empty: false }
  const inner = (item: ItemContext): Env => ({ ...env, items: { shape, item, parent: env.items } })
  const table = bodyTable(zones.body)
  const body = table ? expandTable(table, list.items, env, inner) : list.items.flatMap((item) => blocksOf(zones.body, inner(item)))
  return { header: blocksOf(zones.header, env), body, footer: blocksOf(zones.footer, env), empty: list.items.length === 0 }
}

function renderRepeat(repeat: ProseNode, env: Env): ProseNode[] {
  const parts = repeatParts(repeat, env)
  return [...parts.header, ...parts.body, ...parts.footer]
}
```

In `renderNode`, before the final `return [node.copy(content)]`, reset row zones:

```ts
// Rendered rows carry no zone: zones belong to the template.
if (node.type === nodes.table_row && rowZone(node) !== 'body') return [node.type.create({ ...node.attrs, zone: 'body' }, content, node.marks)]
```

In `envOf`, set `items: null` (instead of `item: null, itemFields: null`). Embeds keep `env.items`: `renderEmbed` already spreads `env`. Remove the old `isHeaderRow`. Export:

```ts
export function renderRepeatParts(node: ProseNode, resolution: Resolution, options: RenderOptions = {}): RepeatParts {
  return repeatParts(node, envOf(resolution, { mode: 'editor', ...options }, rootStack(resolution), 0))
}
```

Export `renderRepeatParts` and `type RepeatParts` from `index.ts`.

- [ ] **Step 4: Run.** `bunx vitest run` passes completely. `bun run typecheck` passes.

- [ ] **Step 5: Commit.**

```bash
git add packages/editor/src/render.ts packages/editor/src/index.ts packages/editor/test/zones.test.ts packages/editor/test/render.test.ts
git commit -m "feat(render): header, body and footer zones filled in chained item scopes"
```

---

### Task 4: Insertion and the editor view

**Files:**
- Modify: `packages/editor/src/commands.ts`, `packages/editor/src/react/nodeViews.ts`
- Test: `packages/editor/test/commands.test.ts`, `packages/editor/test/DocumentEditor.test.tsx`

**Interfaces:**
- Consumes: `renderRepeatParts` (Task 3), node types (Task 1).
- Produces: `repeatContent(source): ProseNode` returns a `repeat_body`; `insertRepeat` inserts `repeat(source) > repeat_body`. For the `table` layout, the labels row has `zone: 'header'`.

- [ ] **Step 1: Write the failing tests.** In `test/commands.test.ts` (follow the file's existing pattern for running a command on a state):

```ts
it('inserts a block whose body is a table with a header row', () => {
  const source = { key: 'list.items', label: 'Items', layout: 'table' as const, itemFields: [{ key: 'item.name', label: 'Name' }] }
  const body = repeatContent(source)
  expect(body.type.name).toBe('repeat_body')
  const table = body.child(0)
  expect([table.child(0).attrs.zone, table.child(1).attrs.zone]).toEqual(['header', 'body'])
  expect(table.child(0).textContent).toBe('Name')
})
```

In `test/DocumentEditor.test.tsx`:

```ts
it('shows the empty line of a resolved empty block between its body and its footer', async () => {
  render(<DocumentEditor initial={docJson(page(zoned('list.items', { header: [paragraph(text('Head'))], body: [paragraph(field('item.name'))], footer: [paragraph(text('Foot'))] })))} provider={provider({ resolveRepeat: () => ({ items: [] }) })} />)
  const block = await screen.findByText('Nothing to list')
  const lines = [...block.parentElement!.querySelectorAll('p')].map((p) => p.textContent)
  expect(lines).toEqual(['Head', 'Nothing to list', 'Foot'])
})
```

(Import `zoned` from `./helpers.ts`. `'Nothing to list'` is `DEFAULT_LABELS.repeatEmpty`; import and use it instead of the literal.)

- [ ] **Step 2: Run, expect failure.** `bunx vitest run test/commands.test.ts test/DocumentEditor.test.tsx`.

- [ ] **Step 3: Implement.** In `commands.ts`:

```ts
// The body a new block starts with: a table (a header row of the item fields' labels, a row of the
// item fields), or a line per item.
export function repeatContent(source: RepeatSourceDescriptor): ProseNode {
  const fields = source.itemFields
  if (source.layout === 'table' && fields.length > 0) {
    const table = nodes.table.create(null, [nodes.table_row.create({ zone: 'header' }, fields.map((f) => headerCell(f.label))), nodes.table_row.create(null, fields.map((f) => fieldCell(f.key)))])
    return nodes.repeat_body.create(null, table)
  }
  const inline = fields.flatMap((f, i) => (i === 0 ? [fieldNode(f.key)] : [editorSchema.text(SEPARATOR), fieldNode(f.key)]))
  return nodes.repeat_body.create(null, nodes.paragraph.create(null, [editorSchema.text(LIST_LEAD), ...inline]))
}
```

`insertRepeat` is unchanged (`nodes.repeat.create({ source }, repeatContent(source))`). In `nodeViews.ts` `repeatView`:

```ts
const parts = renderRepeatParts(node, resolution, { mode: showExpressions ? 'expressions' : 'editor' })
const before = [...parts.header, ...parts.body]
if (before.length > 0) dom.append(blocksDom(before, resolution))
if (parts.empty) {
  const empty = document.createElement('p')
  empty.className = 'ie-repeat-empty'
  empty.textContent = labels.repeatEmpty
  dom.append(empty)
}
if (parts.footer.length > 0) dom.append(blocksDom(parts.footer, resolution))
```

(Replace the `renderBlocks` import with `renderRepeatParts` where it is no longer used.)

- [ ] **Step 4: Run.** `bunx vitest run` and `bun run typecheck` pass. Then `bun run test:e2e`. The `waitlist.entries` empty check (`L.repeatEmpty`) still passes, because that sample has no header yet.

- [ ] **Step 5: Commit.**

```bash
git add packages/editor/src/commands.ts packages/editor/src/react/nodeViews.ts packages/editor/test/commands.test.ts packages/editor/test/DocumentEditor.test.tsx
git commit -m "feat(editor): insert blocks with a body zone; show an empty block's header and footer"
```

---

### Task 5: Demo samples and e2e

**Files:**
- Modify: `apps/demo/src/samples/build.ts`, `apps/demo/src/samples/templates.ts`, `apps/demo/src/fakeContext.ts`, `apps/demo/src/labels/en.ts`, `fr.ts`, `nl.ts`
- Test: `apps/demo/e2e/repeat.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: the invoice's Total as a footer row; a header zone on the waiting list; a new `programme` sample (days → sessions).

- [ ] **Step 1: Write the failing e2e tests** (append to `repeat.spec.ts`, with `import { SAMPLE } from '../src/fakeContext.ts'`; existing assertions change as noted):

```ts
test('draws a table footer row once, after the items', async ({ page }) => {
  await open(page, 'invoice')
  const rows = canvas(page).locator('.ie-repeat[data-repeat="invoice.lines"] tr')
  await expect(rows).toHaveCount(5)
  await expect(rows.last()).toContainText(SAMPLE.invoiceTotal)
})

test('shows the header of an empty list with its empty line', async ({ page }) => {
  await open(page, 'problems')
  const block = canvas(page).locator('.ie-repeat[data-repeat="waitlist.entries"]')
  await expect(block.locator('p')).toHaveText([APP.waitlistHeader, L.repeatEmpty])
})

test('fills a nested block from its item and the enclosing item', async ({ page }) => {
  await open(page, 'programme')
  const block = canvas(page).locator('.ie-repeat[data-repeat="programme.days"]')
  await expect(block.locator('h2').first()).toHaveText(SAMPLE.firstDay)
  await expect(block).toContainText(SAMPLE.firstSessionLine)
  await expect(block).toContainText(SAMPLE.firstDayNote)
})
```

`SAMPLE` is not a label; its values come from the fake data. Export from `fakeContext.ts`, computed from the same functions that build the `en` data, so the spec has no literal:

```ts
// The English sample values the e2e tests read (computed from the data, never retyped).
export const SAMPLE = {
  invoiceTotal: values('en')['invoice.total']!,
  firstDay: FIRST_DAY_LABEL_EN,                              // repeats('en')['programme.days'].items[0]['day.label']
  firstSessionLine: `– ${FIRST_SESSION.time} ${FIRST_SESSION.title} (${FIRST_DAY_LABEL_EN})`,
  firstDayNote: FIRST_DAY_NOTE,
}
```

Define `FIRST_SESSION = { time: '10:00', title: 'Opening of the doors' }` and `FIRST_DAY_NOTE = 'Free entry, no booking needed.'` as constants used both in the data and in `SAMPLE`. Compute `FIRST_DAY_LABEL_EN` with the same date formatter the data uses.

Update the existing assertions:
- "keeps a table header once and draws a row per item": `rows.first()` still holds the header. If the test counts rows, the count goes from 4 to 5 (footer row).
- "shows its template with expressions on demand, and a block with nothing to list": the waiting-list block now shows `[APP.waitlistHeader, L.repeatEmpty]`, not `L.repeatEmpty` alone.
- `output.spec.ts` "previews the filled document…": unchanged (welcome letter).
- `markdown` expectations on the invoice, if any e2e asserts them: the table gains a Total row.

- [ ] **Step 2: Run, expect failure.** `cd apps/demo && bunx playwright test e2e/repeat.spec.ts`.

- [ ] **Step 3: Implement.** In `build.ts`:

```ts
export const repeat = (source: string, ...content: object[]) => ({ type: 'repeat', attrs: { source }, content: [{ type: 'repeat_body', content }] })
export const zoned = (source: string, zones: { readonly header?: object[]; readonly body: object[]; readonly footer?: object[] }) => ({
  type: 'repeat',
  attrs: { source },
  content: [...(zones.header ? [{ type: 'repeat_header', content: zones.header }] : []), { type: 'repeat_body', content: zones.body }, ...(zones.footer ? [{ type: 'repeat_footer', content: zones.footer }] : [])],
})
export const headerRow = (...labels: string[]) => ({ type: 'table_row', attrs: { zone: 'header' }, content: labels.map((l) => cell('table_header', text(l))) })
export const footerRow = (...cells: object[][]) => ({ type: 'table_row', attrs: { zone: 'footer' }, content: cells.map((content) => cell('table_cell', ...content)) })
```

In `templates.ts`:
- Invoice: `repeat('invoice.lines', table(headerRow('Description', 'Quantity', 'Amount'), fieldRow('line.description', 'line.quantity', 'line.amount'), footerRow([], [bold('Total')], [field('invoice.total')])))`, and delete the separate `pAligned('right', bold('Total: '), field('invoice.total'))` line.
- Problems: `zoned('waitlist.entries', { header: [p(text('Waiting list:'))], body: [p(text('– '), field('entry.name'))] })`, replacing the separate `p(text('Waiting list:'))` and the old `repeat`.
- Add:

```ts
{
  id: 'programme',
  content: doc([
    embed('letterhead'),
    h(1, text('Open weekend programme')),
    zoned('programme.days', {
      body: [h(2, field('day.label')), zoned('day.sessions', { body: [p(text('– '), field('session.time'), text(' '), field('session.title'), text(' ('), field('day.label'), text(')'))], footer: [p(withMarks(field('day.note'), SMALL))] })],
    }),
    p(),
    embed('footer'),
  ]),
},
```

Sample texts stay English in the template, like the existing samples (the template text itself isn't translated).

In `fakeContext.ts`:
- Add `'programme.days'` to `repeats(language)`, with two days (weekday labels via `Intl.DateTimeFormat(LOCALES[language], { weekday: 'long', day: 'numeric', month: 'long' })` on fictitious dates in October 2026). The first day holds `'day.sessions'` with three fictitious sessions and a `day.note`. The second day holds two sessions.
- Add the descriptor `{ key: 'programme.days', label: strings.sources['programme.days']!, layout: 'lines', itemFields: [{ key: 'day.label', label: … }, { key: 'day.note', label: … }], itemRepeats: [{ key: 'day.sessions', label: strings.sources['day.sessions']!, itemFields: ['session.time', 'session.title'].map(…) }] }`.
- Export `SAMPLE` as described in Step 1.

In each of `labels/en.ts`, `fr.ts`, `nl.ts`:
- Add `templateNames.programme` (en "Open weekend programme", fr "Programme du week-end portes ouvertes", nl "Programma open weekend").
- Add `sources['programme.days']` and `sources['day.sessions']`.
- Add `fields['day.label' | 'day.note' | 'session.time' | 'session.title']`.
- Add `waitlistHeader` ("Waiting list:", with fr and nl equivalents) to `AppStrings` in `labels/types.ts`, and use `APP.waitlistHeader` in the spec. The sample text stays English, so the e2e test runs in `en` and reads the `en` value.

Register `programme` in `SAMPLE_TEMPLATES` and confirm it appears in the template picker.

- [ ] **Step 4: Run.** `bun run typecheck`, `bun run test` and `bun run test:e2e` all pass (from the repo root). Open the demo (`bun run dev`, port 5179) on `?template=programme` and `?template=invoice`, and take one Playwright screenshot of each. Check that the Total row sits inside the table and that the nested lines read "– 10:00 … (Saturday …)".

- [ ] **Step 5: Commit.**

```bash
git add apps/demo
git commit -m "feat(demo): invoice total as a footer row, waiting-list header, nested programme sample"
```

---

### Task 6: README and final review

**Files:**
- Modify: `packages/editor/README.md`

- [ ] **Step 1:** In the README's data-provider section, describe:
  - zones: header and footer drawn once, shown even for an empty list; the body drawn per item;
  - row zones for a table-only body;
  - the scope rule: the body is filled in the item's scope, header and footer in the enclosing one, and a field is read from the innermost scope that declares it, with no fallback;
  - nested lists (`ItemValue = string | RepeatData`, `itemRepeats` on descriptors and data) and `MAX_REPEAT_NESTING`;

- [ ] **Step 2:** Run `bun run typecheck && bun run test && bun run test:e2e` and confirm everything is green.
- [ ] **Step 3: Commit.**

```bash
git add packages/editor/README.md
git commit -m "docs: repeating-block zones and item scopes"
```

- [ ] **Step 4:** Request a whole-branch review (superpowers:requesting-code-review), with the Review Focus list above as the reviewer's checklist.
