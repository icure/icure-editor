import { en } from './en.ts'
import { fr } from './fr.ts'
import { nl } from './nl.ts'
import type { Language, LabelSet } from './types.ts'

export const LABEL_SETS: Readonly<Record<Language, LabelSet>> = { en, fr, nl }
export { LANGUAGES, type AppStrings, type Language, type LabelSet } from './types.ts'
