import { DOMParser as ProseParser, DOMSerializer } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'

import { editorSchema, safeBorders, safeColour, safeFont, safeSize } from '../src/schema.ts'
import { InvalidDocumentError, toEditorDocument } from '../src/document.ts'
import { cell, docJson, page, paragraph, table, text, zoneRow, zoned } from './helpers.ts'

const parse = (html: string) => {
  const host = document.createElement('div')
  host.innerHTML = html
  return ProseParser.fromSchema(editorSchema).parse(host)
}
const serialise = (html: string) => {
  const host = document.createElement('div')
  host.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(parse(html).content))
  return host.innerHTML
}

describe('cell borders and layout tables', () => {
  it('round-trips the sides of a cell and the preset of a table through copy and paste', () => {
    const doc = toEditorDocument(docJson(page({ type: 'table', attrs: { layout: 'layout' }, content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { borders: 'bl' }, content: [paragraph(text('a'))] }, { type: 'table_cell', attrs: { borders: '' }, content: [paragraph(text('b'))] }, cell('table_cell', text('c'))] }] })))
    const host = document.createElement('div')
    host.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(doc.content))
    expect(host.innerHTML).toContain('<table data-layout="layout">')
    const [left, none, plain] = [...host.querySelectorAll('td')]
    expect([left!.style.borderTopStyle, left!.style.borderRightStyle, left!.style.borderBottomStyle, left!.style.borderLeftStyle]).toEqual(['none', 'none', 'solid', 'solid'])
    expect(none!.style.borderTopStyle).toBe('none')
    expect(plain!.hasAttribute('style')).toBe(false)
    const back = ProseParser.fromSchema(editorSchema).parse(host)
    const row = back.child(0).child(0).child(0)
    expect(back.child(0).child(0).attrs.layout).toBe('layout')
    expect(row.child(0).attrs.borders).toBe('bl')
    expect(row.child(1).attrs.borders).toBe('')
    expect(row.child(2).attrs.borders).toBe('tblr')
  })

  it('draws a default cell and a ruled table as plain markup', () => {
    expect(serialise('<div class="ie-page"><table><tr><td><p>a</p></td></tr></table></div>')).toBe('<div class="ie-page"><table><tbody><tr><td><p>a</p></td></tr></tbody></table></div>')
  })

  it('drops a data-borders that is not a set of sides, and any style it carries', () => {
    for (const hostile of ['x;background:url(https://x.example/a.png)', 'tblrt', 'T', 'tb;color:red']) {
      const html = serialise(`<div class="ie-page"><table data-layout="x;y"><tr><td data-borders="${hostile}"><p>a</p></td></tr></table></div>`)
      expect(html).not.toContain('url(')
      expect(html).not.toContain('data-')
      expect(html).not.toContain('style')
    }
    expect(safeBorders('lt')).toBe('tl')
    expect(safeBorders(42)).toBe('tblr')
  })

  it('writes only safe sides when loaded from JSON with hostile attributes', () => {
    const doc = toEditorDocument(docJson(page({ type: 'table', attrs: { layout: '<x>' }, content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { borders: 'x;background:url(y)' }, content: [paragraph(text('a'))] }] }] })))
    const host = document.createElement('div')
    host.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(doc.content))
    expect(host.innerHTML).toBe('<div class="ie-page"><table><tbody><tr><td><p>a</p></td></tr></tbody></table></div>')
  })
})

describe('the schema as the only parser of pasted HTML', () => {
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

  it('drops links, scripts, frames and raw HTML, keeping their text', () => {
    const html = serialise('<div class="ie-page"><p>a <a href="javascript:alert(1)">link</a><script>alert(1)</script><iframe src="https://x.example"></iframe> <span onclick="x()">b</span></p></div>')
    expect(html).toBe('<div class="ie-page"><p>a link b</p></div>')
  })

  it('drops an image given by URL, keeps an image reference without any source', () => {
    const html = serialise('<div class="ie-page"><p><img src="https://tracker.example/pixel.gif"><img src="data:image/png;base64,AAAA" alt="x"><img data-image-id="logo" src="https://tracker.example/a.png" alt="Logo" width="120" onerror="alert(1)"></p></div>')
    expect(html).toBe('<div class="ie-page"><p><img class="ie-image" data-image-id="logo" alt="Logo" width="120"></p></div>')
  })

  it('checks every style value against a closed pattern', () => {
    const html = serialise('<div class="ie-page"><p style="text-align: center"><span style="color: red; font-size: 12px">a</span><span style="color: #a00; font-family: Georgia">b</span><span style="font-size: expression(alert(1))">c</span></p></div>')
    // Named colours are refused (the DOM may normalise #a00 to rgb(), both are accepted forms).
    expect(html).toMatch(/^<div class="ie-page"><p style="text-align: center;?"><span style="font-size: 12px;?">a<\/span><span style="color: (#a00|rgb\(170, 0, 0\));?"><span style="font-family: Georgia;?">b<\/span><\/span>c<\/p><\/div>$/)
    expect(safeColour('url(javascript:x)')).toBeNull()
    expect(safeSize('1e9px')).toBeNull()
    expect(safeFont('Comic Sans')).toBeNull()
  })

  it('round-trips a field, a block and an embed whose names hold a selection through copy and paste', () => {
    const name = `person.contacts[kind=="home"].phone`
    const source = `orders[status=='open']`
    const doc = toEditorDocument(docJson(page(paragraph({ type: 'variable', attrs: { name, label: null } }), { type: 'template_ref', attrs: { templateId: 'letters[lang==fr]' } })))
    const host = document.createElement('div')
    host.append(DOMSerializer.fromSchema(editorSchema).serializeFragment(doc.content))
    const back = ProseParser.fromSchema(editorSchema).parse(host)
    expect(back.child(0).child(0).child(0).attrs.name).toBe(name)
    expect(back.child(0).child(1).attrs.templateId).toBe('letters[lang==fr]')
    expect(parse(`<div class="ie-page"><div class="ie-repeat" data-source="${source}"><div class="ie-repeat-body"><p>x</p></div></div></div>`).child(0).child(0).attrs.source).toBe(source)
  })

  it('refuses a field, block or embed reference with markup in its name', () => {
    const node = parse('<div class="ie-page"><p><span class="ie-field" data-field="a&quot;><b>x"></span><span class="ie-field" data-field="person.name"></span></p><div class="ie-embed" data-template="<x>"></div></div>')
    expect(node.toJSON()).toEqual({ type: 'doc', content: [{ type: 'page', attrs: { id: 0 }, content: [{ type: 'paragraph', attrs: { align: 'inherit' }, content: [{ type: 'variable', attrs: { name: 'person.name', label: null } }] }] }] })
  })
})

describe('documents', () => {
  it('opens the empty document by default and refuses content that does not fit', () => {
    expect(toEditorDocument(undefined).textContent).toBe('')
    expect(() => toEditorDocument({ type: 'doc', content: [{ type: 'paragraph' }] })).toThrow(InvalidDocumentError)
    expect(() => toEditorDocument({ type: 'doc', content: [{ type: 'page', content: [{ type: 'html', attrs: { raw: '<script>' } }] }] })).toThrow(InvalidDocumentError)
  })
})
