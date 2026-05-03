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
  onChange,
}: {
  name: string
  defaultValue?: string
  required?: boolean
  ariaLabel?: string
  // v27.1.1.0.3e.6: optional change callback so the inline TripDetailEditor
  // can auto-save when the user picks a date. Datetime-local on iOS doesn't
  // fire a clean blur, so onChange is the reliable hook.
  onChange?: (value: string) => void
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
        onChange={(e) => {
          setValue(e.target.value)
          onChange?.(e.target.value)
        }}
        // v27.1.3.0.1: explicit showPicker() on click. The opacity:0
        // overlay receives the click on iOS (gesture preserved → native
        // picker opens) BUT on desktop Chrome / Firefox the picker only
        // fires when the user clicks specific native sub-components of
        // the date input (the dropdown arrow), which are unreachable
        // when the input is fully transparent. Calling showPicker() from
        // the click handler works on every browser that supports the
        // input type — and the user gesture is preserved because the
        // call originates inside an interactive-input click handler.
        // Wrapped in try/catch because some older browsers throw if
        // showPicker is called twice in the same tick.
        onClick={(e) => {
          try {
            ;(e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
          } catch {
            // ignore — native picker may already be open
          }
        }}
        onFocus={(e) => {
          // Belt-and-suspenders for keyboard activation: focus via Tab
          // shouldn't pop the picker, but Enter / Space on a focused
          // datetime input historically depended on user-agent. Leaving
          // focus alone — only the click handler invokes showPicker.
          void e
        }}
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
