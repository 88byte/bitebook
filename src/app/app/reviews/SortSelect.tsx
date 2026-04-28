'use client'

import { useRouter, useSearchParams } from 'next/navigation'

// v26.0 Batch A: client-side sort dropdown for /app/reviews. URL-driven so
// it round-trips through the server component (page rerenders with the new
// sort param). Falls back to a submit button under noscript so search
// engines / no-JS clients still work.
type Option = { value: string; label: string }

export default function SortSelect({
  value,
  options,
  paramName = 'sort',
}: {
  value: string
  options: Option[]
  paramName?: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params?.toString() ?? '')
    next.set(paramName, e.target.value)
    router.push(`?${next.toString()}`)
  }

  return (
    <form method="get" style={{ margin: 0 }}>
      <label htmlFor={paramName} className="sr-only">Sort reviews</label>
      <select
        id={paramName}
        name={paramName}
        className="bb-input"
        defaultValue={value}
        onChange={onChange}
        style={{ fontSize: '0.85rem', padding: '0.4rem 0.5rem', minWidth: '11rem' }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="bb-cta-sm" style={{ marginLeft: '0.5rem' }}>Sort</button>
      </noscript>
    </form>
  )
}
