# Inline editing of repeating blocks and embedded templates: design

Agreed with the user on 2026-10-14. It builds on the repeating-block zones (`docs/superpowers/plans/2026-10-14-repeat-zones.md`, implemented): a `repeat` atom holds `repeat_header? repeat_body repeat_footer?`, and table rows carry `zone`.

## Goal

A repeating block or an embedded template is drawn as an atom filled with data. The user can edit it in place: a double-click (or Enter on the selected block) turns it into an editing area that shows its template, with fields as placeholders. The user leaves with Done or Cancel.

## Decisions (from the user)

1. **Approach: a nested ProseMirror editor** mounted inside the atom's node view (the footnote pattern). The main document never holds a half-edited state.
2. **Leaving is explicit only.**
   - A bar over the editing area has **Done** and **Cancel**.
   - **Escape** cancels.
   - Clicking elsewhere in the document does **not** leave.
   - Cancel and Escape **discard without asking for confirmation**.
3. **Embedded template, on Done:** the bar asks **"Update the shared template"** or **"Make a copy for this document"**, plus **"Keep editing"**.
   - Shared goes through a new optional provider method, `saveTemplate`.
   - Copy replaces the reference with the template's blocks.
   - Without `saveTemplate`, only the copy is offered: Done still asks, with "Make a copy" and "Keep editing" (implementation decision).
4. **Repeating block: edits are local.** Done writes the zones back into the main document. No question is asked.
5. **Zones in edit mode: all three are always shown.**
   - They are labelled areas: "Header", "Repeated for each item" and "Footer".
   - A header or footer that doesn't exist is created empty for the session and shows a "click to add" placeholder.
   - A header or footer still empty on Done is dropped. The body is never dropped.
6. **Fields show as placeholders** in edit mode (`{key}`), not values.

## Components

### Editing session: `packages/editor/src/react/inlineEditing.ts`

One session per open block. It:
- creates the nested `EditorView` inside the node view's DOM, with the editor's schema, plugins (history, keymaps, gap cursor, table editing; **no pagination**) and node views (`showExpressions: true`);
- owns the bar: a DOM element built by the node view, with labels from `EditorLabels`;
- exposes `done()` and `cancel()`, and calls back into `DocumentEditor` to commit.

### What the nested editor holds

- **Repeating block:** the nested document is the `repeat` node itself, used as the nested state's `doc`, as in the footnote example. Missing header or footer zones are first added, each holding one empty paragraph.
- **Embedded template:** the nested document is the template's `doc` from the current resolution (`resolution.templates.get(id).doc`).

### Commit on Done

- **Repeating block:**
  - Drop a header or footer whose content is a single empty paragraph.
  - Replace the outer node at its position (`tr.replaceWith(pos, pos + node.nodeSize, newRepeat)`) in one transaction. One undo reverts it.
  - Re-select the block (NodeSelection).
- **Template, shared:**
  - Call `await provider.saveTemplate(id, docJSON)`. On success, clear the resolver's template cache and re-resolve the document.
  - On failure, keep the editing area open and show `labels.inlineEditing.saveFailed` in the bar (`role="alert"`).
- **Template, copy:**
  - Replace the `template_ref` with the blocks of every page of the template, in one transaction. Pagination reflows them.
  - Fields stay fields and are resolved against the document.

### Nested blocks

A repeating block or template inside the editing area is still an atom. It can be opened from within the nested editor, one level at a time: the inner session's commit writes into the nested editor, not the main one. Each session is bounded by its own atom; nothing new is needed for cycles, since content is never expanded while editing.

### Active editor (`DocumentEditor`)

- **Tracking:** it holds `activeView` (the main view, or the innermost open session's view).
- **Toolbar:** it receives `activeView`'s state and a `run` that targets `activeView`, so marks, block style, alignment, tables, fields, images and templates all act inside the editing area.
- **Fields:** while a repeating block is being edited, "Insert field" adds one group per enclosing repeat source, innermost first. Each group is named after the source's label (from `listRepeatSources`) and lists its item fields from `Resolution.shapes` and the source descriptors. Document fields stay offered.
- **`getDocument()`, `onChange` and `onEdit`:** they only ever see the main document, and change on commit only.
- **Undo:** the nested editor has its own history; Mod-Z there undoes inside the block. After commit, the main history holds one step.

### Entering

- **Mouse:** double-click on a `repeat` or `template_ref` atom (node view `dblclick`).
- **Keyboard:** Enter while the block is node-selected, through a keymap command in the main editor.
- **Focus:** it moves to the nested editor, at the start of the body or of the template.
- **Read-only:** no entry (`readOnly`), and the bar is never shown.
- **One block at a time:** only one session is open per level. Entering another block in the main editor first cancels the open session (user decision 2: Cancel discards).

### Leaving

- **Done:** commits (with the template question first).
- **Cancel or Escape:** destroys the nested view; nothing reaches the main document.
- **Focus:** in both cases, focus returns to the main editor (or the parent session) with the block node-selected.

## Provider API

```ts
interface EditorDataProvider {
  // Saves an embedded template edited in place ("update the shared template"). Absent: only a copy is offered.
  saveTemplate?(id: string, content: unknown): MaybePromise<void>
}
```

## Labels (`EditorLabels`, English defaults; the demo adds fr and nl)

```
inlineEditing: {
  editRepeat: (source: string) => string        // bar title, e.g. "Repeating block: Sessions"
  editTemplate: (name: string) => string        // "Template: Signature"
  done, cancel, keepEditing,
  updateShared, makeCopy,                       // the template question
  header, body, footer,                         // zone captions in edit mode: "Header", "Repeated for each item", "Footer"
  addHeader, addFooter,                         // placeholders of empty zones
  saveFailed,
  hint                                          // the bar's description: how to leave (Escape cancels)
}
```

## Styling

Use `--ie-*` custom properties only:
- the editing area's outline and background;
- the bar;
- the zone captions and dashed separators;
- the placeholder text.

The bar's controls are 44 px targets by default, as elsewhere.

## Accessibility

- **The editing area:** a labelled `role="group"`, named after the bar title. The nested editor is a `role="textbox"` with `aria-multiline` and an `aria-label` from the bar title.
- **The bar:** its buttons have visible text as their accessible name. The hint is linked by `aria-describedby`.
- **Interactions:** double-click has a keyboard equivalent (Enter), and nothing is hover-only or drag-only.

## Security

These invariants are unchanged:
- **Edited content passes the schema:** the nested editor uses the same schema, and pasted HTML goes through the same parser.
- **`saveTemplate` receives ProseMirror JSON** of the editor's schema, never HTML.

## Testing

- **Unit (vitest + jsdom, `test/inlineEditing.test.tsx`):**
  - double-click and Enter open the session; Escape and Cancel discard;
  - Done on a repeat writes zones back, drops an empty header or footer, and undoes in one step;
  - template shared calls `saveTemplate` and re-resolves; template copy inlines the blocks; no `saveTemplate` offers only copy; a save failure keeps the session open with the alert;
  - the toolbar acts on the nested editor;
  - "Insert field" lists item-field groups while editing a repeat;
  - read-only allows no entry;
  - `onEdit` fires only on commit.
- **e2e (Playwright, `apps/demo/e2e/inline-editing.spec.ts`; the demo provider gains an in-memory `saveTemplate`):**
  - edit the invoice table's body row by keyboard only;
  - add a footer to the welcome letter's events block;
  - edit the signature template and choose copy;
  - edit it again and choose shared, checking that another document embedding it changes;
  - selectors use the label objects.

## Out of scope

- Editing several blocks at once.
- Collaborative editing.
- Turning a copied template back into a reference.
