// The demo: a template picker, the editor over a fake in-memory provider, the output (HTML preview,
// PDF download and print), a language and a theme switch. All state is in the URL.
import { documentFileName, DocumentEditor, downloadBytes, HTML_TYPE, PDF_TYPE, printPdf, resolveDocument, toHtmlDocument, type DocumentEditorHandle } from '@icure/editor'
import { useEffect, useMemo, useRef, useState } from 'react'

import { createFakeProvider, DEMO_DAY } from './fakeContext.ts'
import { LABEL_SETS, LANGUAGES } from './labels/index.ts'
import { documentPdf } from './pdf.ts'
import { SAMPLE_TEMPLATES, sampleTemplate } from './samples/templates.ts'
import { THEMES, useDemoState, type Theme } from './url.ts'

function useTheme(theme: Theme, language: string) {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    root.lang = language
  }, [theme, language])
}

export function App() {
  const [state, update] = useDemoState()
  const labels = LABEL_SETS[state.language]
  const strings = labels.app
  useTheme(state.theme, state.language)
  const provider = useMemo(() => createFakeProvider(state.language, strings), [state.language, strings])
  const template = sampleTemplate(state.template)!
  const editor = useRef<DocumentEditorHandle>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const name = strings.templateNames[template.id] ?? template.id

  // The output is resolved afresh from the document as it stands.
  const current = async () => {
    const doc = editor.current?.getDocument()
    if (!doc) return null
    return { doc, resolution: await resolveDocument(doc, provider, { rootId: template.id }) }
  }
  const showPreview = async () => {
    const out = await current()
    if (out) setPreview(toHtmlDocument(out.doc, out.resolution, { title: name, lang: state.language }))
  }
  const downloadHtml = async () => {
    const out = await current()
    if (out) downloadBytes(toHtmlDocument(out.doc, out.resolution, { title: name, lang: state.language }), documentFileName(name, DEMO_DAY, 'html'), HTML_TYPE)
  }
  const pdf = async (then: (bytes: Uint8Array) => void) => {
    setBusy(true)
    try {
      const out = await current()
      if (out) then(await documentPdf(out.doc, out.resolution, name, DEMO_DAY))
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
          <ul>
            {SAMPLE_TEMPLATES.map((t) => (
              <li key={t.id}>
                <a
                  href={`?template=${t.id}&lang=${state.language}&theme=${state.theme}`}
                  aria-current={t.id === template.id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    setPreview(null)
                    update({ template: t.id })
                  }}
                >
                  {strings.templateNames[t.id] ?? t.id}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="demo-main">
          <h2 className="demo-template-title">{name}</h2>
          {/* Keyed by template: a new template opens a new document. */}
          <DocumentEditor key={template.id} ref={editor} initial={template.content} provider={provider} documentId={template.id} labels={labels.editor} readOnly={state.readOnly} />
          <section aria-label={strings.output} className="demo-output">
            <h2>{strings.output}</h2>
            <div className="demo-actions">
              <button type="button" onClick={() => void showPreview()}>
                {strings.preview}
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
            {preview && <iframe className="demo-preview" title={strings.previewTitle} sandbox="" srcDoc={preview} />}
          </section>
        </main>
      </div>
    </div>
  )
}
