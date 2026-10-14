import { describe, expect, it } from 'vitest'

import { renderDocument } from '../src/render.ts'
import { resolveDocument } from '../src/resolve.ts'
import { toHtml } from '../src/output/html.ts'
import { docJson, doc, embed, fakeProvider, field, page, paragraph, repeat, text } from './helpers.ts'

const tpl = (name: string, ...blocks: object[]) => ({ name, content: docJson(page(...blocks)) })

describe('nested templates', () => {
  it('inlines an embedded template with its fields filled from the same provider', async () => {
    const document = doc(page(paragraph(text('Dear '), field('person.firstName')), embed('signature')))
    const provider = fakeProvider({ fields: { 'person.firstName': 'Alex', 'author.name': 'Dr Sam Smith' }, templates: { signature: tpl('Signature', paragraph(text('Kind regards,')), paragraph(field('author.name'))) } })
    const resolution = await resolveDocument(document, provider)
    expect(resolution.unresolved).toEqual([])
    const rendered = renderDocument(document, resolution)
    rendered.check()
    expect(rendered.child(0).childCount).toBe(3)
    expect(rendered.textContent).toBe('Dear AlexKind regards,Dr Sam Smith')
  })

  it('embeds templates within templates, each page of the embedded one flattened into the host', async () => {
    const document = doc(page(embed('outer')))
    const provider = fakeProvider({ templates: { outer: { name: 'Outer', content: docJson(page(paragraph(text('O1'))), page(embed('inner'))) }, inner: tpl('Inner', paragraph(text('I'))) } })
    const resolution = await resolveDocument(document, provider)
    expect(renderDocument(document, resolution).textContent).toBe('O1I')
  })

  it('detects a cycle between two templates and stops there', async () => {
    const document = doc(page(embed('a')))
    const provider = fakeProvider({ templates: { a: tpl('A', paragraph(text('A')), embed('b')), b: tpl('B', paragraph(text('B')), embed('a')) } })
    const resolution = await resolveDocument(document, provider)
    expect(resolution.unresolved).toEqual([{ key: 'template:a', kind: 'template', reason: 'cycle' }])
    expect(renderDocument(document, resolution).textContent).toBe('AB')
    // Each template is loaded once, however often it is met.
    expect(provider.calls.filter((c) => c.startsWith('template:'))).toEqual(['template:a', 'template:b'])
  })

  it('refuses a document that embeds itself', async () => {
    const document = doc(page(paragraph(text('Self')), embed('letter')))
    const provider = fakeProvider({ templates: { letter: tpl('Letter', paragraph(text('Self')), embed('letter')) } })
    const resolution = await resolveDocument(document, provider, { rootId: 'letter' })
    expect(resolution.unresolved).toEqual([{ key: 'template:letter', kind: 'template', reason: 'cycle' }])
    expect(renderDocument(document, resolution).textContent).toBe('Self')
  })

  it('stops at the depth limit', async () => {
    const chain = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`t${i}`, tpl(`T${i}`, paragraph(text(String(i))), embed(`t${i + 1}`))]))
    const document = doc(page(embed('t0')))
    const resolution = await resolveDocument(document, fakeProvider({ templates: chain }), { maxDepth: 3 })
    expect(resolution.unresolved).toEqual([{ key: 'template:t3', kind: 'template', reason: 'depth' }])
    expect(renderDocument(document, resolution).textContent).toBe('012')
  })

  it('lists a missing or invalid template and prints nothing for it', async () => {
    const document = doc(page(paragraph(text('x')), embed('gone'), embed('broken')))
    const resolution = await resolveDocument(document, fakeProvider({ templates: { broken: { name: 'Broken', content: { type: 'doc', content: [{ type: 'script' }] } } } }))
    expect(resolution.unresolved).toEqual([
      { key: 'template:gone', kind: 'template', reason: 'missing' },
      { key: 'template:broken', kind: 'template', reason: 'invalid' },
    ])
    expect(renderDocument(document, resolution).textContent).toBe('x')
  })

  it("fills an embedded template's item fields from the block it sits in", async () => {
    const document = doc(page(repeat('list', embed('line'))))
    const provider = fakeProvider({ repeats: { list: { items: [{ name: 'A' }, { name: 'B' }], itemFields: ['name'] } }, templates: { line: tpl('Line', paragraph(text('* '), field('name'))) } })
    const resolution = await resolveDocument(document, provider)
    expect(resolution.unresolved).toEqual([])
    expect(renderDocument(document, resolution).textContent).toBe('* A* B')
  })

  it('serialises an embedded template as plain blocks in the HTML output', async () => {
    const document = doc(page(embed('t')))
    const resolution = await resolveDocument(document, fakeProvider({ fields: { v: '<b>not markup</b>' }, templates: { t: tpl('T', paragraph(field('v'))) } }))
    expect(toHtml(document, resolution)).toBe('<div class="ie-page"><p>&lt;b&gt;not markup&lt;/b&gt;</p></div>')
  })
})
