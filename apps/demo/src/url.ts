// The demo's state lives in the URL (template, language, theme, read only), so every view is
// addressable and survives a reload.
import { useCallback, useEffect, useState } from 'react'

import { LANGUAGES, type Language } from './labels/index.ts'
import { DEFAULT_TEMPLATE_ID, sampleTemplate } from './samples/templates.ts'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export interface DemoState {
  readonly template: string
  readonly language: Language
  readonly theme: Theme
  readonly readOnly: boolean
}

function read(): DemoState {
  const params = new URLSearchParams(window.location.search)
  const template = params.get('template') ?? DEFAULT_TEMPLATE_ID
  const language = LANGUAGES.find((l) => l === params.get('lang')) ?? 'en'
  const theme = THEMES.find((t) => t === params.get('theme')) ?? 'system'
  return { template: sampleTemplate(template) ? template : DEFAULT_TEMPLATE_ID, language, theme, readOnly: params.get('readOnly') === '1' }
}

export function useDemoState(): [DemoState, (patch: Partial<DemoState>) => void] {
  const [state, setState] = useState(read)
  useEffect(() => {
    const onPop = () => setState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const update = useCallback((patch: Partial<DemoState>) => {
    setState((current) => {
      const next = { ...current, ...patch }
      const params = new URLSearchParams({ template: next.template, lang: next.language, theme: next.theme, ...(next.readOnly ? { readOnly: '1' } : {}) })
      window.history.pushState(null, '', `?${params}`)
      return next
    })
  }, [])
  return [state, update]
}
