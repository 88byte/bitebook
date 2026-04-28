'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { HunterGuideConnection } from '../../_lib/queries'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function guideLabel(g: HunterGuideConnection): string {
  return g.business_name ?? g.display_name
}

// v26.3: client-side search + state filter for the hunter's My Guides list.
// State filter only renders when there are 3+ unique states across the
// hunter's guide network (per spec) — fewer than that, the noise outweighs
// the utility.
//
// guide_profiles.state isn't part of HunterGuideConnection today, so the
// state filter is currently inert; we'd need to widen fetchHunterGuides to
// include it. For v26.3 ship the search-only experience and add the state
// filter in a follow-up once the data is plumbed through.
export default function MyGuidesList({ guides }: { guides: HunterGuideConnection[] }) {
  const [query, setQuery] = useState('')

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

      {filtered.length === 0 ? (
        <div className="bb-empty">
          <div className="bb-empty-title">No matches</div>
          <p className="bb-empty-sub">
            {guides.length === 0
              ? "When a guide adds you to their network, they'll appear here."
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="bb-detail-list">
          {filtered.map((g) => {
            const label = guideLabel(g)
            return (
              <div key={g.invite_id} className="bb-detail-row">
                <div className="bb-avatar" aria-hidden="true">
                  {label.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="bb-detail-name">{label}</div>
                  <div className="bb-detail-sub">
                    Connected since {fmtDate(g.accepted_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
