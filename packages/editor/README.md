# @icure/editor

A paginated, template-aware document editor for React, built on ProseMirror.

A template is a document with **references** that a host-supplied **data provider** resolves when
the document is shown or printed:

- **fields**: a name (`recipient.lastName`) resolved to text, optionally qualified by a label
  (`preference.value:Newsletter`);
- **repeating blocks**: content drawn once per item of a source (a line per item, or a table that
  keeps its header row once and repeats its body rows);
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
import { resolveDocument, toHtmlDocument, toPdfContent, toPdfDefinition, preparePdfmake, renderPdf, withPdfImages } from '@icure/editor'

const resolution = await resolveDocument(doc, provider, { rootId: 'letter' })
const html = toHtmlDocument(doc, resolution, { title: 'Letter', lang: 'en' })

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
- Inside a repeating block, the fields named by the source's `itemFields` are read from the item;
  every other field from the provider.
- Labels of fields, sources and templates come from the provider, already in the user's language.

## Labels and styling

- No user-facing string is hard-coded: pass `labels` (`PartialLabels`) to the editor; English
  defaults (`DEFAULT_LABELS`) fill the rest. The demo ships English, French and Dutch label sets.
- The stylesheet uses `--ie-*` custom properties only (colours, spacing, radii, control size, page
  format); set any of them on `.ie-editor` or an ancestor. Dark mode follows
  `prefers-color-scheme`, overridable with `data-theme="light|dark"` on an ancestor.
- Controls are 44 px by default and 32 px with a fine pointer that can hover
  (`(hover: hover) and (pointer: fine)`).

## Accessibility

- The toolbar is a `role="toolbar"` with a label; every icon button has an `aria-label` and
  `aria-pressed` for marks and alignment; alignment buttons form a labelled `role="group"`.
- Menus follow the WAI-ARIA menu-button pattern (arrows, Home/End, Escape returns focus, Tab
  leaves); grouped fields are `role="group"` sections.
- The canvas is a labelled `role="textbox"` with `aria-multiline`. Mod-B / I / U, Mod-Z / Y,
  Tab / Shift-Tab between table cells.
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
