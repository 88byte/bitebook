'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  IdCard, Crosshair, ScrollText, Stamp, ClipboardList,
  Wallet as WalletIcon, ShieldCheck, Award,
  PawPrint, Mountain, FileText, Calendar, Map,
} from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import {
  addWalletItemAction,
  updateWalletItemAction,
  archiveWalletItemAction,
} from '../../_lib/wallet-actions'
import type { WalletItemType } from '../../_lib/wallet-utils'

type Initial = {
  id?: string
  type: WalletItemType
  jurisdiction: 'federal' | 'state'
  identifier: string
  state: string | null
  species: string | null
  zone: string | null
  season_year: number | null
  issue_date: string | null
  valid_from: string
  valid_to: string
  notes: string | null
  archived_at: string | null
}

const TYPE_OPTIONS: { value: WalletItemType; label: string }[] = [
  { value: 'license', label: 'License' },
  { value: 'tag', label: 'Tag' },
  { value: 'permit', label: 'Permit' },
  { value: 'stamp', label: 'Stamp' },
  { value: 'harvest_report_card', label: 'Harvest report card' },
  { value: 'guide_license', label: 'Guide license' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'business_credential', label: 'Business credential' },
]

// Per-type field requirements:
// - tag / permit: species + zone shown
// - stamp / permit: photo upload nudge (v27.0a copy only — upload itself v27.0a follow-up)
// - other: just core fields
function showsSpecies(t: WalletItemType) {
  return t === 'tag' || t === 'permit' || t === 'harvest_report_card'
}
function showsZone(t: WalletItemType) {
  return t === 'tag' || t === 'permit'
}
function nudgesPhoto(t: WalletItemType) {
  return t === 'stamp' || t === 'permit'
}

export default function WalletItemForm({
  basePath,
  initial,
}: {
  basePath: '/app/h/wallet' | '/app/wallet'
  initial: Initial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<WalletItemType>(initial.type)
  const [jurisdiction, setJurisdiction] = useState<'federal' | 'state'>(initial.jurisdiction)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('type', type)
    fd.set('jurisdiction', jurisdiction)
    if (initial.id) fd.set('item_id', initial.id)

    startTransition(async () => {
      const action = initial.id ? updateWalletItemAction : addWalletItemAction
      const res = await action(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(basePath)
      router.refresh()
    })
  }

  function onArchive() {
    if (!initial.id) return
    setError(null)
    startTransition(async () => {
      const res = await archiveWalletItemAction(initial.id!)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(basePath)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* TYPE + JURISDICTION */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Basics</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="type">Type</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as WalletItemType)}
              className="bb-input"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <span className="bb-form-label">Jurisdiction</span>
            <div className="bb-segmented" role="radiogroup" aria-label="Jurisdiction">
              <label>
                <input
                  type="radio"
                  name="jurisdiction-r"
                  value="state"
                  checked={jurisdiction === 'state'}
                  onChange={() => setJurisdiction('state')}
                />
                State
              </label>
              <label>
                <input
                  type="radio"
                  name="jurisdiction-r"
                  value="federal"
                  checked={jurisdiction === 'federal'}
                  onChange={() => setJurisdiction('federal')}
                />
                Federal
              </label>
            </div>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <label className="bb-form-label" htmlFor="identifier">Identifier (number)</label>
            <label className="bb-field">
              <span className="bb-field-icon"><FileText size={18} aria-hidden="true" /></span>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                defaultValue={initial.identifier}
                placeholder="License or tag number"
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>

          {jurisdiction === 'state' && (
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="state">State</label>
              <label className="bb-field">
                <span className="bb-field-icon"><Map size={18} aria-hidden="true" /></span>
                <select
                  id="state"
                  name="state"
                  required
                  defaultValue={initial.state ?? ''}
                  className="bb-input bb-input-iconed"
                >
                  <option value="" disabled>Select a state</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </section>

      {/* SPECIES + ZONE for tag/permit/HRC */}
      {(showsSpecies(type) || showsZone(type)) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Hunt details</h2>
            <div className="bb-form-grid-2">
              {showsSpecies(type) && (
                <div className="bb-form-row">
                  <label className="bb-form-label" htmlFor="species">Species <span style={{ opacity: 0.6 }}>(optional)</span></label>
                  <label className="bb-field">
                    <span className="bb-field-icon"><PawPrint size={18} aria-hidden="true" /></span>
                    <input
                      id="species"
                      name="species"
                      type="text"
                      defaultValue={initial.species ?? ''}
                      placeholder="Black bear"
                      className="bb-input bb-input-iconed"
                      autoComplete="off"
                    />
                  </label>
                </div>
              )}
              {showsZone(type) && (
                <div className="bb-form-row">
                  <label className="bb-form-label" htmlFor="zone">Zone <span style={{ opacity: 0.6 }}>(optional)</span></label>
                  <label className="bb-field">
                    <span className="bb-field-icon"><Mountain size={18} aria-hidden="true" /></span>
                    <input
                      id="zone"
                      name="zone"
                      type="text"
                      defaultValue={initial.zone ?? ''}
                      placeholder="D6"
                      className="bb-input bb-input-iconed"
                      autoComplete="off"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* DATES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Validity</h2>
          <div className="bb-form-grid-2">
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="valid_from">Valid from</label>
              <input
                id="valid_from"
                name="valid_from"
                type="date"
                required
                defaultValue={initial.valid_from || ''}
                className="bb-input"
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="valid_to">Valid to</label>
              <input
                id="valid_to"
                name="valid_to"
                type="date"
                required
                defaultValue={initial.valid_to || ''}
                className="bb-input"
              />
            </div>
          </div>
          <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="issue_date">Issue date <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="issue_date"
                name="issue_date"
                type="date"
                defaultValue={initial.issue_date ?? ''}
                className="bb-input"
              />
            </div>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="season_year">Season year <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="season_year"
                name="season_year"
                type="number"
                min={1900}
                max={2100}
                defaultValue={initial.season_year ?? ''}
                placeholder="2026"
                className="bb-input"
              />
            </div>
          </div>
        </div>
      </section>

      {/* PHOTO NUDGE for stamps/permits + NOTES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Notes</h2>
          {nudgesPhoto(type) && (
            <p className="bb-form-help" style={{ marginBottom: '0.5rem' }}>
              Recommended: upload a photo of the physical document — wardens often check it. Upload coming in a follow-up.
            </p>
          )}
          <div className="bb-form-row">
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={initial.notes ?? ''}
              placeholder="Additional notes about this item"
              aria-label="Notes (optional)"
              className="bb-input"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Saving...' : initial.id ? 'Save changes' : 'Add wallet item'}
        </button>
        {initial.id && !initial.archived_at && (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={onArchive}
            disabled={pending}
          >
            Archive
          </button>
        )}
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => router.push(basePath)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
