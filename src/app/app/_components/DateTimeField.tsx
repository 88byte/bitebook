'use client'

import { useRef, useState, useId } from 'react'
import { Calendar } from 'lucide-react'

// v26.5.3: custom datetime field for /app/trips/new + /app/trips/[id]/edit.
// The native <input type="datetime-local"> renders its value as "MM/DD/YYYY,
// HH:MM AM" (or worse on iOS Safari where it shows "Apr 28, 2026 at 11:45 AM")
// — too long to fit in a 2-col grid cell at 375px iPhone. Flavio repeatedly
// flagged the overflow.
//
// Approach: render a styled <button> that displays our short format
// ("Apr 28, 11:45 AM") and a hidden <input type="datetime-local"> behind it.
// Tapping the button calls input.showPicker() which opens the native iOS /
// Android wheel picker. The hidden input still participates in form
// submission, so server actions read it as before — no change to
// createTripAction / updateTripAction signatures needed.
export default function DateTimeField({
  name,
  defaultValue = '',
  required = false,
  ariaLabel,
}: {
  name: string
  defaultValue?: string
  required?: boolean
  ariaLabel?: string
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  const display = value ? formatShort(value) : 'Select date & time'

  function openPicker() {
    const el = inputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        // Fall through to focus+click in browsers where showPicker is gated.
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
        aria-label={ariaLabel ?? 'Pick date and time'}
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
        type="datetime-local"
        name={name}
        value={value}
        required={required}
        onChange={(e) => setValue(e.target.value)}
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

// "yyyy-MM-ddTHH:mm" → "Apr 28, 11:45 AM"
function formatShort(localInput: string): string {
  // Parse as local time (datetime-local has no timezone). Construct via Date
  // constructor so the user's locale time is preserved.
  const [datePart, timePart] = localInput.split('T')
  if (!datePart || !timePart) return localInput
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if (!y || !m || !d || hh == null || mm == null) return localInput
  const dt = new Date(y, m - 1, d, hh, mm)
  if (Number.isNaN(dt.getTime())) return localInput
  const date = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}
