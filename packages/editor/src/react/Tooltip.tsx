// The name of an icon-only control, shown next to it while it is pointed at or keyboard-focused.
// The control already carries the name (`aria-label`), so the bubble is hidden from assistive
// technology. It stays while the pointer moves onto it and Escape dismisses it (WCAG 1.4.13).
import { useEffect, useState, type ReactNode } from 'react'

interface TooltipProps {
  readonly text: string
  // Set while the control shows something else in its place (an open menu).
  readonly suppressed?: boolean
  readonly children: ReactNode
}

export function Tooltip({ text, suppressed = false, children }: TooltipProps) {
  const [shown, setShown] = useState(false)

  // Escape dismisses it wherever the focus is (a hovered control need not be focused).
  useEffect(() => {
    if (!shown) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShown(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shown])

  return (
    <span
      className="ie-tip"
      onPointerEnter={() => setShown(true)}
      onPointerLeave={() => setShown(false)}
      // The toolbar's controls keep the editor's focus on a press, so only the keyboard focuses them.
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {children}
      {shown && !suppressed && (
        <span className="ie-tooltip" aria-hidden="true">
          {text}
        </span>
      )}
    </span>
  )
}
