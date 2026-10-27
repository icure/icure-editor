# @icure/editor: forms example

Ten real-world medical forms (hospital and clinic admission slips, imaging and laboratory requests,
an order form, a prescription pad), rebuilt as `@icure/editor` templates to find out how far the
editor goes on dense paper forms. The sources were PDF (scanned or fillable), Word and LibreOffice
files.

Everything is fictitious:

- institutions, brands, people, addresses, phone numbers (`+00 …`) and emails (`…@example.org`);
- the logo, a placeholder.

The structure, the medical labels, the options and the colours follow the sources.

```bash
bun install
bun run --filter @icure/editor-forms dev        # http://localhost:5180
bun run --filter @icure/editor-forms test:e2e   # builds the library, then Playwright (also run by the root test:e2e)
```

## The forms' content is not in the repository

Each form is a document in ProseMirror's JSON (`Node.toJSON()`, a `doc` of `page`s), one file per
form: `data/<id>.json`. The `data/` folder is gitignored; get it from a teammate and put it in
`apps/forms/data/`. To save a form you changed in the editor, write `getDocument().toJSON()` to its
file.

Without the folder, the app says so and lists nothing, the demo has no form groups, and the tests of
the missing forms skip.

## Layout

- `src/forms/catalogue.ts`: the forms in list order: id (the file name), title, source document and
  page format (A4, A5, A4 landscape, or narrower margins).
- `src/forms/index.ts` (browser, Vite `import.meta.glob`) and `src/forms/node.ts` (Node, for the
  Playwright specs): the catalogue with the content found in `data/`. The package export
  `@icure/editor-forms/forms` picks one by the `node` condition.
- `src/provider.ts`: the field catalogue (patient, insurance, physician, entourage, date) with
  fictitious values. Clinical data stays blank, to be filled by hand.
- `e2e/forms.spec.ts`: for every form, it checks:
  - the form fits the schema;
  - every field it uses has a value;
  - it opens filled, with nothing unresolved;
  - it previews as HTML and downloads as a PDF;
  - for the one- and two-sheet forms, the PDF of the form as written prints on that many sheets,
    and the downloaded PDF has as many sheets as the editor shows.

## What the editor cannot express yet (and how the forms work around it)

| Missing | Workaround in these forms | Forms affected |
| --- | --- | --- |
| A checkbox (and a font that has ☐ in the PDF) | `○` text (Roboto has no ballot box) | all |
| Column widths (`colwidth` is stored, never drawn; columns come out equal) | colspans over a grid of equal columns | all table layouts |
| A table that breaks across pages (pagination moves whole blocks; a taller table is clipped) | long grids cut into runs of small tables | lab request, BAT |
| A forced page break (a page boundary in the JSON is not kept; reflow pulls content back) | a tall first block on the next page | surgical admission, lab request, compression |
| Fill lines that stretch to the line's end, dotted leaders | underscore blanks of chosen lengths (they wrap in the PDF) | all |
| Fixed-height boxes, cell padding and row height | empty paragraphs | all text areas |
| Horizontal rules | a table border, or dropped | admission forms |
| Rotated text, absolute positioning (address window over a background), small caps, highlights | horizontal text; tables; capitals; coloured cells | lab request, BAT, theatre admission |
| Pictograms and product pictures | dropped (the provider has one image) | compression, hip order |
| Fields that tick an option (`patient.sex` → ☒ F) | hand-ticked options | admission forms |
| Spacing control (paragraph spacing, line height) | smaller sizes and empty paragraphs | dense forms |

Done since the first version: cell borders and layout tables (the `borders` cell attribute and `layout: 'layout'` tables, in place of
white borders), rich table cells in the PDF (marks, colours, spans, nested tables, images,
headings), and every sheet the editor has (landscape included) in the PDF.

The plan to close these gaps is in
[`docs/superpowers/plans/2026-10-16-form-features.md`](../../docs/superpowers/plans/2026-10-16-form-features.md).
