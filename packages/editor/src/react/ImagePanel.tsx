// The selected image's properties: its description (alt text) and width, by keyboard or touch (no
// drag-only resize). One line, floating under the toolbar and the selected reference.
import type { Node as ProseNode } from 'prosemirror-model'
import { useEffect, useId, useState, type RefObject } from 'react'

import { clampImageWidth, MAX_IMAGE_WIDTH, MIN_IMAGE_WIDTH } from '../images.ts'
import type { EditorLabels } from '../labels.ts'
import { ToolButton } from './Toolbar.tsx'

// The step of the smaller / larger buttons.
const WIDTH_STEP = 40
const DEFAULT_WIDTH = 240

export interface ImagePanelProps {
  readonly node: ProseNode
  readonly labels: EditorLabels['image']
  readonly onChange: (attrs: { readonly alt?: string; readonly width?: number | null }) => void
  readonly altRef?: RefObject<HTMLInputElement | null>
}

export function ImagePanel({ node, labels, onChange, altRef }: ImagePanelProps) {
  const altId = useId()
  const altHintId = useId()
  const widthId = useId()
  const widthHintId = useId()
  const width = clampImageWidth(node.attrs.width)
  // The typed width is applied on Enter or when the field is left (each keystroke would clamp).
  const [typed, setTyped] = useState(width === null ? '' : String(width))
  useEffect(() => setTyped(width === null ? '' : String(width)), [width])
  const commit = () => onChange({ width: typed.trim() === '' ? null : clampImageWidth(typed) })
  const step = (delta: number) => onChange({ width: clampImageWidth((width ?? DEFAULT_WIDTH) + delta) })
  // One line, floating under the toolbar: each field named by its visible label beside it; the hints
  // stay with their field for assistive technology (aria-describedby), not drawn.
  return (
    <div role="group" aria-label={labels.panel} className="ie-image-panel">
      <span className="ie-image-field ie-image-alt">
        <label htmlFor={altId}>{labels.alt}</label>
        <input ref={altRef} id={altId} type="text" maxLength={500} value={String(node.attrs.alt ?? '')} aria-describedby={altHintId} onChange={(e) => onChange({ alt: e.target.value })} />
        <span id={altHintId} className="ie-visually-hidden">
          {labels.altHint}
        </span>
      </span>
      <span className="ie-image-field">
        <label htmlFor={widthId}>{labels.width}</label>
        <input
          id={widthId}
          className="ie-image-width"
          type="number"
          inputMode="numeric"
          min={MIN_IMAGE_WIDTH}
          max={MAX_IMAGE_WIDTH}
          step={WIDTH_STEP}
          value={typed}
          aria-describedby={widthHintId}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
        />
        <span id={widthHintId} className="ie-visually-hidden">
          {labels.widthHint}
        </span>
      </span>
      <div className="ie-group">
        <ToolButton label={labels.smaller} glyph="−" onPress={() => step(-WIDTH_STEP)} />
        <ToolButton label={labels.larger} glyph="+" onPress={() => step(WIDTH_STEP)} />
        <button type="button" className="ie-button" onClick={() => onChange({ width: null })} disabled={width === null}>
          {labels.naturalSize}
        </button>
      </div>
    </div>
  )
}
