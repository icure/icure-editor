import { DOMParser as ProseParser, DOMSerializer } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'

import { editorSchema, safeColour, safeFont, safeSize } from '../src/schema.ts'
import { InvalidDocumentError, toEditorDocument } from '../src/document.ts'

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

describe('the schema as the only parser of pasted HTML', () => {
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
