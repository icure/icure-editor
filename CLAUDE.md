# CLAUDE.md

Guidance for working in this repository.

## What it is

`@icure/editor` is a product-agnostic React document editor (ProseMirror): paginated pages,
toolbar, tables, fields, repeating blocks, embedded templates and images, all resolved through a
host-supplied data provider; HTML and PDF output. It must stay agnostic: no product, domain or
backend type or name in the library; the demo's own samples stay generic, and the medical forms come
from `apps/forms`. Sample data is fictitious.

## Layout

- `packages/editor` (the library)
  - `src/schema.ts`: the ProseMirror schema; the only parser of pasted HTML.
  - `src/context.ts`: the data-provider interfaces (no implementation).
  - `src/resolve.ts`: resolution of a document's references through a provider (cached, cycle and
    depth guards). `src/render.ts`: the document rendered against a resolution (pure).
  - `src/commands.ts`, `src/pagination.ts`, `src/images.ts`, `src/labels.ts`.
  - `src/output/`: HTML, PDF content, pdfmake definition, browser helpers.
  - `src/react/`: `DocumentEditor`, `Toolbar`, `Menu`, `UnresolvedChip`, `ImagePanel`, node views.
  - `src/styles/`: `index.css` (entry) and `editor.css` (only `--ie-*` custom properties).
  - `test/`: unit and component tests (vitest + jsdom).
- `apps/demo`: Vite + React test app; `src/fakeContext.ts` (in-memory provider), `src/samples/`
  (grouped in the template list; the last groups are the forms of `apps/forms`), `src/labels/`
  (en, fr, nl), `e2e/` (Playwright).
- `apps/forms`: ten real-world medical forms rebuilt as templates (fictitious data, French), with
  their own app on :5180; the demo imports them (`@icure/editor-forms/forms`, `/provider`). Their
  content is ProseMirror JSON in `apps/forms/data/<id>.json`, gitignored and never committed; the
  apps and tests run without it (no forms, their tests skip).

## Commands

```bash
bun install
bun run build       # packages/editor: bun build + tsc declarations + styles.css
bun run typecheck   # tsc in every workspace
bun run test        # vitest
bun run dev         # demo on :5179 (reads the library sources via the `source` export condition)
bun run test:e2e    # builds the library, then Playwright on Chromium
```

A change is done when typecheck, unit tests and e2e are green.

## Conventions

- TypeScript strict, ESM, `verbatimModuleSyntax` (`import type`), no unused locals or parameters.
  English identifiers, comments and test names.
- No user-facing string in the library: every label goes through `EditorLabels` with an English
  default; the host passes its own. Field, source and template names come from the provider.
- Styling through `--ie-*` custom properties with defaults; no colour or size outside them in
  `editor.css` except the defaults themselves.
- Accessibility: every control has an accessible name equal to its visible text or an
  `aria-label`; menus follow the WAI-ARIA menu-button pattern; no hover-only or drag-only
  interaction; 44 px targets by default, relaxed under `(hover: hover) and (pointer: fine)`.
- Security invariants (keep them, test them):
  - values are text nodes, never HTML; nothing is evaluated;
  - the schema accepts no link, script, raw HTML or image URL; every style value passes a closed
    pattern;
  - an image source comes only from the host's provider and passes `safeImageSrc`;
  - uploads pass `checkImageFile` (type, size, magic numbers) before the host's `upload`;
  - nested templates are bounded by cycle detection and `maxDepth`.
- Tests assert behaviour (what the user sees or what is printed), not the declaration just written.
  e2e selectors use the label objects (`DEFAULT_LABELS`, the demo's label sets), never literals.
- Dependencies: pin majors with `^`; React 19 is a peer dependency; pdfmake is optional (dev only in
  the library).
