'use client'

// v27.0b.6 / .6.1: shared species picker.
//
// .6.1 root cause: the v27.0b.6 datalist implementation didn't surface
// any dropdown affordance on iOS Safari. iOS only shows datalist
// suggestions inconsistently and never with a visible "tap me to see
// options" cue. Confirmed via Chrome MCP that the datalist HTML and
// data reached the form correctly — the bug was 100% iOS Safari UI.
//
// Rebuilt as a real <select> with one option per species + a final
// "Other (type your own)" sentinel. When the user picks Other or the
// current value isn't in the kind-filtered list, the field swaps to a
// text input so they can type a custom name. Free-entry preserved;
// dropdown always visible on every platform.
//
// Single string value either way; caller doesn't have to handle modes.

import { useId } from 'react'

const OTHER_SENTINEL = '__other__'

type Props = {
  id?: string
  name: string
  value: string
  onChange: (next: string) => void
  options: { name: string; kind: 'hunting' | 'fishing' }[]
  /** Filter the picker to one kind. Undefined → both. */
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
  placeholder = 'Type a species',
  required = false,
  className = 'bb-input',
  maxLength = 120,
}: Props) {
  const generated = useId()
  const fieldId = id ?? `species-${generated}`
  const filtered = kind ? options.filter((o) => o.kind === kind) : options

  // Modes:
  //  - empty value → show select with empty placeholder option
  //  - value matches a list option → show select with that option selected
  //  - value doesn't match (free-text) → show text input
  const matchedOption = filtered.find((o) => o.name === value) ?? null
  const inOtherMode = value !== '' && !matchedOption

  function handleSelectChange(ev: React.ChangeEvent<HTMLSelectElement>) {
    const next = ev.target.value
    if (next === OTHER_SENTINEL) {
      // Switch to free-text mode by setting value to a non-empty
      // sentinel — empty string would put us back in select mode with
      // nothing selected. Use a single space so the user sees the
      // text input ready for typing.
      onChange(' ')
      return
    }
    onChange(next)
  }

  if (inOtherMode) {
    return (
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
        <input
          id={fieldId}
          name={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          className={className}
          maxLength={maxLength}
          style={{ flex: 1 }}
          autoFocus
        />
        <button
          type="button"
          onClick={() => onChange('')}
          className="bb-btn-secondary"
          style={{ flexShrink: 0 }}
          aria-label="Switch back to species list"
        >
          List
        </button>
      </div>
    )
  }

  return (
    <select
      id={fieldId}
      name={name}
      value={value}
      onChange={handleSelectChange}
      required={required}
      className={className}
    >
      <option value="">{placeholder}</option>
      {filtered.map((opt) => (
        <option key={`${opt.kind}:${opt.name}`} value={opt.name}>
          {opt.name}
        </option>
      ))}
      <option value={OTHER_SENTINEL}>Other (type your own)…</option>
    </select>
  )
}
