# Inline zone editing: decisions taken on the user's behalf

Format: decision — why — what it costs if wrong.

## From the controller (recorded as given)

- In edit mode, a body table's row zones are visible (header and footer rows styled distinctly via `data-zone`, through `--ie-*` properties), and the Table menu gains three actions while a body table is being edited: make the current row a header row, a footer row, or a repeated row; labels in `EditorLabels` (English defaults, fr and nl in the demo) — controller ruling; it replaces the parked issue that the expressions view of a block loses its row zones (render.ts keeps stripping zones from rendered rows) — none.
- The demo provider gains an in-memory `saveTemplate` — controller ruling — none.

## Taken during planning and implementation

- The main document (or the parent editing area) is not editable while a block is open — "clicking elsewhere doesn't leave" plus "the toolbar acts on the editing area" leave nothing useful to type outside, and it keeps the block's position valid — if users want to edit the rest of the document meanwhile, the editable flag and position mapping must be revisited.
- Pagination is suspended while a block is open, and the page holding it may grow past its sheet (`overflow: visible`) — a reflow deletes and reinserts blocks, which would lose the session; reflow runs again on commit — a long editing area visually overlaps the next sheet until Done or Cancel.
- The open block is marked by a node decoration of a per-view plugin; the repeat and embed node views adopt the session's DOM from it — node views are rebuilt on every resolution, "Show expressions" or label change, and the session must survive that — none known.
- Ctrl/⌘+Enter applies (Done) in an editing area, and the hint says so — the bar sits before the editor and Tab moves between table cells, so a keyboard-only path to Done is otherwise long — one more shortcut to learn; it is optional.
- Escape cancels even when the template question is shown — spec: "Escape cancels", without exception — a user expecting Escape to only close the question loses the edit (no confirmation, per decision 2).
- Done on an embedded template whose content didn't change closes without asking — nothing to save or copy — none.
- Without `saveTemplate`, Done still asks, offering "Make a copy for this document" and "Keep editing" — the spec says only the copy is offered; asking keeps the copy explicit (it replaces the reference) — one extra click.
- A failed `saveTemplate` keeps the question visible with the alert, so the user can retry, copy or keep editing — spec: keep the editing area open with the alert — none.
- After a copy, the cursor is placed at the start of the inlined blocks (no node selection, since the reference is gone) — the spec's "block node-selected" can't apply to a block that no longer exists — none.
- An embedded template that can't be drawn (missing, cycle, too deep) can't be opened — there is no content to edit — the user must fix the reference first.
- Opening a block inside an editing area when one is already open there cancels the open one (discard), as at the top level; Done on an area whose inner area is open first discards the inner one — one session per level, Cancel discards (spec decisions 2 and "one block at a time") — unsaved inner edits are lost without a question.
- Turning read-only on, or unmounting the editor, cancels every open area — read-only allows no editing — unsaved edits are lost.
- An extra label, `inlineEditing.question` ("Where should these changes go?"), names the group of the three template buttons — a `role=group` needs a name — none.
- `DocumentEditorHandle.activeView` exposes the view the toolbar acts on (the innermost open area, else the document) — hosts with their own toolbar need it, and unit tests drive edits through it (jsdom can't type into ProseMirror) — one more public member.
- "Insert field" item-field groups: the descriptor's `itemFields` (searched through nested `itemRepeats`) first, then any other item field the resolved shape knows, labelled by its key; the group is named after the source's label, else its key — the spec names both sources — keys can show as labels for undeclared fields.
- "Insert template" leaves out the templates being edited in the open areas — inserting a template into itself would make a cycle — none.
- All three row-zone actions are always offered in a body table (including the row's current zone) — a stable menu is easier to learn and test — selecting the current zone does nothing visible.
- The demo keeps a module-level template store (seeded from the samples) that `loadTemplate` reads and `saveTemplate` writes, and opening a template from the navigation shows its stored version — the provider is recreated on language switch and the editor per template — a saved template survives navigation, not a reload.
- The programme sample embeds the signature (instead of the footer, which the signature embeds in turn) — the e2e test needs a second document embedding the signature — the programme now ends with the signature.
- The existing e2e "is one unit" now expects Enter on the selected events block to open it (and Escape to leave it unchanged) — the spec makes Enter on a node-selected block the keyboard way in — none.
- Escape is caught on the editing area's element regardless of `defaultPrevented` — ProseMirror marks Escape as handled itself — an Escape a host handles inside the area also cancels it.
- The repeat and embed node views return `update: () => false`, so they are redrawn whenever their node or decorations change — an embed is a leaf, and ProseMirror would otherwise keep its view when the editing decoration appears — a redraw of a block on unrelated attribute changes (cheap: its content is drawn from the resolution).
- An arrow at the edge of a line next to a repeating block or an embedded template selects the block whole (a keymap before the gap cursor's) — the gap cursor stepped inside a block whose body ends with a table (found by the keyboard-only invoice test), so Enter couldn't open it — one more keymap; arrows elsewhere are unchanged.
- The demo's `saveTemplate` refuses an unknown id or content that doesn't fit the schema (`isEditorDocument`) — a host should validate what it stores — none.
- Inside an editing area, an item field (declared by a known source's shape) is not styled as unresolved — it is filled per item, so the caution style was misleading (seen on the invoice screenshot) — a field misspelled as another source's item field isn't flagged while editing.
- `bodyTableRow`, `setRowZone` and `editingTarget` are exported, alongside the other toolbar commands — hosts building their own toolbar need the row-zone actions — a larger public API.
- The root `README.md` (an older copy) is left unchanged; `packages/editor/README.md` documents the feature — the package README is the one the library ships — the root copy stays behind.
- Commits: the SSH-signed commit timed out twice (Task 3 and its retry); per the brief, the remaining work is left uncommitted, staged — the user has to sign and commit it.

## After the independent review (2026-10-14)

- While the shared template is being saved, the area can't be edited, answered again or left (Done, Ctrl/⌘+Enter, Cancel and Escape do nothing); a save that succeeds after the area was closed (the editor unmounted) still resolves the templates again — otherwise a save could be followed by a copy, or a Cancel that the save contradicts — a slow host keeps the area locked until it answers.
- A discard without a transaction of its own (the block left the document) tells its view afterwards, so the view drops the block's mark and becomes editable again.
- The bar (title, hint, buttons) follows a change of labels while an area is open.
- The gap cursor is shown inside an editing area; closing an area without a change (Cancel) reflows the pages.
- Not done (minor, parked): the "item field is not unresolved" check matches any source's item fields rather than the blocks around the field; a template inserted inside an area is resolved only on Done (documented in the README).
