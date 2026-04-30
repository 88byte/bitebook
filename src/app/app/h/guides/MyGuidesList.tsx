'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import NetworkPersonCard from '../../_components/NetworkPersonCard'
import type { HunterGuideConnection } from '../../_lib/queries'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function guideLabel(g: HunterGuideConnection): string {
  return g.business_name ?? g.display_name
}

// v27.0a.12: hunter's My Guides list. Search input only renders when 5+
// connections (low-volume noise threshold). Cards use the shared
// NetworkPersonCard so the visual matches the Hunters page.
export default function MyGuidesList({ guides }: { guides: HunterGuideConnection[] }) {
  const [query, setQuery] = useState('')
  const showSearch = guides.length >= 5

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return guides
    return guides.filter((g) => {
      const name = (g.display_name ?? '').toLowerCase()
      const biz = (g.business_name ?? '').toLowerCase()
      return name.includes(q) || biz.includes(q)
    })
  }, [guides, query])

  return (
    <div>
      {showSearch && (
        <label className="bb-field" style={{ marginBottom: '1rem' }}>
          <span className="bb-field-icon"><Search size={18} aria-hidden="true" /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or business"
            className="bb-input bb-input-iconed"
            aria-label="Search your guides"
          />
        </label>
      )}

      {filtered.length === 0 ? (
        <div className="bb-empty">
          <div className="bb-empty-title">
            {guides.length === 0 ? 'No guides yet' : 'No matches'}
          </div>
          <p className="bb-empty-sub">
            {guides.length === 0
              ? "When a guide adds you to their network, they'll appear here."
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((g) => {
            const label = guideLabel(g)
            return (
              <NetworkPersonCard
                key={g.invite_id}
                avatarLetter={label.slice(0, 1).toUpperCase()}
                name={label}
                sub={`Connected since ${fmtDate(g.accepted_at)}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
