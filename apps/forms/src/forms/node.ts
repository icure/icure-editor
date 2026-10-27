// The forms of the example, in Node (the Playwright specs): their content read from `data/*.json`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { formsWith, idOfFile, type Form, type Json } from './catalogue.ts'

const DIR = fileURLToPath(new URL('../../data/', import.meta.url))
const files = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith('.json')) : []

export const FORMS: readonly Form[] = formsWith(Object.fromEntries(files.map((name) => [idOfFile(name), JSON.parse(readFileSync(DIR + name, 'utf8')) as Json])))

export const formById = (id: string): Form | undefined => FORMS.find((f) => f.id === id)
export type { Form } from './catalogue.ts'
