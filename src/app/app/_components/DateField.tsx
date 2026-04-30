'use client'

import { useState, useId } from 'react'
import { Calendar } from 'lucide-react'

// v27.0a.3: date-only field with overlay pattern. The native <input type="date">
// is positioned ON TOP of the styled display layer with opacity:0 + cursor:pointer
// (NOT display:none, NOT pointer-events:none — those break iOS picker). The user's
// tap hits the real input directly, preserving the user gesture, and iOS/Android
// open the native date picker. The display layer below shows our short
// "Apr 28, 2026" format. v27.0a.2 used a button + showPicker() which iOS Safari
// refused because the hidden input had pointer-events:none — the picker only
// fires on inputs that are actually interactive at the moment of tap.
export default function DateField({
  name,
  defaultValue = '',
  required = false,
  ariaLabel,
  placeholder = 'Select date',
}: {
  name: string
  defaultValue?: string
  required?: boolean
  ariaLabel?: string
  placeholder?: string
}) {
  const id = useId()
  const [value, setValue] = useState(defaultValue)

  const display = value ? formatShort(value) : placeholder

  return (
    <div className="bb-datetime-field" style={{ position: 'relative' }}>
      {/* Visual surface — purely presentational, sits behind the input */}
      <div
        className="bb-input bb-input-iconed bb-datetime-display"
        aria-hidden="true"
      >
        <span className="bb-field-icon" aria-hidden="true">
          <Calendar size={18} />
        </span>
        <span
          className="bb-datetime-value"
          style={{
            color: value ? 'var(--color-ink)' : 'var(--color-ink-soft)',
          }}
        >
          {display}
        </span>
      </div>
      {/* Real interactive input — overlaid on top, invisible, picker fires natively on tap */}
      <input
        id={id}
        type="date"
        name={name}
        value={value}
        required={required}
        onChange={(ev) => setValue(ev.target.value)}
        aria-label={ariaLabel ?? 'Pick date'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          // Keep input interactive — DO NOT set pointer-events:none. iOS Safari
          // refuses to open the date picker on inputs that aren't interactive
          // at the moment of tap.
        }}
      />
    </div>
  )
}

// "yyyy-MM-dd" → "Apr 28, 2026"
function formatShort(dateInput: string): string {
  if (!dateInput) return ''
  const [y, m, d] = dateInput.split('-').map(Number)
  if (!y || !m || !d) return dateInput
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return dateInput
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
