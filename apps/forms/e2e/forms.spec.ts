// Every form: valid against the editor's schema, opened with its fields filled and nothing left
// unresolved, previewed as HTML and downloaded as a PDF.
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { A4_PAGE, DEFAULT_LABELS, editorSchema, pdfPageOf, preparePdfmake, renderPdf, resolveDocument, toEditorDocument, toPdfContent, toPdfDefinition, type PdfmakeInstance } from '@icure/editor'
import { expect, test, type Page } from '@playwright/test'

import { FORMS } from '../src/forms/index.ts'
import { APP, EDITOR_LABELS } from '../src/labels.ts'
import { createFormsProvider, FIELD_VALUES } from '../src/provider.ts'

const canvasName = EDITOR_LABELS.canvas ?? DEFAULT_LABELS.canvas
// The fields a form uses, from its content.
const fieldsOf = (node: unknown): string[] => {
  if (!node || typeof node !== 'object') return []
  const n = node as { type?: string; attrs?: { name?: string }; content?: unknown[] }
  return [...(n.type === 'variable' && n.attrs?.name ? [n.attrs.name] : []), ...(n.content ?? []).flatMap(fieldsOf)]
}

for (const form of FORMS) {
  test.describe(form.title, () => {
    test('fits the editor schema, and every field it uses has a value', () => {
      expect(() => editorSchema.nodeFromJSON(form.content).check()).not.toThrow()
      for (const key of fieldsOf(form.content)) expect(FIELD_VALUES[key], key).toBeTruthy()
    })

    test('opens filled, previews and prints', async ({ page }) => {
      await page.goto(`/?form=${form.id}`)
      const canvas = page.getByRole('textbox', { name: canvasName })
      await expect(canvas).toBeVisible()
      const first = fieldsOf(form.content)[0]!
      await expect(canvas).toContainText(FIELD_VALUES[first]!)
      await expect(page.locator('.ie-unresolved')).toHaveCount(0)
      await page.getByRole('button', { name: APP.preview }).click()
      await expect(page.frameLocator(`iframe[title="${APP.previewTitle}"]`).locator('body')).toContainText(FIELD_VALUES[first]!)
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: APP.downloadPdf }).click()
      const bytes = await readFile(await (await download).path())
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })
  })
}

// The runs of a pdfmake definition, through its stacks and table cells.
const runsOf = (node: unknown): { text?: unknown; bold?: boolean }[] => {
  if (Array.isArray(node)) return node.flatMap(runsOf)
  if (!node || typeof node !== 'object') return []
  const n = node as { text?: unknown; stack?: unknown; table?: { body: unknown } }
  return [...(typeof n.text === 'string' ? [n as { text: string; bold?: boolean }] : []), ...runsOf(n.text), ...runsOf(n.stack), ...runsOf(n.table?.body)]
}

test('the PDF of the radiology request holds the heading of its frame as a bold run', async () => {
  const form = FORMS.find((f) => f.id === 'radiology-request')!
  const doc = toEditorDocument(form.content)
  const content = toPdfContent(doc, await resolveDocument(doc, createFormsProvider(), { rootId: form.id }), { title: form.title })
  const runs = runsOf(toPdfDefinition(content).content)
  expect(runs).toContainEqual(expect.objectContaining({ text: 'Examen demandé', bold: true }))
  expect(runs).toContainEqual(expect.objectContaining({ text: 'Médecin prescripteur', bold: true }))
})

// The PDF the app downloads for a form, as latin1 text (its object dictionaries are not compressed).
async function downloadedPdf(page: Page, id: string): Promise<string> {
  await page.goto(`/?form=${id}`)
  await expect(page.getByRole('textbox', { name: canvasName })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: APP.downloadPdf }).click()
  return (await readFile(await (await download).path())).toString('latin1')
}

// The sheets of a PDF: its `/Type /Page` objects (not the `/Pages` tree).
const pageCount = (pdf: string): number => pdf.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0

// pdfmake's Node build with its own Roboto files (the app uses the browser build and the same fonts).
const nodeRequire = createRequire(import.meta.url)
let pdfmake: PdfmakeInstance | null = null
function nodePdfmake(): PdfmakeInstance {
  if (pdfmake) return pdfmake
  const dir = join(dirname(nodeRequire.resolve('pdfmake/package.json')), 'fonts/Roboto')
  const files = Object.fromEntries(readdirSync(dir).map((name) => [name, new Uint8Array(readFileSync(join(dir, name)))]))
  pdfmake = preparePdfmake(nodeRequire('pdfmake') as PdfmakeInstance, { files, families: { Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } } })
  return pdfmake
}

// The sheets each form, as written (before the editor paginates it), prints on.
const SHEETS: Readonly<Record<string, number>> = { 'radiology-request': 1, 'imaging-request': 1, 'hip-prosthesis-order': 1, 'compression-prescription': 2 }
for (const [id, sheets] of Object.entries(SHEETS)) {
  const form = FORMS.find((f) => f.id === id)!
  test(`the PDF of ${form.title}, as written, prints on ${sheets} sheet(s)`, async () => {
    const doc = toEditorDocument(form.content)
    const content = toPdfContent(doc, await resolveDocument(doc, createFormsProvider(), { rootId: form.id }), { title: form.title, ...pdfPageOf(form.page ?? A4_PAGE) })
    const pdf = Buffer.from(await renderPdf(nodePdfmake(), toPdfDefinition(content))).toString('latin1')
    expect(pageCount(pdf)).toBe(sheets)
  })

  test(`the downloaded PDF of ${form.title} has as many sheets as the editor shows`, async ({ page }) => {
    const pdf = await downloadedPdf(page, id)
    expect(pageCount(pdf)).toBe(await page.locator('.ie-canvas .ie-page').count())
  })
}

test('the PDF of the radiology request is a landscape A4 sheet', async ({ page }) => {
  const pdf = await downloadedPdf(page, 'radiology-request')
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)!.slice(1).map(Number)
  expect(box[2]! - box[0]!).toBeCloseTo(841.89, 0)
  expect(box[3]! - box[1]!).toBeCloseTo(595.28, 0)
})
