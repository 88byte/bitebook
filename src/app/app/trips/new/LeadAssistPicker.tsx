'use client'

import { useState } from 'react'

// v28.1.0f.1 Sprint 3.4b — Lead + assist guide pickers, mounted on
// /app/trips/new for outfitter members with at least one guide in
// their roster. The hidden inputs submit alongside the main form
// (form="new-trip-form") so createTripAction picks them up.
//
// Pure guides do not see this surface. Their existing single-guide
// behavior continues: the AFTER INSERT trigger writes a trip_guides
// row keyed on profile.id (lead), and setTripGuides() in the action
// makes it explicit by also defaulting lead to profile.id when no
// lead is posted.

export type RosterEntry = {
  profile_id: string
  display_name: string
}

export default function LeadAssistPicker({
  roster,
  defaultLeadId,
  formId = 'new-trip-form',
}: {
  roster: RosterEntry[]
  defaultLeadId: string
  formId?: string
}) {
  const [leadId, setLeadId] = useState<string>(defaultLeadId)
  const [assistIds, setAssistIds] = useState<Set<string>>(new Set())

  function toggleAssist(id: string) {
    setAssistIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Lead and assist cannot be the same guide.
      if (id === leadId) next.delete(id)
      return next
    })
  }

  function onLeadChange(id: string) {
    setLeadId(id)
    setAssistIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <section className="bb-tile bb-form-section" style={{ marginTop: '1rem' }}>
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Guide assignment</h2>
        <p className="bb-form-help" style={{ marginTop: 0 }}>
          Pick the lead guide running the trip. Assists are optional and can be added or removed later.
        </p>

        <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
          <label className="bb-form-label" htmlFor="lead_guide_id">Lead guide</label>
          <select
            id="lead_guide_id"
            name="lead_guide_id"
            form={formId}
            className="bb-input"
            value={leadId}
            onChange={(e) => onLeadChange(e.target.value)}
          >
            {roster.map((g) => (
              <option key={g.profile_id} value={g.profile_id}>
                {g.display_name}
              </option>
            ))}
          </select>
        </div>

        <fieldset style={{ marginTop: '0.85rem', border: 'none', padding: 0 }}>
          <legend className="bb-form-label" style={{ padding: 0, marginBottom: '0.4rem' }}>
            Assists (optional)
          </legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {roster
              .filter((g) => g.profile_id !== leadId)
              .map((g) => {
                const checked = assistIds.has(g.profile_id)
                return (
                  <label
                    key={g.profile_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.45rem 0.6rem',
                      border: '1px solid var(--color-card-divider)',
                      borderRadius: 8,
                      background: checked ? 'rgba(63, 107, 58, 0.08)' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      name="assist_guide_ids"
                      value={g.profile_id}
                      checked={checked}
                      onChange={() => toggleAssist(g.profile_id)}
                      form={formId}
                      style={{ accentColor: 'var(--color-copper)' }}
                    />
                    <span>{g.display_name}</span>
                  </label>
                )
              })}
            {roster.length <= 1 && (
              <p className="bb-form-help" style={{ margin: 0 }}>
                No assist guides available. Invite more guides to your network from /app/network.
              </p>
            )}
          </div>
        </fieldset>
      </div>
    </section>
  )
}
