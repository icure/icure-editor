// The toolbar's icons: inline, decorative (the control carries the name), drawn in the text colour.
import type { ReactNode } from 'react'

import type { ShownAlignment } from '../labels.ts'

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg className="ie-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
)

export const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
)

const ALIGN_LINES: Readonly<Record<ShownAlignment, readonly (readonly [number, number])[]>> = {
  left: [[3, 21], [3, 15], [3, 19], [3, 13]],
  center: [[3, 21], [6, 18], [4, 20], [7, 17]],
  right: [[3, 21], [9, 21], [5, 21], [11, 21]],
  justify: [[3, 21], [3, 21], [3, 21], [3, 21]],
}

export const AlignIcon = ({ align }: { readonly align: ShownAlignment }) => (
  <Icon>
    {ALIGN_LINES[align].map(([from, to], i) => (
      <path key={i} d={`M${from} ${5 + i * 4.67}H${to}`} />
    ))}
  </Icon>
)

export const InsertTableIcon = () => (
  <Icon>
    <path d="M13 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" />
    <path d="M3 9h18M3 15h10M9 3v18" />
    <path d="M19 16v6M16 19h6" />
  </Icon>
)

export const TableIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </Icon>
)

export const FieldIcon = () => (
  <Icon>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
    <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
  </Icon>
)

export const RepeatIcon = () => (
  <Icon>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </Icon>
)

export const TemplateIcon = () => (
  <Icon>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </Icon>
)

export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Icon>
)
