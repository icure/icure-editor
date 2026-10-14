// The references the data provider couldn't fill, listed with their raw expression (never left
// silently blank). A button opens the list, by tap and keyboard alike.
import { useId, useState } from 'react'

import type { UnresolvedEntry } from '../context.ts'
import { DEFAULT_LABELS, type EditorLabels } from '../labels.ts'
import { expression } from '../render.ts'

export interface UnresolvedChipProps {
  readonly entries: readonly UnresolvedEntry[]
  readonly labels?: EditorLabels['unresolved']
}

export function UnresolvedChip({ entries, labels = DEFAULT_LABELS.unresolved }: UnresolvedChipProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (entries.length === 0) return null
  return (
    <div className="ie-unresolved">
      <button type="button" className="ie-chip" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((shown) => !shown)}>
        <span aria-hidden="true" className="ie-chip-glyph">
          ▲
        </span>
        {labels.chip(entries.length)}
      </button>
      {open && (
        <section id={listId} className="ie-unresolved-list" aria-label={labels.title}>
          <h2 className="ie-unresolved-title">{labels.title}</h2>
          <ul>
            {entries.map((entry) => (
              <li key={entry.key}>
                <code className="ie-expression-text">{expression(entry.key)}</code>
                {entry.reason !== 'missing' && <span className="ie-unresolved-reason"> ({labels.reasons[entry.reason]})</span>}
              </li>
            ))}
          </ul>
          <p className="ie-hint">{labels.hint}</p>
        </section>
      )}
    </div>
  )
}
