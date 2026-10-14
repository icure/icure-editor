import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { EditorDataProvider } from '../src/context.ts'
import { DocumentEditor, type DocumentEditorHandle } from '../src/react/DocumentEditor.tsx'
import { docJson, embed, field, page, paragraph, PNG_DATA_URI, repeat, text } from './helpers.ts'
import { createRef } from 'react'

const PNG_BYTES = Uint8Array.from(atob(PNG_DATA_URI.split(',')[1]!), (c) => c.charCodeAt(0))

function provider(overrides: Partial<EditorDataProvider> = {}): EditorDataProvider {
  return {
    listFields: () => [
      { key: 'person.lastName', label: 'Last name', group: 'Person' },
      { key: 'date.today', label: 'Today', group: 'Dates' },
    ],
    resolveField: (key) => ({ 'person.lastName': 'Doe', 'date.today': '06/10/2026' })[key],
    listRepeatSources: () => [{ key: 'list.items', label: 'Items', itemFields: [{ key: 'item.name', label: 'Name' }] }],
    resolveRepeat: (source) => (source === 'list.items' ? { items: [{ 'item.name': 'First' }, { 'item.name': 'Second' }] } : null),
    listTemplates: () => [{ id: 'signature', name: 'Signature' }],
    loadTemplate: (id) => (id === 'signature' ? { id, name: 'Signature', content: docJson(page(paragraph(text('Regards')))) } : null),
    ...overrides,
  }
}

const canvas = () => screen.getByRole('textbox', { name: 'Document' })

describe('the document editor', () => {
  it('draws fields, repeating blocks and embedded templates from the provider', async () => {
    render(<DocumentEditor initial={docJson(page(paragraph(text('Dear '), field('person.lastName')), repeat('list.items', paragraph(field('item.name'))), embed('signature')))} provider={provider()} />)
    await waitFor(() => expect(canvas()).toHaveTextContent('Dear Doe'))
    expect(canvas()).toHaveTextContent('FirstSecond')
    expect(canvas()).toHaveTextContent('Template: SignatureRegards')
    expect(screen.queryByRole('button', { name: /unresolved/ })).not.toBeInTheDocument()
  })

  it('lists unresolved references behind a chip, with their expressions', async () => {
    const user = userEvent.setup()
    render(<DocumentEditor initial={docJson(page(paragraph(field('person.city')), embed('gone')))} provider={provider()} />)
    const chip = await screen.findByRole('button', { name: '2 unresolved references' })
    expect(canvas()).toHaveTextContent('{person.city}')
    await user.click(chip)
    const list = screen.getByRole('region', { name: 'Unresolved references' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['{person.city}', '{template:gone}'])
  })

  it('shows every expression on demand, also when read only', async () => {
    const user = userEvent.setup()
    render(<DocumentEditor readOnly initial={docJson(page(paragraph(field('person.lastName'))))} provider={provider()} />)
    await waitFor(() => expect(canvas()).toHaveTextContent('Doe'))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Show expressions' }))
    expect(canvas()).toHaveTextContent('{person.lastName}')
  })

  it('offers a labelled toolbar whose menus insert the provider’s fields', async () => {
    const user = userEvent.setup()
    const ref = createRef<DocumentEditorHandle>()
    render(<DocumentEditor ref={ref} initial={docJson(page(paragraph(text('Hello '))))} provider={provider()} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    for (const name of ['Undo', 'Redo', 'Bold', 'Italic', 'Underline', 'Align left', 'Centre', 'Align right', 'Justify', 'Insert table']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument()
    await user.click(await within(toolbar).findByRole('button', { name: 'Insert field' }))
    const menu = screen.getByRole('menu', { name: 'Insert field' })
    expect(within(menu).getByRole('group', { name: 'Person' })).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Last name' }))
    await waitFor(() => expect(ref.current?.getDocument()?.textContent).toBe('Hello '))
    expect(JSON.stringify(ref.current?.getDocument()?.toJSON())).toContain('"name":"person.lastName"')
    await waitFor(() => expect(canvas()).toHaveTextContent('Doe'))
  })

  it('does not offer the document itself as a template to embed', async () => {
    const user = userEvent.setup()
    render(<DocumentEditor documentId="signature" initial={docJson(page(paragraph()))} provider={provider({ listTemplates: () => [{ id: 'signature', name: 'Signature' }, { id: 'footer', name: 'Footer' }] })} />)
    await user.click(await screen.findByRole('button', { name: 'Insert template' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Footer'])
  })

  it('uses the labels the host passes', async () => {
    render(<DocumentEditor initial={docJson(page(paragraph(field('x'))))} provider={provider()} labels={{ toolbar: 'Mise en forme', bold: 'Gras', unresolved: { chip: (n) => `${n} non résolue(s)` } }} />)
    expect(screen.getByRole('toolbar', { name: 'Mise en forme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gras' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '1 non résolue(s)' })).toBeInTheDocument()
  })

  it('reports the user’s edits, then uploads a checked image and asks for its description', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const upload = vi.fn(async () => ({ id: 'img-1' }))
    const ref = createRef<DocumentEditorHandle>()
    render(<DocumentEditor ref={ref} onEdit={onEdit} initial={docJson(page(paragraph(text('Logo '))))} provider={provider({ images: { resolve: (id) => (id === 'img-1' ? { src: PNG_DATA_URI } : null), upload } })} />)
    await user.click(screen.getByRole('button', { name: 'Insert image' }))
    // A disguised file is refused before the host sees it.
    await user.upload(screen.getByLabelText('Choose an image file'), new File(['<svg onload=alert(1)>'], 'x.png', { type: 'image/png' }))
    expect(await screen.findByText('The file is not the image it claims to be.')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
    await user.upload(screen.getByLabelText('Choose an image file'), new File([PNG_BYTES], 'logo.png', { type: 'image/png' }))
    const alt = await screen.findByRole('textbox', { name: 'Image description' })
    await waitFor(() => expect(alt).toHaveFocus())
    await user.type(alt, 'Company logo')
    const width = screen.getByRole('spinbutton', { name: 'Width (px)' })
    await user.type(width, '120{Enter}')
    const json = JSON.stringify(ref.current?.getDocument()?.toJSON())
    expect(json).toContain('"imageId":"img-1","alt":"Company logo","width":120')
    expect(onEdit).toHaveBeenCalled()
    await waitFor(() => expect(canvas().querySelector('img.ie-image')).toHaveAttribute('src', PNG_DATA_URI))
    expect(canvas().querySelector('img.ie-image')).toHaveAttribute('alt', 'Company logo')
  })

  it('shows why content that does not fit the schema cannot be opened', () => {
    render(<DocumentEditor initial={{ type: 'doc', content: [{ type: 'script' }] }} provider={provider()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('does not fit the editor schema')
  })
})
