// Menu button (WAI-ARIA menu pattern): Enter, Space and the arrow keys open it on the first item,
// arrows and Home / End move, Escape closes and returns focus to the trigger, Tab leaves (no keyboard
// trap), a pointer press outside closes it. Consecutive items of one group are shown under its name.
// An item with `checked` is one of a set of choices (`menuitemradio` with `aria-checked`); consecutive
// items of one `set` form an unnamed group. A disabled item stays focusable (`aria-disabled`) and does
// nothing.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { Tooltip } from './Tooltip.tsx'

export interface MenuItem {
  readonly id: string
  readonly label: string
  readonly group?: string
  // The set of choices it belongs to, and whether it is the current one.
  readonly set?: string
  readonly checked?: boolean
  readonly disabled?: boolean
  readonly onSelect: () => void
}

interface MenuProps {
  readonly label: string
  readonly items: readonly MenuItem[]
  readonly disabled?: boolean
  // Shown in place of the label, which then names the trigger and appears in its tooltip.
  readonly icon?: ReactNode
}

interface Segment {
  readonly group: string | undefined
  readonly set: string | undefined
  readonly items: { readonly item: MenuItem; readonly index: number }[]
}

function segmentsOf(items: readonly MenuItem[]): Segment[] {
  const segments: Segment[] = []
  items.forEach((item, index) => {
    const last = segments.at(-1)
    if (last && last.group === item.group && last.set === item.set) last.items.push({ item, index })
    else segments.push({ group: item.group, set: item.set, items: [{ item, index }] })
  })
  return segments
}

export function Menu({ label, items, disabled = false, icon }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  const openAt = (index: number) => {
    setActive(index)
    setOpen(true)
  }

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt(items.length - 1)
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const last = items.length - 1
    const moves: Record<string, number> = { ArrowDown: active === last ? 0 : active + 1, ArrowUp: active === 0 ? last : active - 1, Home: 0, End: last }
    const next = moves[event.key]
    if (next !== undefined) {
      event.preventDefault()
      setActive(next)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={icon ? 'ie-button ie-tool' : 'ie-button'}
      aria-label={icon ? label : undefined}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      disabled={disabled || items.length === 0}
      // Keeps the editor's selection: the menu acts on it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => (open ? close(false) : openAt(0))}
      onKeyDown={onTriggerKeyDown}
    >
      {icon ?? label}
    </button>
  )

  return (
    <div className="ie-menu" ref={rootRef}>
      {icon ? <Tooltip text={label} suppressed={open}>{trigger}</Tooltip> : trigger}
      {open && (
        <div id={menuId} className="ie-menu-popup" role="menu" aria-label={label} onKeyDown={onMenuKeyDown}>
          {segmentsOf(items).map((segment, segmentIndex) => {
            const buttons = segment.items.map(({ item, index }) => (
              <button
                key={item.id}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                type="button"
                className="ie-menu-item"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                aria-disabled={item.disabled || undefined}
                tabIndex={index === active ? 0 : -1}
                onClick={() => {
                  if (item.disabled) return
                  close(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            ))
            return segment.group ? (
              <div key={`group-${segmentIndex}`} role="group" aria-label={segment.group} className="ie-menu-group">
                <span className="ie-menu-group-name" aria-hidden="true">
                  {segment.group}
                </span>
                {buttons}
              </div>
            ) : segment.set ? (
              <div key={`set-${segmentIndex}`} role="group" className="ie-menu-group">
                {buttons}
              </div>
            ) : (
              buttons
            )
          })}
        </div>
      )}
    </div>
  )
}
