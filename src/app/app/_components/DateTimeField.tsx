'use client'

import { useState, useId } from 'react'
import { Calendar } from 'lucide-react'

// v27.0a.23: overlay-input pattern (same as DateField v27.0a.3 fix). The
// real <input type="datetime-local"> sits ON TOP of the styled display
// with opacity:0 + cursor:pointer. The user's tap hits the real input
// directly, preserving the user gesture, so iOS Safari opens the picker
// natively. v26.5.3's button + showPicker() pattern broke on iOS because
// the hidden input had pointer-events:none + tabIndex=-1, which iOS
// treats as non-interactive — picker call rejected.
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
  const [value, setValue] = useState(defaultValue)

  const display = value ? formatShort(value) : 'Select date & time'

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
      {/* Real interactive input — overlaid on top, invisible. Picker fires
          natively on tap because user gesture lands on a real interactive
          input. DO NOT add pointer-events:none / tabIndex=-1 / aria-hidden
          here — iOS refuses to open the picker on inputs that aren't
          interactive at the moment of tap. */}
      <input
        id={id}
        type="datetime-local"
        name={name}
        value={value}
        required={required}
        onChange={(e) => setValue(e.target.value)}
        aria-label={ariaLabel ?? 'Pick date and time'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

// "yyyy-MM-ddTHH:mm" → "Apr 28, 11:45 AM"
function formatShort(localInput: string): string {
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
