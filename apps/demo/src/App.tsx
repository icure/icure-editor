// The demo: a template picker, the editor over a fake in-memory provider, the output (HTML preview,
// raw Markdown, HTML and PDF download, print), a language and a theme switch. All state is in the URL.
import { A4_PAGE, documentFileName, DocumentEditor, downloadBytes, HTML_TYPE, PDF_TYPE, printPdf, resolveDocument, toHtmlDocument, toMarkdown, ToolButton, type CustomizeToolbar, type DocumentEditorHandle } from '@icure/editor'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createFakeProvider, DEMO_DAY, demoDate, storedTemplate } from './fakeContext.ts'
import { LABEL_SETS, LANGUAGES } from './labels/index.ts'
import { documentPdf } from './pdf.ts'
import { SAMPLE_TEMPLATES, sampleTemplate, TEMPLATE_GROUPS, type SampleTemplate } from './samples/templates.ts'
import { THEMES, useDemoState, type Theme } from './url.ts'

function useTheme(theme: Theme, language: string) {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    root.lang = language
  }, [theme, language])
}

const templateName = (strings: { readonly templateNames: Readonly<Record<string, string>> }, t: SampleTemplate): string => strings.templateNames[t.id] ?? t.title ?? t.id

// A calendar, the demo's own toolbar icon.
const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export function App() {
  const [state, update] = useDemoState()
  const labels = LABEL_SETS[state.language]
  const strings = labels.app
  useTheme(state.theme, state.language)
  const provider = useMemo(() => createFakeProvider(state.language, strings), [state.language, strings])
  // The toolbar hook: the demo's own button, after undo and redo, inserts the demo's day as text.
  const customizeToolbar = useMemo<CustomizeToolbar>(() => {
    const date = demoDate(state.language)
    return (items, { run }) => {
      const at = items.findIndex((item) => item.id === 'redo') + 1
      const insertDate = { id: 'insertDate', render: () => <ToolButton label={strings.insertDate} glyph={<CalendarIcon />} onPress={() => run((s, dispatch) => (dispatch?.(s.tr.insertText(date)), true))} /> }
      return [...items.slice(0, at), insertDate, ...items.slice(at)]
    }
  }, [state.language, strings])
  const template = sampleTemplate(state.template)!
  const editor = useRef<DocumentEditorHandle>(null)
  // The output, shown as rendered HTML (preview) or as raw Markdown.
  const [output, setOutput] = useState<{ readonly view: 'preview' | 'markdown'; readonly text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const name = templateName(strings, template)
  const page = template.page ?? A4_PAGE

  // The output is resolved afresh from the document as it stands.
  const current = async () => {
    const doc = editor.current?.getDocument()
    if (!doc) return null
    return { doc, resolution: await resolveDocument(doc, provider, { rootId: template.id }) }
  }
  const html = async () => {
    const out = await current()
    return out ? toHtmlDocument(out.doc, out.resolution, { title: name, lang: state.language, page }) : null
  }
  const showPreview = async () => {
    const out = await html()
    if (out) setOutput({ view: 'preview', text: out })
  }
  const showMarkdown = async () => {
    const out = await current()
    if (out) setOutput({ view: 'markdown', text: toMarkdown(out.doc, out.resolution) })
  }
  const downloadHtml = async () => {
    const out = await html()
    if (out) downloadBytes(out, documentFileName(name, DEMO_DAY, 'html'), HTML_TYPE)
  }
  const pdf = async (then: (bytes: Uint8Array) => void) => {
    setBusy(true)
    try {
      const out = await current()
      if (out) then(await documentPdf(out.doc, out.resolution, name, DEMO_DAY, page))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="demo">
      <header className="demo-header">
        <div>
          <h1>{strings.title}</h1>
          <p className="demo-subtitle">{strings.subtitle}</p>
        </div>
        <div className="demo-controls">
          <label>
            <span>{strings.language}</span>
            <select value={state.language} onChange={(e) => update({ language: LANGUAGES.find((l) => l === e.target.value) ?? 'en' })}>
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{strings.theme}</span>
            <select value={state.theme} onChange={(e) => update({ theme: THEMES.find((t) => t === e.target.value) ?? 'system' })}>
              {THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {strings.themes[theme]}
                </option>
              ))}
            </select>
          </label>
          <label className="demo-check">
            <input type="checkbox" checked={state.readOnly} onChange={(e) => update({ readOnly: e.target.checked })} />
            <span>{strings.readOnly}</span>
          </label>
        </div>
      </header>
      <div className="demo-body">
        <nav aria-label={strings.templates} className="demo-nav">
          <h2>{strings.templates}</h2>
          {/* One collapsible group per kind of template; the current template's group starts open. */}
          {TEMPLATE_GROUPS.map((group) => {
            const members = SAMPLE_TEMPLATES.filter((t) => t.group === group)
            // The forms' groups are empty when their content (apps/forms/data) is missing.
            if (members.length === 0) return null
            return (
              <details key={group} className="demo-group" open={group === template.group || undefined}>
                <summary>{strings.templateGroups[group]}</summary>
                <ul>
                  {members.map((t) => (
                    <li key={t.id}>
                      <a
                        href={`?template=${t.id}&lang=${state.language}&theme=${state.theme}`}
                        aria-current={t.id === template.id ? 'page' : undefined}
                        onClick={(e) => {
                          e.preventDefault()
                          setOutput(null)
                          update({ template: t.id })
                        }}
                      >
                        {templateName(strings, t)}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </nav>
        <main className="demo-main">
          <h2 className="demo-template-title">{name}</h2>
          {/* Keyed by template: a new template opens a new document, as last saved. */}
          <DocumentEditor key={template.id} ref={editor} initial={storedTemplate(template.id) ?? template.content} provider={provider} documentId={template.id} page={page} labels={labels.editor} readOnly={state.readOnly} customizeToolbar={customizeToolbar} />
          <section aria-label={strings.output} className="demo-output">
            <h2>{strings.output}</h2>
            <div className="demo-actions">
              <button type="button" aria-pressed={output?.view === 'preview'} onClick={() => void showPreview()}>
                {strings.preview}
              </button>
              <button type="button" aria-pressed={output?.view === 'markdown'} onClick={() => void showMarkdown()}>
                {strings.markdown}
              </button>
              <button type="button" onClick={() => void downloadHtml()}>
                {strings.downloadHtml}
              </button>
              <button type="button" disabled={busy} onClick={() => void pdf((bytes) => downloadBytes(bytes, documentFileName(name, DEMO_DAY), PDF_TYPE))}>
                {strings.downloadPdf}
              </button>
              <button type="button" disabled={busy} onClick={() => void pdf((bytes) => printPdf(bytes))}>
                {strings.printPdf}
              </button>
            </div>
            {/* The output in an empty-sandbox frame: no script, nothing from the network. */}
            {output?.view === 'preview' && <iframe className="demo-preview" title={strings.previewTitle} sandbox="" srcDoc={output.text} />}
            {/* The raw Markdown, as text. */}
            {output?.view === 'markdown' && (
              <pre className="demo-markdown" role="region" aria-label={strings.markdownTitle} tabIndex={0}>
                <code>{output.text}</code>
              </pre>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
