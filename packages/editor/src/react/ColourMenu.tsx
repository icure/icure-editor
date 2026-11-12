// A colour menu of the toolbar (text colour, background): a « none » entry, named colours, then the
// colour picker as its last entry. The picker is a native colour input kept beside the menu (the
// menu holds buttons only): its choice is applied once, when confirmed, not at every move.
import { useEffect, useRef, type ReactNode } from 'react'

import { Menu, type MenuItem } from './Menu.tsx'

// The picker's starting value when nothing usable is set (it needs a #rrggbb value).
const DEFAULT_PICKER_VALUE = '#000000'
const HEX = /^#[0-9a-f]{6}$/i

export interface ColourMenuProps {
  readonly id: string
  readonly label: string
  readonly icon: ReactNode
  readonly noneLabel: string
  // Named colours: label → value.
  readonly colours: readonly (readonly [string, string])[]
  readonly customLabel: string
  // The colour set at the selection, null without one.
  readonly current: string | null
  readonly onPick: (colour: string | null) => void
}

export function ColourMenu({ id, label, icon, noneLabel, colours, customLabel, current, onPick }: ColourMenuProps) {
  const picker = useRef<HTMLInputElement>(null)
  const latest = useRef(onPick)
  useEffect(() => {
    latest.current = onPick
  })
  // `change` (not `input`): the colour is applied once the picker's choice is confirmed.
  useEffect(() => {
    const input = picker.current
    if (!input) return undefined
    const onChange = () => latest.current(input.value)
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  const named = colours.some(([, value]) => value === current)
  const items: MenuItem[] = [
    { id: `${id}-none`, label: noneLabel, set: id, checked: current === null, onSelect: () => onPick(null) },
    ...colours.map(([name, value]) => ({ id: `${id}-${value}`, label: name, set: id, checked: current === value, swatch: value, onSelect: () => onPick(value) })),
    {
      id: `${id}-custom`,
      label: customLabel,
      set: id,
      checked: current !== null && !named,
      ...(current !== null && !named ? { swatch: current } : {}),
      onSelect: () => {
        const input = picker.current
        if (!input) return
        input.value = current && HEX.test(current) ? current : DEFAULT_PICKER_VALUE
        // `showPicker` where the browser has it; a click on the (rendered) input elsewhere.
        if (typeof input.showPicker === 'function') input.showPicker()
        else input.click()
      },
    },
  ]
  return (
    <span className="ie-colour-menu">
      <Menu label={label} icon={icon} items={items} />
      {/* Reached through the menu's last entry only: no tab stop, nothing announced of its own. */}
      <input ref={picker} type="color" className="ie-colour-picker" tabIndex={-1} aria-hidden="true" defaultValue={DEFAULT_PICKER_VALUE} />
    </span>
  )
}
