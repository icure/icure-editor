// The forms example: a list of forms replicated from real-world paper and office documents, the
// editor over a fictitious provider, an HTML preview and a PDF download. The form is in the URL.
import { A4_PAGE, documentFileName, DocumentEditor, downloadBytes, PDF_TYPE, resolveDocument, toHtmlDocument, type DocumentEditorHandle } from '@icure/editor'
import { useEffect, useMemo, useRef, useState } from 'react'

import { FORMS, formById } from './forms/index.ts'
import { APP, EDITOR_LABELS } from './labels.ts'
import { documentPdf } from './pdf.ts'
import { createFormsProvider, FORMS_DAY } from './provider.ts'

const currentId = (): string => new URLSearchParams(window.location.search).get('form') ?? FORMS[0]?.id ?? ''

export function App() {
  // The forms' content is not in the repository (see the README): without it, nothing to show.
  if (FORMS.length === 0)
    return (
      <div className="forms">
        <header className="forms-header">
          <div>
            <h1>{APP.title}</h1>
            <p className="forms-subtitle">{APP.noForms}</p>
          </div>
        </header>
      </div>
    )
  return <Forms />
}

function Forms() {
  const [id, setId] = useState(currentId)
  useEffect(() => {
    const onPop = () => setId(currentId())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const form = formById(id) ?? FORMS[0]!
  const page = form.page ?? A4_PAGE
  const provider = useMemo(createFormsProvider, [])
  const editor = useRef<DocumentEditorHandle>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = (next: string) => {
    setPreview(null)
    setId(next)
    window.history.pushState(null, '', `?form=${next}`)
  }
  const current = async () => {
    const doc = editor.current?.getDocument()
    return doc ? { doc, resolution: await resolveDocument(doc, provider, { rootId: form.id }) } : null
  }
  const showPreview = async () => {
    const out = await current()
    if (out) setPreview(toHtmlDocument(out.doc, out.resolution, { title: form.title, lang: 'fr', page }))
  }
  const downloadPdf = async () => {
    setBusy(true)
    try {
      const out = await current()
      if (out) downloadBytes(await documentPdf(out.doc, out.resolution, form.title, FORMS_DAY, page), documentFileName(form.title, FORMS_DAY), PDF_TYPE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="forms">
      <header className="forms-header">
        <div>
          <h1>{APP.title}</h1>
          <p className="forms-subtitle">{APP.subtitle}</p>
        </div>
      </header>
      <div className="forms-body">
        <nav aria-label={APP.forms} className="forms-nav">
          <h2>{APP.forms}</h2>
          <ul>
            {FORMS.map((f) => (
              <li key={f.id}>
                <a
                  href={`?form=${f.id}`}
                  aria-current={f.id === form.id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    choose(f.id)
                  }}
                >
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="forms-main">
          <h2 className="forms-template-title">{form.title}</h2>
          <p className="forms-subtitle">
            {APP.source} : {form.source}
          </p>
          <DocumentEditor key={form.id} ref={editor} initial={form.content} provider={provider} documentId={form.id} page={page} labels={EDITOR_LABELS} />
          <section aria-label={APP.preview} className="forms-output">
            <div className="forms-actions">
              <button type="button" aria-pressed={preview !== null} onClick={() => void showPreview()}>
                {APP.preview}
              </button>
              <button type="button" disabled={busy} onClick={() => void downloadPdf()}>
                {APP.downloadPdf}
              </button>
            </div>
            {/* The output in an empty-sandbox frame: no script, nothing from the network. */}
            {preview !== null && <iframe className="forms-preview" title={APP.previewTitle} sandbox="" srcDoc={preview} />}
          </section>
        </main>
      </div>
    </div>
  )
}
