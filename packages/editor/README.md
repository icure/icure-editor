# @icure/editor

A paginated, template-aware document editor for React, built on ProseMirror.

A template is a document with **references** that a host-supplied **data provider** resolves when
the document is shown or printed:

- **fields**: a name (`recipient.lastName`) resolved to text, optionally qualified by a label
  (`preference.value:Newsletter`);
- **repeating blocks**: a header, a body and a footer; the body is drawn once per item of a source
  (a line per item, or a table that keeps its header row once and repeats its body rows), and
  items may hold lists of their own;
- **embedded templates**: another template inlined by id, recursively, with cycle detection and a
  depth limit;
- **images**: a reference to the host's image store, with alt text and a width.

References the provider can't fill are never left silently blank: they show as their expression
(`{recipient.city}`) and are listed behind an "unresolved references" chip. The output (HTML and
PDF) is one-to-one with what the editor shows.

The repository is a Bun workspaces monorepo:

```
packages/editor   the library (@icure/editor)
apps/demo         a test app: sample templates, a fake in-memory provider, language and theme switch
```

## Install

```bash
bun add @icure/editor          # peer dependencies: react, react-dom ^19
bun add pdfmake                # optional, only for PDF output
```

## Usage

```tsx
import { DocumentEditor, type EditorDataProvider } from '@icure/editor'
import '@icure/editor/styles.css'

const provider: EditorDataProvider = {
  listFields: () => [{ key: 'recipient.lastName', label: 'Last name', group: 'Recipient' }],
  resolveField: (key) => ({ 'recipient.lastName': 'Martin' })[key],
  listRepeatSources: () => [{ key: 'orders', label: 'Orders', layout: 'table', itemFields: [{ key: 'order.ref', label: 'Reference' }] }],
  resolveRepeat: async (source) => (source === 'orders' ? { items: [{ 'order.ref': 'A-1' }, { 'order.ref': 'A-2' }] } : null),
  listTemplates: () => [{ id: 'signature', name: 'Signature' }],
  loadTemplate: async (id) => (id === 'signature' ? { id, name: 'Signature', content: signatureJson } : null),
  images: {
    resolve: (id) => ({ src: myImageStore.dataUri(id) }),
    upload: async (file) => ({ id: await myImageStore.put(file) }),
  },
}

export function Letter({ template }: { template: unknown }) {
  return (
    <DocumentEditor
      initial={template}          // ProseMirror JSON of the editor schema; read once per mount
      provider={provider}
      documentId="letter"         // so the document can't embed itself
      labels={{ bold: 'Gras' }}   // any subset; English defaults fill the rest
      onEdit={(doc) => saveDraft(doc.toJSON())}
    />
  )
}
```

Output:

```ts
import { A4_PAGE, resolveDocument, toHtmlDocument, toMarkdown, toPdfContent, toPdfDefinition, preparePdfmake, renderPdf, withPdfImages } from '@icure/editor'

const resolution = await resolveDocument(doc, provider, { rootId: 'letter' })
// One sheet per page, sized to the page format (the editor's `page`, A4 by default) on screen and on paper.
const html = toHtmlDocument(doc, resolution, { title: 'Letter', lang: 'en', page: A4_PAGE })
// CommonMark with GFM tables: headings, paragraphs, bold, italic, tables, images; pages split by `---`.
const markdown = toMarkdown(doc, resolution)

const pdfmake = preparePdfmake(pdfmakeInstance, { files: robotoVfs, families: { Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } } })
const content = toPdfContent(doc, await withPdfImages(resolution), { title: 'Letter', createdAt: new Date(2026, 0, 1) })
const bytes = await renderPdf(pdfmake, toPdfDefinition(content))
```

The same document, resolution and `createdAt` give byte-identical PDFs.

## The data provider

```ts
interface EditorDataProvider {
  listFields?(): MaybePromise<readonly FieldDescriptor[]>                 // "Insert field" menu
  resolveField(key: string): MaybePromise<string | null | undefined>       // blank = unresolved
  listRepeatSources?(): MaybePromise<readonly RepeatSourceDescriptor[]>   // "Insert repeating block"
  resolveRepeat?(source: string): MaybePromise<RepeatData | null | undefined>
  listTemplates?(): MaybePromise<readonly TemplateSummary[]>              // "Insert template"
  loadTemplate?(id: string): MaybePromise<TemplateContent | null | undefined>
  saveTemplate?(id: string, content: unknown): MaybePromise<void>         // "Update the shared template"
  readonly images?: ImageProvider
}

interface ImageProvider {
  resolve(id: string): MaybePromise<ResolvedImage | null | undefined>     // { src, alt?, width? }
  pick?(): MaybePromise<PickedImage | null>                               // the host's own picker
  upload?(file: File): MaybePromise<PickedImage>                          // after the editor's checks
}
```

- Every method may answer synchronously or with a promise; a method that throws leaves its key
  unresolved (the editor never breaks on the host's errors).
- Answers are cached per editor (`createResolver`); `editorRef.current.refresh()` forgets them.
- Labels of fields, sources and templates come from the provider, already in the user's language.

### Repeating blocks

A repeating block has three zones. The **header** and **footer** are drawn once, and still shown
when the list is empty. The **body** is drawn once per item. A block whose source the provider
can't resolve prints nothing (it is listed as unresolved); in the editor, a resolved empty list
shows a "nothing to list" line between body and footer, never printed (for a body made of a single
table, the line comes after the table, as its footer rows live inside it). When the body is a single
table, its rows carry a zone (`table_row` attribute `zone`: `header` | `body` | `footer`): header
rows are drawn once before, footer rows once after, and body rows once per item.

**Scopes.** The body is filled in the item's scope, the header and footer in the enclosing scope.
A field is read from the innermost scope whose source declares it (`itemFields`); if that item has
no value for it, it prints the missing-item value (blank in the output, "—" in the editor) and adds
no unresolved entry, with no fallback to an outer scope. A field no scope declares
is a document field, asked of the provider.

**Nested lists.** An item value is a text or a list (`ItemValue = string | RepeatData`). A source
declares the lists its items hold in `itemRepeats` (nested descriptors), and its data names them
in `RepeatData.itemRepeats`. A repeating block inside a body, whose source an enclosing item
declares, reads that item's list: an absent list is an empty list, and the provider is never asked
for it. Nesting is bounded by `MAX_REPEAT_NESTING` (8); deeper data is dropped.

```ts
const provider: EditorDataProvider = {
  resolveField: () => undefined,
  listRepeatSources: () => [{
    key: 'days', label: 'Days', layout: 'lines',
    itemFields: [{ key: 'day.name', label: 'Day' }],
    itemRepeats: [{ key: 'sessions', label: 'Sessions', itemFields: [{ key: 'session.title', label: 'Title' }] }],
  }],
  resolveRepeat: (source) => source === 'days'
    ? { items: [
        { 'day.name': 'Monday', sessions: { items: [{ 'session.title': 'Opening' }, { 'session.title': 'Workshop' }] } },
        { 'day.name': 'Tuesday', sessions: { items: [] } },   // an empty nested list; a missing key means the same
      ] }
    : null,
}
```

A `sessions` block placed in the body of a `days` block lists the sessions of each day.

## Editing blocks in place

A repeating block or an embedded template is drawn from data, as one unit. To change it, open it in
place: **double-click** it, or select it (the arrows select it whole) and press **Enter**. It turns
into an editing area showing its template, fields as placeholders (`{event.title}`), under a bar:

- **Done** (or Ctrl+Enter / ⌘+Enter) applies the changes; **Cancel** (or Escape) discards them,
  without a question. Clicking elsewhere doesn't leave: the rest of the document waits (it is not
  editable, and pages are not re-paginated, until the area closes).
- The toolbar acts on the editing area. Undo and redo work inside it; after Done, the whole change
  is one undo step in the document. `getDocument()`, `onChange` and `onEdit` only see the change on
  Done; `editorRef.current.activeView` is the view the toolbar acts on.
- **A repeating block** shows its three zones, captioned "Header", "Repeated for each item" and
  "Footer"; a missing header or footer is offered empty ("Click to add a header"), and dropped again
  if still empty on Done. "Insert field" offers the item fields of the block (and of the blocks
  around it, innermost first) before the document's fields. In a body table, header and footer rows
  are shown distinctly, and the Table menu can make the current row a header row, a footer row or
  a repeated row. Done writes the block back into the document.
- **An embedded template**: Done asks where the changes go. **Update the shared template** calls the
  provider's `saveTemplate(id, content)` with ProseMirror JSON of the editor schema (never HTML),
  then resolves the document again (every document embedding it changes); while it saves, the area
  can't be edited or left; if it fails, the area stays open with an alert. **Make a copy for this document** replaces the reference with the
  edited blocks (fields stay fields). **Keep editing** goes back. Without `saveTemplate`, only the
  copy is offered. A template that didn't change closes without asking.
- A block inside an editing area opens the same way, one level at a time. Opening another block
  cancels the open one. A read-only editor opens nothing. An embedded template inserted inside an
  editing area is resolved on Done (until then it is drawn as not found and can't be opened).

## Labels and styling

- No user-facing string is hard-coded: pass `labels` (`PartialLabels`) to the editor; English
  defaults (`DEFAULT_LABELS`) fill the rest. The demo ships English, French and Dutch label sets.
  The editing area's strings are under `inlineEditing` (bar title, Done, Cancel, the template
  question, zone captions and placeholders, the save error, the hint), and the Table menu's row
  actions under `rowZone`.
- The stylesheet uses `--ie-*` custom properties only (colours, spacing, radii, control size, page
  format); set any of them on `.ie-editor` or an ancestor. Dark mode follows
  `prefers-color-scheme`, overridable with `data-theme="light|dark"` on an ancestor.
- Controls are 44 px by default and 32 px with a fine pointer that can hover
  (`(hover: hover) and (pointer: fine)`).

## Accessibility

- The toolbar is a `role="toolbar"` with a label; every icon button has an `aria-label` and
  `aria-pressed` for marks and alignment; alignment buttons form a labelled `role="group"`. Its
  name also shows in a tooltip on hover or keyboard focus, which stays while pointed at and
  closes with Escape.
- Menus follow the WAI-ARIA menu-button pattern (arrows, Home/End, Escape returns focus, Tab
  leaves); grouped fields are `role="group"` sections.
- The canvas is a labelled `role="textbox"` with `aria-multiline`. Mod-B / I / U, Mod-Z / Y,
  Tab / Shift-Tab between table cells. A repeating block or an embedded template is one unit: the
  arrows select it whole, and stop between two such blocks (a gap cursor) where typing or Enter
  starts a new line.
- An editing area is a `role="group"` named after its bar title ("Repeating block: Sessions"); its
  editor is a `role="textbox"` with the same name, described by the bar's hint (how to leave). Its
  zones are labelled groups. The bar's buttons are named by their text. Double-click has Enter as
  its keyboard equivalent; Escape cancels from the editor or the bar.
- The raw expression of a tapped reference is announced under the toolbar (`aria-live`): the touch
  alternative to the hover tooltip. Images are resized by buttons and a number field, never by
  dragging; their description is asked as soon as they are inserted.

## Security

- **The schema is the only parser of pasted or loaded HTML.** There is no link, script or raw-HTML
  node; every style value (colour, size, font, alignment) is checked against a closed pattern;
  in pasted HTML, reference names (fields, sources, template ids, image ids) must match a bounded
  identifier pattern.
- **Nothing is evaluated.** A field is looked up by key; its value is inserted as a text node, never
  as HTML, in the editor and in both outputs.
- **Images are references, not URLs.** The schema neither reads nor writes `src`: an
  `<img src="https://…">` in pasted HTML is dropped. Only the host's provider maps an id to a source,
  and that source must be a raster `data:` URI (PNG, JPEG, GIF, WebP, within the size limit), a
  `blob:` URL or an `https:` URL without credentials; SVG and every other scheme are refused.
  Uploaded files are checked for declared type, size (2 MB by default) and actual content (magic
  numbers) before the host sees them.
- **Editing in place** uses the same schema (pasted HTML goes through the same parser); a template
  saved with `saveTemplate` is ProseMirror JSON of that schema, never HTML. The demo's provider
  refuses content that doesn't fit the schema (`isEditorDocument`); a host should check it too.
- **Nested templates** are inlined with cycle detection (a template met again on its own path,
  the edited document included) and a depth limit (5 by default).
- **PDF**: the pdfmake instance is locked down (no URL, no local file); images are embedded from
  `data:` URIs only.
- **Standalone HTML** carries a CSP (`default-src 'none'`, no script). The demo shows it in an
  empty-`sandbox` frame.
- The document lives in memory; persisting it (and where) is the host's decision.

## Develop

```bash
bun install
bun run build        # the library: ESM bundle, declarations, styles.css
bun run typecheck
bun run test         # unit tests (vitest + jsdom)
bun run dev          # the demo on http://localhost:5179
bun run test:e2e     # Playwright on the demo (Chromium)
```
