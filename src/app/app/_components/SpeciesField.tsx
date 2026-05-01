'use client'

// v27.0b.6: shared species autocomplete. A native <input> + <datalist>
// pair. Free-text is preserved (the user can type anything that isn't
// in the list — handy for outliers / invasives / regional names that
// the seed didn't capture). The datalist is filterable by the kind
// toggle on the wallet form, or pinned to trip.kind on harvest forms.
//
// Why datalist not a custom dropdown: zero JS, native filtering,
// keyboard-friendly, native on iOS + Android. Renders the suggestion
// list as you type. Free-entry comes for free since the input itself
// is the source of truth.

import { useId } from 'react'

type Props = {
  id?: string
  name: string
  value: string
  onChange: (next: string) => void
  options: { name: string; kind: 'hunting' | 'fishing' }[]
  /** Filter the datalist to one kind. Undefined → both. */
  kind?: 'hunting' | 'fishing'
  placeholder?: string
  required?: boolean
  className?: string
  maxLength?: number
}

export default function SpeciesField({
  id,
  name,
  value,
  onChange,
  options,
  kind,
  placeholder = 'Type or pick a species',
  required = false,
  className = 'bb-input',
  maxLength = 120,
}: Props) {
  const generated = useId()
  const listId = id ? `${id}-species-list` : `species-list-${generated}`
  const filtered = kind ? options.filter((o) => o.kind === kind) : options

  return (
    <>
      <input
        id={id}
        name={name}
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        className={className}
        maxLength={maxLength}
      />
      <datalist id={listId}>
        {filtered.map((opt) => (
          <option key={`${opt.kind}:${opt.name}`} value={opt.name} />
        ))}
      </datalist>
    </>
  )
}
