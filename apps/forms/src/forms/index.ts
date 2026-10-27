// The forms of the example, in the browser: their content read by Vite from `data/*.json`.
// Node (the Playwright specs) reads them through `node.ts`, the package's `node` condition.
import { formsWith, idOfFile, type Form, type Json } from './catalogue.ts'

const files = import.meta.glob<Json>('../../data/*.json', { eager: true, import: 'default' })

export const FORMS: readonly Form[] = formsWith(Object.fromEntries(Object.entries(files).map(([path, content]) => [idOfFile(path), content])))

export const formById = (id: string): Form | undefined => FORMS.find((f) => f.id === id)
export type { Form } from './catalogue.ts'
