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

## Layout

- `src/build.ts`: JSON builders, and the form idioms built on them:
  - `line` / `pLine`: `Label : field-or-blank`;
  - `box` / `options`: option boxes;
  - `blank`: a line to fill by hand;
  - `frame`: a framed section (a one-cell table);
  - `cell(…, { colspan, rowspan, background, border })`.
- `src/provider.ts`: the field catalogue (patient, insurance, physician, entourage, date) with
  fictitious values. Clinical data stays blank, to be filled by hand.
- `src/forms/*.ts`: one file per form. Each form has its own page format (`page`): A4, A5, A4
  landscape, or narrower margins.
- `e2e/forms.spec.ts`: for every form, it checks:
  - the form fits the schema;
  - every field it uses has a value;
  - it opens filled, with nothing unresolved;
  - it previews as HTML and downloads as a PDF.

## What the editor cannot express yet (and how the forms work around it)

| Missing | Workaround in these forms | Forms affected |
| --- | --- | --- |
| A checkbox (and a font that has ☐ in the PDF) | `○` text (Roboto has no ballot box) | all |
| Column widths (`colwidth` is stored, never drawn; columns come out equal) | colspans over a grid of equal columns | all table layouts |
| Borderless or one-sided cell borders | white border colour; vertical rules dropped | all two-column layouts |
| Rich table cells in the PDF (marks, colours, colspan, nested tables, images, headings) | none: the PDF prints each cell as plain text, so it does **not** match the editor for any of these forms | all |
| A table that breaks across pages (pagination moves whole blocks; a taller table is clipped) | long grids cut into runs of small tables | lab request, BAT |
| A forced page break (a page boundary in the JSON is not kept; reflow pulls content back) | a tall first block on the next page | surgical admission, lab request, compression |
| Landscape and arbitrary sheets in the PDF (A4, A5 and Letter only, all portrait) | landscape in the editor and HTML only | radiology request |
| Fill lines that stretch to the line's end, dotted leaders | underscore blanks of chosen lengths (they don't wrap in the PDF and overflow) | all |
| Fixed-height boxes, cell padding and row height | empty paragraphs | all text areas |
| Horizontal rules | a table border, or dropped | admission forms |
| Rotated text, absolute positioning (address window over a background), small caps, highlights | horizontal text; tables; capitals; coloured cells | lab request, BAT, theatre admission |
| Pictograms and product pictures | dropped (the provider has one image) | compression, hip order |
| Fields that tick an option (`patient.sex` → ☒ F) | hand-ticked options | admission forms |
| Spacing control (paragraph spacing, line height) | smaller sizes and empty paragraphs | dense forms |

The plan to close these gaps is in
[`docs/superpowers/plans/2026-10-16-form-features.md`](../../docs/superpowers/plans/2026-10-16-form-features.md).
