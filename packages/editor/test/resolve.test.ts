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
