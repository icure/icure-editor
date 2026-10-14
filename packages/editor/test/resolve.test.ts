import { describe, expect, it } from 'vitest'

import type { EditorDataProvider } from '../src/context.ts'
import { createResolver, resolveDocument, sameResolution } from '../src/resolve.ts'
import { doc, fakeProvider, field, image, page, paragraph, repeat, text, PNG_DATA_URI } from './helpers.ts'

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
    expect([...resolution.repeats.get('s')!.items[0]!]).toEqual([['x', 'kept']])
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
