'use client'

import { useRef, useState, useId } from 'react'
import { Calendar } from 'lucide-react'

// v27.0a.2: date-only sibling to DateTimeField. Same approach — display
// our short "Apr 28, 2026" format on a styled button + a hidden native
// `<input type="date">` behind it. Tap the button calls input.showPicker()
// (or focus+click fallback) so iOS/Android use their native date pickers.
// Side-by-side at 375px iPhone the native datetime-local locale string
// overflowed v26.5.x — same risk applies to date inputs in some locales,
// so we control rendering ourselves.
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  const display = value ? formatShort(value) : placeholder

  function openPicker() {
    const el = inputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        // fall through
      }
    }
    el.focus()
    el.click()
  }

  return (
    <div className="bb-datetime-field" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={openPicker}
        className="bb-input bb-input-iconed bb-datetime-display"
        aria-label={ariaLabel ?? 'Pick date'}
        aria-haspopup="dialog"
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
      </button>
      <input
        ref={inputRef}
        id={id}
        type="date"
        name={name}
        value={value}
        required={required}
        onChange={(ev) => setValue(ev.target.value)}
        aria-hidden="true"
        tabIndex={-1}
        className="bb-datetime-hidden"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          pointerEvents: 'none',
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
