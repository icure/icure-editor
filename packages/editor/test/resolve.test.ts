import { describe, expect, it } from 'vitest'

import type { EditorDataProvider, RepeatData } from '../src/context.ts'
import { createResolver, MAX_REPEAT_NESTING, resolveDocument, sameResolution, toItemContext } from '../src/resolve.ts'
import { cell, doc, fakeProvider, field, image, page, paragraph, repeat, table, text, zoneRow, zoned, PNG_DATA_URI } from './helpers.ts'

describe('resolving a document through the data provider', () => {
  it('fills the fields the provider answers and lists the others in reading order', async () => {
    const document = doc(page(paragraph(field('person.lastName'), text(' '), field('person.city'), field('date.today'), field('person.lastName'))))
    const resolution = await resolveDocument(document, fakeProvider({ fields: { 'person.lastName': 'Doe', 'date.today': '01/10/2026' } }))
    expect(resolution.fields.get('person.lastName')).toBe('Doe')
    expect(resolution.unresolved).toEqual([{ key: 'person.city', kind: 'field', reason: 'missing' }])
  })

  it('treats a blank value as unresolved', async () => {
    const resolution = await resolveDocument(doc(page(paragraph(field('a'), field('b')))), fakeProvider({ fields: { a: '   ', b: '' } }))
    expect(resolution.unresolved.map((e) => e.key)).toEqual(['a', 'b'])
  })

  it('qualifies a labelled field by its label', async () => {
    const resolution = await resolveDocument(doc(page(paragraph(field('measure.latest', 'Weight')))), fakeProvider({ fields: { 'measure.latest:Weight': '72 kg' } }))
    expect(resolution.fields.get('measure.latest:Weight')).toBe('72 kg')
    expect(resolution.unresolved).toEqual([])
  })

  it("does not list a block's item fields as fields of their own, and lists an unresolved block", async () => {
    const document = doc(page(repeat('list.items', paragraph(field('item.name'), field('person.lastName'))), repeat('other.items', paragraph(field('other.name')))))
    const provider: EditorDataProvider = {
      ...fakeProvider({ repeats: { 'list.items': { items: [{ 'item.name': 'A' }] } } }),
      listRepeatSources: () => [{ key: 'other.items', label: 'Other', itemFields: [{ key: 'other.name', label: 'Name' }] }],
    }
    const resolution = await resolveDocument(document, provider)
    expect(resolution.unresolved).toEqual([
      { key: 'person.lastName', kind: 'field', reason: 'missing' },
      { key: 'repeat:other.items', kind: 'repeat', reason: 'missing' },
    ])
    expect([...resolution.repeats.get('list.items')!.itemFields]).toEqual(['item.name'])
  })

  it('keeps only non-blank item values', async () => {
    const resolution = await resolveDocument(doc(page(repeat('s', paragraph(field('x'))))), fakeProvider({ repeats: { s: { items: [new Map([['x', 'kept'], ['y', ' ']])] } } }))
    expect([...resolution.repeats.get('s')!.items[0]!.values]).toEqual([['x', 'kept']])
  })

  it('leaves a key unresolved when the provider throws, and never breaks', async () => {
    const provider: EditorDataProvider = {
      resolveField: () => {
        throw new Error('backend down')
      },
      resolveRepeat: () => Promise.reject(new Error('nope')),
    }
    const resolution = await resolveDocument(doc(page(paragraph(field('a')), repeat('s', paragraph(text('x'))))), provider)
    expect(resolution.unresolved.map((e) => e.key)).toEqual(['a', 'repeat:s'])
  })

  it('asks the provider once per key across successive resolutions, until cleared', async () => {
    const provider = fakeProvider({ fields: { a: 'A' } })
    const resolver = createResolver(provider)
    const document = doc(page(paragraph(field('a'), field('a'))))
    const first = await resolver.resolve(document)
    const second = await resolver.resolve(document)
    expect(provider.calls).toEqual(['field:a'])
    expect(sameResolution(first, second)).toBe(true)
    resolver.clear()
    await resolver.resolve(document)
    expect(provider.calls).toEqual(['field:a', 'field:a'])
  })

  it('accepts a synchronous or an asynchronous provider alike', async () => {
    const document = doc(page(paragraph(field('a'))))
    const sync = await resolveDocument(document, { resolveField: () => 'A' })
    const async = await resolveDocument(document, { resolveField: async () => 'A' })
    expect(sync.fields).toEqual(async.fields)
    expect(sync.unresolved).toEqual([])
  })

  it('resolves an image to a safe source only', async () => {
    const document = doc(page(paragraph(image('logo'), image('remote'), image('gone'))))
    const resolution = await resolveDocument(document, {
      resolveField: () => null,
      images: { resolve: (id) => (id === 'logo' ? { src: PNG_DATA_URI } : id === 'remote' ? { src: 'javascript:alert(1)' } : null) },
    })
    expect(resolution.images.get('logo')?.src).toBe(PNG_DATA_URI)
    expect(resolution.unresolved).toEqual([
      { key: 'image:remote', kind: 'image', reason: 'invalid' },
      { key: 'image:gone', kind: 'image', reason: 'missing' },
    ])
  })
})

describe('item scopes', () => {
  const DAYS: RepeatData = {
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

  it('sees two resolutions of the same nested document as the same, and a changed shape as different', async () => {
    const resolver = createResolver(fakeProvider({ fields: { 'person.lastName': 'Doe' }, repeats: { 'programme.days': DAYS } }))
    const a = await resolver.resolve(nested)
    const b = await resolver.resolve(nested)
    expect(sameResolution(a, b)).toBe(true)
    const other = await resolveDocument(nested, fakeProvider({ fields: { 'person.lastName': 'Doe' }, repeats: { 'programme.days': { ...DAYS, items: [{ 'day.label': 'Saturday', 'day.sessions': { items: [{ 'session.room': 'A' }] } }] } } }))
    expect(sameResolution(a, other)).toBe(false)
  })

  it('tells a changed shape from an unchanged one when the items are the same objects', async () => {
    const repeats = { 'programme.days': DAYS }
    const a = await resolveDocument(nested, fakeProvider({ repeats }))
    const sources = [{ key: 'programme.days', label: 'Days', itemFields: [{ key: 'day.label', label: 'Day' }], itemRepeats: [{ key: 'day.sessions', label: 'Sessions', itemFields: [{ key: 'session.room', label: 'Room' }] }] }]
    const reshaped = await resolveDocument(nested, fakeProvider({ repeats, sources }))
    expect(sameResolution(a, reshaped)).toBe(false)
  })

  it('cuts a list that holds itself at its first recurrence, however many items it has', () => {
    const cyclic: { items: object[] } = { items: [] }
    for (let i = 0; i < 10; i++) cyclic.items.push({ name: 'x' + i, self: cyclic })
    const start = performance.now()
    const context = toItemContext({ list: cyclic as never })
    expect(performance.now() - start).toBeLessThan(500)
    const list = context.lists.get('list')!
    expect(list.items).toHaveLength(10)
    for (const item of list.items) expect(item.lists.has('self')).toBe(false)
  })

  it('cuts genuinely deep data at the nesting limit', () => {
    let deepest: { items: object[] } = { items: [{ name: 'leaf' }] }
    for (let i = 0; i < MAX_REPEAT_NESTING + 4; i++) deepest = { items: [{ name: 'n' + i, down: deepest }] }
    let context = toItemContext({ list: deepest as never })
    let depth = 0
    while (context.lists.get(depth === 0 ? 'list' : 'down')?.items[0]) {
      context = context.lists.get(depth === 0 ? 'list' : 'down')!.items[0]!
      depth++
    }
    expect(depth).toBe(MAX_REPEAT_NESTING)
  })

  it('resolves a source that lists itself, with many entries, quickly', async () => {
    const source: { key: string; label: string; itemFields: { key: string; label: string }[]; itemRepeats: unknown[] } = { key: 'list', label: 'List', itemFields: [{ key: 'item.name', label: 'Name' }], itemRepeats: [] }
    for (let i = 0; i < 10; i++) source.itemRepeats.push(source)
    const document = doc(page(repeat('list', paragraph(field('item.name')))))
    const start = performance.now()
    const resolution = await resolveDocument(document, fakeProvider({ sources: [source as never], repeats: { list: { items: [{ 'item.name': 'A' }] } } }))
    expect(performance.now() - start).toBeLessThan(500)
    expect(resolution.unresolved).toEqual([])
  })
})
