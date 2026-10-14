# Inline editing of repeating blocks and embedded templates: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeating block or an embedded template can be opened in place (double-click, or Enter on the selected block), edited in a nested ProseMirror editor showing its zones and fields as placeholders, and left with Done (commit; for a template: update the shared template or make a copy) or Cancel / Escape (discard).

**Architecture:** One `EditingLevel` per editor view (the main view, and each nested view) owns at most one open `InlineSession`. The level's ProseMirror plugin keeps a node decoration on the block being edited; the repeat and embed node views read it and adopt the session's DOM (bar + nested `EditorView`), so a redraw of the outer node views never loses the session. `DocumentEditor` follows the innermost open session (the "active view") for the toolbar, and the main document only changes on commit.

**Tech Stack:** TypeScript strict, React 19, ProseMirror (state, view, history, keymap, tables, gapcursor), vitest + jsdom + Testing Library, Playwright (Chromium), bun workspaces.

**Spec:** `docs/superpowers/specs/2026-10-14-inline-zone-editing-design.md` (binding). Decisions taken during implementation: `docs/superpowers/plans/2026-10-14-inline-zone-editing-decisions.md`.

## Global Constraints

- `import type` for types (`verbatimModuleSyntax`), no unused locals or parameters, English identifiers.
- No user-facing string in the library outside `EditorLabels` (English defaults); the demo adds fr and nl for every new key.
- Styling only through `--ie-*` custom properties declared with defaults on `.ie-editor` (and in both dark-mode blocks when they hold a colour).
- Every control has an accessible name equal to its visible text or an `aria-label`; 44 px targets (`.ie-button`); no hover-only or drag-only interaction (double-click has Enter as its keyboard equivalent).
- Security: the nested editor uses `editorSchema` (pasted HTML goes through the same parser); `saveTemplate` receives `doc.toJSON()` (ProseMirror JSON), never HTML; values stay text nodes.
- `getDocument()`, `onChange`, `onEdit` see the main document only, and change on commit only.
- e2e selectors use `DEFAULT_LABELS` / the demo label sets, never literals.
- Commit with `timeout 120 git commit`, staging explicit paths (never `git add -A`: `.idea/` is untracked).

## Review Focus

1. **The outer node views are rebuilt while a block is open** (resolution arrives, "Show expressions" toggled, labels change): the editing area and its unsaved edits must survive. Test in Task 3 ("keeps the editing area when the document is re-resolved").
2. **Pagination while a block is open**: a reflow would delete and reinsert the block and lose the session. Reflow is suspended while a session is open, and the hosting page grows instead of clipping (Task 3 test on `editingTarget`, CSS in Task 6).
3. **Events inside the editing area reaching the outer editor** (Enter, Tab, Escape in a nested-in-nested area): the outer node view must stop them, and Escape must cancel only the innermost area. Test in Task 3 (nested block: Escape closes the inner one only).
4. **Done twice / one undo**: history merges transactions within 500 ms, so the commit is wrapped in `closeHistory`; one Mod-Z reverts the whole commit. Test in Task 3.
5. **The main document edited while a block is open**: the main view is made non-editable while a session is open, so the stored position stays valid. Test in Task 3 (main canvas reports `contenteditable="false"` while open).

---

## File structure

- Create `packages/editor/src/editing.ts`: the editing-state plugin (`editingKey`, node decoration on the open block, `editingTarget(state)`), pure zone helpers (`withAllZones`, `dropEmptyZones`, `templateBlocks`), and `setRowZone` / `bodyTableRow`. No DOM.
- Create `packages/editor/src/react/inlineEditing.ts`: `EditingHost`, `EditingLevel`, `InlineSession` (nested view, bar, done / cancel / question), `editorPlugins`.
- Modify `packages/editor/src/react/nodeViews.ts`: repeat and embed views adopt an open session, `dblclick` opens, `stopEvent`; zone node views (captions, placeholders) for nested editors.
- Modify `packages/editor/src/react/DocumentEditor.tsx`: main `EditingLevel`, active view, freeze of the main view, toolbar inputs, handle `activeView`.
- Modify `packages/editor/src/react/Toolbar.tsx`: row-zone actions in the Table menu.
- Modify `packages/editor/src/pagination.ts`: no reflow while editing.
- Modify `packages/editor/src/labels.ts`, `src/context.ts`, `src/index.ts`, `src/styles/editor.css`, `README.md`.
- Tests: `packages/editor/test/editing.test.ts` (pure), `packages/editor/test/inlineEditing.test.tsx` (component).
- Demo: `apps/demo/src/fakeContext.ts` (template store + `saveTemplate`), `apps/demo/src/App.tsx` (opens the stored version), `apps/demo/src/samples/templates.ts` (programme embeds the signature), `apps/demo/src/labels/{fr,nl}.ts`, `apps/demo/e2e/inline-editing.spec.ts`.

---

### Task 1: Labels and the `saveTemplate` provider method

**Files:**
- Modify: `packages/editor/src/labels.ts`, `packages/editor/src/context.ts`, `packages/editor/src/index.ts`
- Modify: `apps/demo/src/labels/fr.ts`, `apps/demo/src/labels/nl.ts`
- Test: `packages/editor/test/labels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // labels.ts
  export interface InlineEditingLabels {
    readonly editRepeat: (source: string) => string   // "Repeating block: Sessions"
    readonly editTemplate: (name: string) => string   // "Template: Signature"
    readonly done: string; readonly cancel: string; readonly keepEditing: string
    readonly question: string                         // names the group of the template question
    readonly updateShared: string; readonly makeCopy: string
    readonly header: string; readonly body: string; readonly footer: string
    readonly addHeader: string; readonly addFooter: string
    readonly saveFailed: string
    readonly hint: string
  }
  EditorLabels.inlineEditing: InlineEditingLabels
  EditorLabels.rowZone: Readonly<Record<RowZone, string>>   // Table menu: make the row a header / repeated / footer row
  // context.ts
  EditorDataProvider.saveTemplate?(id: string, content: unknown): MaybePromise<void>
  ```

- [ ] **Step 1: failing test** in `labels.test.ts`:
  ```ts
  it('merges the inline-editing labels one level deep, functions included', () => {
    const labels = mergeLabels({ inlineEditing: { done: 'Terminé', editRepeat: (s) => `Bloc : ${s}` }, rowZone: { header: 'En-tête' } })
    expect(labels.inlineEditing.done).toBe('Terminé')
    expect(labels.inlineEditing.editRepeat('Sessions')).toBe('Bloc : Sessions')
    expect(labels.inlineEditing.cancel).toBe(DEFAULT_LABELS.inlineEditing.cancel)
    expect(labels.rowZone).toEqual({ ...DEFAULT_LABELS.rowZone, header: 'En-tête' })
  })
  ```
- [ ] **Step 2:** `bun run test` → FAIL (type and value missing).
- [ ] **Step 3:** add the interface and English defaults:
  `editRepeat: (s) => \`Repeating block: ${s}\``, `editTemplate: (n) => \`Template: ${n}\``, `done: 'Done'`, `cancel: 'Cancel'`, `keepEditing: 'Keep editing'`, `question: 'Where should these changes go?'`, `updateShared: 'Update the shared template'`, `makeCopy: 'Make a copy for this document'`, `header: 'Header'`, `body: 'Repeated for each item'`, `footer: 'Footer'`, `addHeader: 'Click to add a header'`, `addFooter: 'Click to add a footer'`, `saveFailed: 'The template could not be saved.'`, `hint: 'Escape cancels; Ctrl+Enter (⌘+Enter) applies the changes.'`; `rowZone: { header: 'Make it a header row', body: 'Make it a repeated row', footer: 'Make it a footer row' }`. Add `saveTemplate?` with its comment to `EditorDataProvider`; export `InlineEditingLabels` from `index.ts`. Add fr and nl translations to the demo label sets.
- [ ] **Step 4:** `bun run typecheck && bun run test` → PASS.
- [ ] **Step 5:** commit `feat(labels): inline-editing labels and the optional saveTemplate provider method`.

### Task 2: Pure helpers: zones, template blocks, row zones, editing state

**Files:**
- Create: `packages/editor/src/editing.ts`
- Modify: `packages/editor/src/pagination.ts` (no reflow while `editingTarget(view.state) !== null`)
- Test: `packages/editor/test/editing.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const editingKey: PluginKey<DecorationSet>
  export interface EditingMeta { readonly open?: { readonly pos: number; readonly session: unknown }; readonly close?: true }
  export function editingPlugin(): Plugin<DecorationSet>          // node decoration { class: 'ie-editing' }, spec { ieSession }
  export function editingTarget(state: EditorState): { readonly pos: number; readonly session: unknown } | null
  export function withAllZones(repeat: ProseNode): ProseNode      // adds an empty header / footer (one empty paragraph)
  export function dropEmptyZones(repeat: ProseNode): ProseNode    // drops a header / footer holding one empty paragraph
  export function templateBlocks(doc: ProseNode): ProseNode[]     // the blocks of every page
  export function bodyTableRow(state: EditorState): { readonly pos: number; readonly node: ProseNode } | null
  export function setRowZone(zone: RowZone): Command              // false outside a repeat body's single table
  ```

- [ ] **Step 1: failing tests** (`editing.test.ts`):
  ```ts
  const node = (json: object) => editorSchema.nodeFromJSON(json)
  it('adds the missing header and footer, each one empty paragraph, and drops them again when left empty', () => {
    const block = node(repeat('list.items', paragraph(field('item.name'))))
    const all = withAllZones(block)
    expect(all.content.content.map((z) => z.type.name)).toEqual(['repeat_header', 'repeat_body', 'repeat_footer'])
    expect(all.child(0).textContent).toBe('')
    expect(dropEmptyZones(all).eq(block)).toBe(true)
  })
  it('keeps a header or footer with content, and never drops the body', () => { … zoned with footer text survives; an empty body stays })
  it('lists the blocks of every page of a template', () => { templateBlocks(doc(page(paragraph(text('A'))), page(paragraph(text('B'))))) texts → ['A','B'] })
  it('makes the row under the cursor a header, footer or body row, only in a repeat body table', () => {
    // a state whose doc is a repeat with a body table; cursor in the second row
    expect(setRowZone('footer')(state, (tr) => (state = state.apply(tr)))).toBe(true)
    expect(bodyTableRow(state)!.node.attrs.zone).toBe('footer')
    // a table in a page (not a repeat body) → false
  })
  it('marks the block being edited and keeps its position', () => { open meta → editingTarget(state).pos; close meta → null })
  ```
- [ ] **Step 2:** `bun run test` → FAIL (module missing).
- [ ] **Step 3:** implement `editing.ts` (plugin state: `DecorationSet`; `apply(tr, set)`: `close` → empty, `open` → `DecorationSet.create(tr.doc, [Decoration.node(pos, pos + size, { class: 'ie-editing' }, { ieSession: session })])`, else `set.map(tr.mapping, tr.doc)`; `props.decorations` returns it). `bodyTableRow` walks `$from` up to a `table_row` whose table's parent is a `repeat_body` with `bodyTable(...)` equal to that table. `setRowZone` uses `tr.setNodeAttribute(pos, 'zone', zone)`. In `pagination.ts`, `reflow` returns at once when `editingTarget(view.state)` is not null.
- [ ] **Step 4:** `bun run typecheck && bun run test` → PASS.
- [ ] **Step 5:** commit `feat(editor): editing state and zone helpers for inline editing`.

### Task 3: Inline session for repeating blocks (enter, Escape / Cancel, Done)

**Files:**
- Create: `packages/editor/src/react/inlineEditing.ts`
- Modify: `packages/editor/src/react/nodeViews.ts`, `packages/editor/src/react/DocumentEditor.tsx`
- Test: `packages/editor/test/inlineEditing.test.tsx`

**Interfaces:**
- Consumes: Task 1 labels, Task 2 `editingPlugin`, `editingTarget`, `editingKey`, `withAllZones`, `dropEmptyZones`.
- Produces:
  ```ts
  export interface EditingHost {
    labels(): EditorLabels
    resolution(): Resolution
    sourceLabel(source: string): string
    saveTemplate(): ((id: string, content: unknown) => MaybePromise<void>) | null
    templateSaved(): void   // forget the cached templates and resolve again
    changed(): void         // a session opened, closed, or its editor changed: React re-renders
  }
  export class EditingLevel {
    constructor(host: EditingHost, parent: InlineSession | null)
    view: EditorView | null
    session: InlineSession | null
    enabled: boolean                       // false when read-only
    plugins(): Plugin[]                    // editingPlugin + keymap { Enter: open the node-selected block }
    open(pos: number): boolean             // cancels the open session first
    adopt(decorations: readonly Decoration[]): InlineSession | null
    innermost(): InlineSession | null
    closeAll(): void
  }
  export class InlineSession {
    readonly kind: 'repeat' | 'template'; readonly key: string   // source or template id
    readonly dom: HTMLElement; readonly view: EditorView; readonly level: EditingLevel
    done(): Promise<void>; cancel(): void
  }
  export function editorPlugins(level: EditingLevel, extra: { paginate: boolean; keys?: Record<string, Command> }): Plugin[]
  // DocumentEditorHandle gains: readonly activeView: EditorView | null
  // ViewInputs gains: readonly editing: EditingLevel | null; readonly zones?: boolean
  ```

- [ ] **Step 1: failing tests** (`inlineEditing.test.tsx`), using the provider of `DocumentEditor.test.tsx`:
  - *double-click opens; Escape discards*: `user.dblClick(block)` → `getByRole('group', { name: L.inlineEditing.editRepeat('Items') })`, a textbox of the same name, the three zone groups (`header`, `body`, `footer`) and the add placeholders; the main canvas is `contenteditable="false"`; insert text in `handle.activeView` → `{Escape}` → group gone, document unchanged, `onEdit` not called, block node-selected.
  - *Enter on the selected block opens, Cancel discards.*
  - *Done writes the zones back, drops the empty header, keeps the footer typed in; one undo reverts it*: open, put text in the footer via `activeView` (TextSelection in the footer paragraph + `insertText`), click Done → `getDocument()` has `repeat_body` + `repeat_footer` with the text and no header; `onEdit` called once; `Mod-z` on the main view → the original block.
  - *keeps the editing area when the document is re-resolved*: open, insert text, `handle.refresh()` → after the new resolution, the group and its text are still there.
  - *a block inside the editing area opens one level at a time; Escape closes the inner one only.*
  - *read-only: no entry* (dblclick and Enter do nothing).
  - *Mod-Enter applies*.
- [ ] **Step 2:** `bun run test` → FAIL.
- [ ] **Step 3: implement.**
  - `inlineEditing.ts`: the session builds `dom` = `div.ie-inline[role=group][aria-label=title][aria-describedby=hintId]` holding `div.ie-inline-bar` (title, hint with `id`, `div[role=alert]` for errors, action buttons `button.ie-button`) and `div.ie-inline-editor` mounted as the nested `EditorView` (`{ mount }`), with state `EditorState.create({ doc, plugins: editorPlugins(this.level, { paginate: false, keys: { Escape: cancel, 'Mod-Enter': done } }) })`, attributes `role=textbox`, `aria-multiline`, `aria-label` = title, `aria-describedby` = hint, class `ie-inline-canvas`, editable `() => !this.level.session`, node views `nodeViews({ resolution, showExpressions: true, labels, editing: this.level, zones: true })`, `dispatchTransaction` → apply, `host.changed()`. A `keydown` listener on `dom` handles Escape (`stopPropagation`) so a focused bar button cancels too.
  - Repeat doc: `withAllZones(node)`; focus at `Selection.findFrom(doc.resolve(bodyStart), 1)`.
  - `done()` for a repeat: `dropEmptyZones(nested doc)`; parent `tr.replaceWith(pos, pos + old.nodeSize, next)` (skipped when equal), `setSelection(NodeSelection.create(tr.doc, pos))`, `setMeta(editingKey, { close: true })`, `closeHistory(tr)`; set `level.session = null` before dispatching, destroy the nested view, focus the parent view, `host.changed()`.
  - `cancel()`: same without the replace.
  - `EditingLevel.open(pos)`: only `repeat` / `template_ref` (a template only when resolved); cancels the current session; creates the session; dispatches the `open` meta; focuses the nested view.
  - Plugin view of `editingPlugin` per level: when the decoration disappears while `level.session` is set, the session is discarded.
  - `nodeViews.ts`: repeat and embed views take `(node, view, getPos, decorations)`. If `inputs.editing?.adopt(decorations)` returns a session: `dom` = new wrapper (`div.ie-repeat` / `div.ie-embed`) holding `session.dom`; `stopEvent: (e) => session.dom.contains(e.target)`, `ignoreMutation: () => true`. Else the drawn block plus a `dblclick` listener (`preventDefault`, `stopPropagation`, `editing.open(getPos())`) when `editing?.enabled`. With `zones: true`, `repeat_header` / `repeat_body` / `repeat_footer` get a node view: `div.ie-zone[data-zone][role=group][aria-label=caption]`, a `contenteditable=false` `aria-hidden` caption, a `contentDOM` with `data-placeholder` (`addHeader` / `addFooter`), `data-empty` set when the zone is one empty paragraph (updated in `update`).
  - `DocumentEditor.tsx`: the host (ref holding the latest labels, resolution, provider, offers), `mainLevel` (one per mount), `createState` via `editorPlugins(mainLevel, { paginate: true })`, `editable: () => !readOnly && !mainLevel.session`, node views `editing: readOnly ? null : mainLevel`; read-only and unmount close every session; a re-resolution sets the new node views on open nested views too. Handle: `activeView`.
- [ ] **Step 4:** `bun run typecheck && bun run test` → PASS.
- [ ] **Step 5:** commit `feat(editor): edit a repeating block in place`.

### Task 4: Embedded template: the Done question (shared, copy, keep editing)

**Files:**
- Modify: `packages/editor/src/react/inlineEditing.ts`
- Test: `packages/editor/test/inlineEditing.test.tsx`

**Interfaces:**
- Consumes: Task 3 `InlineSession`, `EditingHost.saveTemplate()`, `EditingHost.templateSaved()`; Task 2 `templateBlocks`.

- [ ] **Step 1: failing tests:**
  - *shared*: provider with `saveTemplate = vi.fn()` and a `loadTemplate` reading a mutable store; open the signature, insert text, Done → group `L.inlineEditing.question` with the three buttons → `updateShared` → `saveTemplate` called with `('signature', json)` where `json.type === 'doc'`; the embed then shows the new text (re-resolved); the main document is unchanged.
  - *copy*: Done → `makeCopy` → no `template_ref` left; the template's paragraphs are in the document; `onEdit` once.
  - *no saveTemplate*: only `makeCopy` and `keepEditing` are offered.
  - *failure*: `saveTemplate` rejects → `role=alert` with `saveFailed`; the editing area stays open.
  - *keep editing*: back to the editor, still open.
  - *unchanged template*: Done closes without asking.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implement:** the bar swaps its actions for a `role=group` named `question` holding `updateShared` (only with `saveTemplate`), `makeCopy`, `keepEditing`; focus moves to the first. Shared: buttons disabled while saving; `await save(id, doc.toJSON())`, then close and `host.templateSaved()`; on failure show the alert and stay in the question. Copy: parent `tr.replaceWith(pos, pos + 1, Fragment.fromArray(templateBlocks(doc)))`, `closeHistory`, selection near `pos`, close. The template doc: `host.resolution().templates.get(id)!.doc`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat(editor): edit an embedded template in place: update it or make a copy`.

### Task 5: The toolbar acts on the active editor; item fields; row zones

**Files:**
- Modify: `packages/editor/src/react/DocumentEditor.tsx`, `packages/editor/src/react/Toolbar.tsx`
- Test: `packages/editor/test/inlineEditing.test.tsx`

**Interfaces:**
- Consumes: `EditingLevel.innermost()`, `InlineSession.kind/key/level.parent`, Task 2 `setRowZone`, `bodyTableRow`; Task 1 `labels.rowZone`.
- Produces: `ToolbarProps.rowZones: boolean` (shows the three row-zone actions in the Table menu), `ToolbarProps.rowZoneCommand: (zone: RowZone) => Command`.

- [ ] **Step 1: failing tests:**
  - *toolbar on the nested editor*: open a block, Bold / Insert field act inside it (the nested document gets the field; the main document does not until Done).
  - *Insert field lists item fields*: while editing `list.items`, the menu has a group named `Items` with `Name` before the document groups; inserting it then Done puts `item.name` in the body.
  - *row zones*: open a block whose body is a table, cursor in the item row → Table menu offers `rowZone.header/body/footer`; "footer" → the row has `data-zone="footer"` in the editing area; Done → the row's `zone` is `footer` in the document. Not offered on a plain table.
  - *Insert template excludes the template being edited.*
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implement:** `activeView()` = innermost session's view ?? main view; `run`, `placeImage`, the image panel, `selectedKey` and the toolbar `state` use it (main `state` stays for the main view). Field groups: for each open repeat session, innermost first, a group named `host.sourceLabel(source)` listing the descriptor's `itemFields` (searched through nested `itemRepeats`) plus the shape's other item fields (label = key), then the provider's fields. Templates: minus the ids of open template sessions. Table menu: base actions + the three zone actions when `bodyTableRow(activeState)`.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat(editor): toolbar, item fields and row zones inside an editing area`.

### Task 6: Styles

**Files:** `packages/editor/src/styles/editor.css`

- [ ] Tokens on `.ie-editor` (and dark blocks where a colour): `--ie-editing-outline`, `--ie-editing-surface`, `--ie-bar-surface`, `--ie-zone-caption-ink`, `--ie-zone-separator`, `--ie-placeholder-ink`, `--ie-zone-header-fill`, `--ie-zone-footer-fill`.
- [ ] Rules: `.ie-canvas .ie-page:has(.ie-editing)` → `overflow: visible`; `.ie-inline` outline + surface; `.ie-inline-bar` flex/wrap with `.ie-button` targets; `.ie-zone` dashed separators and caption; `.ie-zone[data-empty] > .ie-zone-content::before` placeholder; `tr[data-zone='header'|'footer']` fills plus a double rule (not colour alone); nested pages (`.ie-inline-canvas .ie-page`) lose the sheet look; print hides the bar.
- [ ] `bun run typecheck && bun run test`; commit `style(editor): editing area, bar, zones and row zones`.

### Task 7: Demo store, `saveTemplate`, e2e

**Files:**
- Modify: `apps/demo/src/fakeContext.ts`, `apps/demo/src/App.tsx`, `apps/demo/src/samples/templates.ts`
- Create: `apps/demo/e2e/inline-editing.spec.ts`

- [ ] **Step 1: failing e2e** (`inline-editing.spec.ts`), selectors from `L.inlineEditing`, `APP`:
  - invoice, keyboard only: click the empty paragraph above the block, ArrowDown selects it, Enter opens, Tab ×3 to the item row's first cell, type ` (x)`, `Control+Enter` → each of the three item rows ends its description with ` (x)`.
  - welcome letter: double-click the events block, click the footer placeholder, type `See you there!`, Done → the block's last line is `See you there!`.
  - signature: double-click, type, Done, Make a copy → no `.ie-embed[data-template="signature"]`, the text in the canvas.
  - signature shared: double-click, type, Done, Update the shared template → the embed shows it; navigate (nav link) to the programme → its signature shows it.
- [ ] **Step 2:** `bun run test:e2e` → FAIL.
- [ ] **Step 3:** module-level `templateStore` seeded from `SAMPLE_TEMPLATES` content; `loadTemplate` reads it; `saveTemplate(id, content)` stores it when `isEditorDocument(content)` and the id is known, else throws. `App` opens `storedTemplate(id)`; the programme embeds `signature` instead of `footer`.
- [ ] **Step 4:** `bun run typecheck && bun run test && bun run test:e2e` → PASS. **Step 5:** commit `feat(demo): in-memory saveTemplate; e2e for inline editing`.

### Task 8: README, screenshots, review

- [ ] README: interaction (double-click / Enter, bar, Escape, Ctrl+Enter, zones, row zones), `saveTemplate`, new labels, accessibility and security notes.
- [ ] Throwaway spec under `apps/demo/e2e/tmp/` for the three screenshots, then delete it.
- [ ] Self-review the diff; final `typecheck`, `test`, `test:e2e`; commit `docs: inline editing` with the decisions log.
