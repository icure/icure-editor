# Form features: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Each task is designed and reviewed with the user before code (superpowers:brainstorming for the open decisions it lists). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dense paper forms (admission slips, imaging and lab requests, order forms, prescription pads) print the way the editor shows them, with the controls such forms need.

**Origin:** `apps/forms` rebuilt ten real-world medical forms. Every form could be laid out in the editor and in the HTML output, with workarounds. None prints faithfully as a PDF. The gaps below come from that exercise; their per-form workarounds are listed in `apps/forms/README.md`.

**Tech stack:** TypeScript (strict, ESM, `verbatimModuleSyntax`), ProseMirror (`prosemirror-model`, `prosemirror-tables`), React 19, pdfmake 0.3, vitest + jsdom, Playwright, bun.

## What is impossible today

None of the ten forms is impossible to lay out on screen. These are the things that cannot be done at all, as opposed to approximated:

1. **The PDF is wrong for every form.** `toPdfContent` reduces a table to strings, one per cell (`cellText` in `output/pdfContent.ts`). Inside a cell it loses:
   - bold, colour and size;
   - alignment;
   - headings;
   - option colours;
   - nested tables (the frames);
   - images (the logo next to a title);
   - colspan and rowspan;
   - backgrounds and border colours.

   Every form here uses a table for layout, so every PDF breaks.
2. **No column widths.** `colwidth` is stored but never drawn, in the editor, the HTML or the PDF. Columns split evenly, and the forms fake proportions with colspans over a grid.
3. **No tickable box.** There is no checkbox node. Roboto, the PDF font, has no ☐, so the forms draw `○` and nothing can tick it from data (`patient.sex` → ☒ F).
4. **No table across pages.** Pagination moves whole blocks, so a table taller than a sheet is clipped. The lab request had to be cut into runs of six-row tables.
5. **No kept page break.** The reflow pulls blocks back across a page boundary written in the document, so a recto/verso form can't keep its verso.
6. **No landscape PDF, nor any size beyond A4, A5 and Letter.** The landscape radiology request is landscape only on screen.
7. **Cell borders are all or nothing.** A borderless layout cell needs `#ffffff` borders, which show on a coloured page. One-sided rules (a column separator, a line under a heading) can't be drawn.

Smaller gaps (approximations that are good enough today):

- fill lines that stretch to the line's end;
- fixed-height boxes;
- horizontal rules;
- paragraph spacing;
- rotated text;
- highlights and small caps.

## Global Constraints

- Product-agnostic library: no product, domain or backend name in `packages/editor` or the demo; sample data is fictitious. The forms example (`apps/forms`) may be medical; it stays fictitious.
- No user-facing string in the library: every new label (checkbox name, table menu entries, width input) goes through `EditorLabels` with an English default, and gets French and Dutch strings in the demo.
- **Security invariants hold.** Every new attribute is a closed set or passes a closed pattern, both when parsed from HTML and when loaded from JSON:
  - widths: integers within bounds;
  - borders: `/^[tblr]{0,4}$/`;
  - checked: a boolean;
  - a bound field: `safeIdentifier`;
  - a match value: bounded printable text.

  Nothing is evaluated: a checkbox bound to a field compares a string to a string.
- Accessibility:
  - a checkbox is `role="checkbox"` with `aria-checked`, toggled by Space and by click, and named by `aria-label` or the text that follows it;
  - a column width can be set from the keyboard (table menu → width input), never by dragging alone;
  - targets are 44 px.
- The PDF matches the editor: each task adds the PDF side next to the editor and HTML sides, not afterwards.
- A task is done when `bun run typecheck`, `bun run test` and `bun run test:e2e` are green; the root `test:e2e` runs the demo suite, then the forms suite. Tests assert what is shown or printed: the HTML output, and the pdfmake definition (cell `colSpan`, `fillColor`, `border`, `widths`, the runs of a cell). The demo e2e uses label objects; the forms e2e uses the provider's values.

## Review Focus

1. **One cell model for the HTML and the PDF.** Both must read cell attributes through the same `safe*` helpers, so the two outputs cannot drift.
2. **The pagination stays bounded.** Splitting a table and keeping a page break must not reintroduce move loops (`MAX_MOVES`).
3. **Attributes from JSON or pasted HTML can't inject style.** Assert this with a hostile-input test per attribute.

## Tasks, in order

### Task 0: Reproduce and fix the pagination ping-pong (bug)

This bug was reported by the agent that built `surgical-admission`. The editor kept reflowing and headless Chrome hung past 60 s. The layout that triggered it:

- page 1 ends with two or three empty paragraphs, then a small footer;
- page 2 starts with a short paragraph holding only the logo image.

What is known:

- each `reflow` run is bounded by `MAX_MOVES`;
- an image that finishes loading starts a fresh run (`src/react/nodeViews.ts:163`).

The suspected cause is in `pullFirstBlock`: it measures `offsetHeight` without the block's margins, and before the image has its height. A block that seems to fit is pulled back, then pushed again once an image in the page loads, and the next load starts another run. This is not proven yet; the repro comes first.

- [ ] Reproduce it in a demo e2e: a sample with the shape above and the logo image. The test fails if the page structure is still changing after 2 s.
- [ ] Fix it:
  - measure the room with margins included;
  - only pull when the block fits with a margin (hysteresis);
  - coalesce the reflows that image loads start into one per frame.
- [ ] Unit test `reflowOnce` against a stubbed layout that alternates between the two layouts: it must settle.

### Task 1: Rich table cells in the PDF

This task fixes gaps 1 and 7 on the PDF side. It changes `src/output/pdfContent.ts` and `src/output/pdf.ts`, and the tests in `test/output.test.ts`.

- [ ] Replace `{ kind: 'table'; header: string[]; rows: string[][] }` with rows of cells:
  - each cell has `{ blocks: PdfBlock[]; colSpan; rowSpan; fill?; borderColor?; borders? }`;
  - a cell's blocks are the same paragraphs, headings, images and nested tables as on a page, through the same `blocksOf`. Recursion is bounded by the document depth.
- [ ] `toPdfDefinition`:
  - a cell becomes `{ stack: [...] , colSpan, rowSpan, fillColor, borderColor: [c,c,c,c], border: [l,t,r,b] }`;
  - covered positions get the `{}` placeholders pdfmake requires;
  - `headerRows` comes from the rows with `zone: 'header'` or `table_header` cells;
  - `dontBreakRows` stays.
- [ ] Wrap long underscore blanks: pdfmake doesn't break a run with no spaces. Either let a run of `_` break, or turn a blank into a fill line (Task 5).
- [ ] Tests:
  - the definition of a 2×2 table with a colspan, a red bold run, a background, a nested frame and an image;
  - the PDF of `radiology-request` holds the frame's heading as a bold run.

### Task 2: Column widths

This task fixes gap 2. It touches the schema, `src/react/`, the HTML output and the PDF.

- [ ] **Decision (with the user):**
  - Store relative widths (percent of the table, which survives a page-format change) or the pixels `colwidth` already holds?
  - Use `prosemirror-tables`' `columnResizing` (drag), plus a keyboard path?
- [ ] Editor: draw a `<colgroup>` from the first row's `colwidth` (a `TableView`, or `columnResizing`'s view), with `table-layout: fixed`.
- [ ] Table menu: add "Column width…", an input on the current column. The labels are `table.columnWidth` and `table.columnWidthHint`.
- [ ] HTML output: the same `<colgroup>` with widths in %.
- [ ] PDF: `widths` taken from the same numbers (`*` where none is set).
- [ ] Sanitise widths: integers within bounds; the sum is normalised.
- [ ] Tests:
  - unit tests on the colgroup in the HTML and on `widths` in the definition;
  - an e2e that sets a width from the keyboard and sees the column narrower in the preview.
- [ ] `apps/forms`: replace the colspan grids with real widths (the `width` option of `cell()` already exists).

### Task 3: Cell borders and layout tables

This task fixes the editor and HTML side of gap 7.

- [ ] Add a cell attribute `borders`: a closed pattern `/^[tblr]{0,4}$/` (default `tblr`), parsed from `data-borders`.
- [ ] Add a table-level preset: `grid` (today) or `layout` (no borders, no padding change). A layout table shows a dashed outline in the editor only (like `.ie-repeat`), and never prints it.
- [ ] Add table menu entries: "Borders: all / none / top / bottom / left / right" (labels).
- [ ] HTML: per-side `border-*-style: none`. PDF: the cell's `border: [l,t,r,b]`, with Task 1 in place.
- [ ] Tests: a hostile `data-borders="x;background:url(…)"` is dropped; the output is per side; the e2e toggles borders from the menu.
- [ ] `apps/forms`: drop the `#ffffff` borders.

### Task 4: Checkbox

This task fixes gap 3.

- [ ] Add a schema node `checkbox`: inline, atom, with these attributes:
  - `checked` (boolean);
  - `field` (`safeIdentifier` or null);
  - `match` (bounded text or null).

  Parse it from `span.ie-checkbox[data-checked]`; the schema has no `<input>`.
- [ ] Resolution: a checkbox with a `field` is ticked when the resolved value equals `match`, compared exactly after trimming; nothing is evaluated. For example, `patient.sex` = `F` ticks the F box. The field is resolved like any other, cached, and appears in the unresolved chip when missing.
- [ ] Editor: a node view with `role="checkbox"`, `aria-checked`, Space and click toggle `checked` (when not bound). A bound box shows its expression on hover and under "Show expressions". Toolbar: "Insert checkbox" (label).
- [ ] HTML: `☐` / `☒` in a span with an `aria-label`. PDF: **decision with the user**:
  - (a) a symbol font the host passes (`PdfDefinitionOptions.symbolFont`), with a `[ ]` / `[x]` fallback;
  - (b) a small vector box, through pdfmake's `svg` inline in a `columns` run; it breaks the text flow, so (a) is preferred.
- [ ] Markdown: `[ ]` / `[x]`.
- [ ] Tests: schema round trip; a hostile `match`; ticked from data in all three outputs; the e2e ticks a box by keyboard.
- [ ] `apps/forms`: replace `box()`/`options()` (`○`) with checkboxes; bind sex, insurance class and accident type where the catalogue has them.

### Task 5: Pagination: forced page breaks, then tables across pages

This task fixes gaps 4 and 5.

- [ ] Add a page attribute `break: 'auto' | 'forced'` (closed set). The reflow never pulls a block back into the page before a forced page. The toolbar gets "Insert page break" (a label), which splits the page at the cursor with `forced`. Every output starts a forced page on a new sheet; this already holds in the PDF.
- [ ] Split a table: an overflowing table whose rows fit is split at the last row that fits.
  - The split moves to the next page as a continuation table that repeats the header rows (`zone: 'header'`).
  - The two parts carry a `continued` attribute and merge again when they meet on one page, so the document model holds one table. Merge them on serialisation (`getDocument`) too.
  - **Decision with the user:** splitting in the model (above) or only in the view (CSS fragmentation, which ProseMirror pages don't allow).
- [ ] Tests:
  - a 60-row table spans three pages in the editor, with its header on each;
  - the PDF has a single table (pdfmake breaks it itself);
  - `getDocument()` returns one table.
- [ ] `apps/forms`: un-split the lab grids; mark the verso pages `forced`.

### Task 6: Page formats in the PDF

This task fixes gap 6.

- [ ] `PdfContentOptions.page` accepts a `PageFormat` (mm) as well as `PageSize`, so landscape and any size are possible. `toPdfDefinition` writes `pageSize: { width, height }` in points. The margin comes from the format.
- [ ] Export one helper, `pdfPageOf(format)`, so a host passes the same `PageFormat` to the editor, the HTML and the PDF. It replaces the matching code in `apps/forms/src/pdf.ts`.
- [ ] Tests: the definition of an A4 landscape document; the forms e2e checks the landscape PDF's `MediaBox`.

### Task 7: Form idioms (smaller, each optional)

Each item is its own small task. Every attribute is a closed set, and each has an editor, an HTML, a PDF and a Markdown side.

- [ ] **Fill line:** an inline atom `fill` with `length: 'auto' | 4..80` (in ch) and `style: 'solid' | 'dotted'`.
  - `auto` stretches to the end of the line: in CSS an inline-block with `flex`, in the PDF a run of non-breaking spaces with an underline, or a `canvas` line in `columns`.
  - It replaces the `_____` blanks.
- [ ] **Box height:** a cell attribute `minHeight` (mm, from 0 to 200) for text areas. In the PDF, the row `heights`.
- [ ] **Horizontal rule:** a block atom `rule` with `colour` (`safeColour`) and `weight: 'thin' | 'medium'`. `<hr>` in HTML, a `canvas` line in the PDF.
- [ ] **Paragraph spacing:** a paragraph attribute `space: 'none' | 'small' | 'medium'` (before and after).
- [ ] **Highlight:** a mark `highlight` (background colour, `safeColour`). The PDF has `background` on a run.
- [ ] **Small caps:** a mark (CSS `font-variant`). In the PDF, upper case at a smaller size.
- [ ] **Vertical text in a cell:** CSS `writing-mode` (an attribute `vertical: boolean`). pdfmake can't rotate text, so the PDF prints it horizontal. Record that in the README, or drop the item.

Not planned: absolute positioning (the window envelope address). It breaks the flow model; a table and fixed widths (Task 2) are enough for these forms.

## Files touched (overview)

- `src/schema.ts`: covers Task 2 (`colwidth` sanitising), Task 3 (`borders`), Task 4 (`checkbox`), Task 5 (`page.break`, `table.continued`) and Task 7.
- `src/resolve.ts` and `src/render.ts`: checkbox binding (Task 4).
- `src/pagination.ts`: Tasks 0 and 5.
- `src/output/pdfContent.ts` and `src/output/pdf.ts`: Tasks 1, 2, 3, 4, 6 and 7.
- `src/output/html.ts` and `src/output/markdown.ts`: Tasks 2, 3, 4 and 7.
- `src/react/`: covers these:
  - a table view or colgroup (Task 2);
  - the table menu (Tasks 2 and 3);
  - the checkbox node view (Task 4);
  - the page-break command (Task 5).
- `src/labels.ts`: the new labels, with English defaults. `apps/demo/src/labels/*`: the new labels in fr and nl.
- `apps/forms`: drop each workaround as its feature lands, and update the README table.
