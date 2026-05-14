'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import {
  listLogDocsForStateAction,
  setOutfitterDefaultLogAction,
  type LogDocOption,
} from '../upgrade-to-outfitter/actions'

// v28.1.0b.6 — Org-level default state hunt log picker for the
// Outfitter card on Settings. Owner-only (the server action enforces
// this). Save-on-change — no separate submit button, single field.
//
// Filters by the org's state so the dropdown only shows logs that
// match. Falls back to all log docs (templates + owner's library)
// when state isn't set.
export default function OutfitterDefaultLogPicker({
  orgState,
  currentDocId,
}: {
  orgState: string | null
  currentDocId: string | null
}) {
  const [docId, setDocId] = useState<string>(currentDocId ?? '')
  const [docs, setDocs] = useState<LogDocOption[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    setDocsLoading(true)
    listLogDocsForStateAction(orgState || null)
      .then((rows) => {
        if (!active) return
        setDocs(rows)
      })
      .catch(() => {
        if (!active) return
        setDocs([])
      })
      .finally(() => {
        if (active) setDocsLoading(false)
      })
    return () => { active = false }
  }, [orgState])

  function onChange(next: string) {
    setError(null)
    const previous = docId
    setDocId(next) // optimistic
    startTransition(async () => {
      try {
        const res = await setOutfitterDefaultLogAction(next || null)
        if ('error' in res) {
          setError(res.error)
          setDocId(previous) // rollback
        } else {
          setSavedAt(Date.now())
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setDocId(previous)
      }
    })
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 3500

  return (
    <div>
      <label className="bb-form-label" htmlFor="org_default_log">
        Default state hunt log
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <select
          id="org_default_log"
          className="bb-input"
          value={docId}
          onChange={(e) => onChange(e.target.value)}
          disabled={docsLoading || pending}
          style={{ flex: '1 1 0', minWidth: '12rem' }}
        >
          <option value="">{docsLoading ? 'Loading…' : 'Pick per trip'}</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}{d.state ? ` · ${d.state}` : ''}{d.is_template ? ' · Bite Book template' : ''}
            </option>
          ))}
        </select>
        {pending && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>Saving…</span>
        )}
        {showSaved && !pending && (
          <span
            className="bb-pill bb-pill-active"
            role="status"
            aria-live="polite"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <Check size={12} aria-hidden="true" />
            Saved
          </span>
        )}
      </div>
      {error && (
        <p className="bb-form-help" role="alert" style={{ marginTop: '0.4rem', color: '#A33D3D' }}>
          {error}
        </p>
      )}
      <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
        Pre-fills the log picker on new trips for this org. Override per trip as needed.
        {orgState ? '' : ' Set the org state above to filter to matching logs.'}
      </p>
    </div>
  )
}
