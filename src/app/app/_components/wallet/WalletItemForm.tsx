'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PawPrint, Mountain, FileText, Map,
  Building2, ShieldCheck, GraduationCap, Briefcase,
} from 'lucide-react'
import { US_STATES } from '@/lib/us-states'
import {
  addWalletItemAction,
  updateWalletItemAction,
  archiveWalletItemAction,
  restoreWalletItemAction,
  deleteWalletItemAction,
} from '../../_lib/wallet-actions'
import type { WalletItemType, WalletJurisdiction } from '../../_lib/wallet-utils'

// Per-type fields are sourced from
// /Users/flave/Documents/Claude/Projects/Last Bite Pro/2026-04-29-wallet-fields-by-type.md
// (canonical agency reference doc). Structured columns: identifier, state,
// species, zone, season_year, issue_date, valid_from, valid_to, jurisdiction.
// Everything else is namespaced under `extras_*` form keys → wallet_items.extras jsonb.

type ExtrasShape = Record<string, string> | null

type Initial = {
  id?: string
  type: WalletItemType
  jurisdiction: WalletJurisdiction
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
  extras: ExtrasShape
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

const SHOW = {
  state: (t: WalletItemType) =>
    t === 'license' || t === 'tag' || t === 'permit' || t === 'stamp' ||
    t === 'harvest_report_card' || t === 'guide_license',
  jurisdiction: (t: WalletItemType) => t === 'permit' || t === 'stamp',
  species: (t: WalletItemType) => t === 'tag' || t === 'permit' || t === 'harvest_report_card',
  zone: (t: WalletItemType) => t === 'tag' || t === 'permit',
  seasonYear: (t: WalletItemType) =>
    t === 'tag' || t === 'permit' || t === 'harvest_report_card' ||
    t === 'license' || t === 'guide_license',
  issueDate: (t: WalletItemType) =>
    t === 'license' || t === 'guide_license' || t === 'permit' ||
    t === 'insurance' || t === 'business_credential',
  insurance: (t: WalletItemType) => t === 'insurance',
  credential: (t: WalletItemType) => t === 'business_credential',
  guideLicense: (t: WalletItemType) => t === 'guide_license',
  hunterLicense: (t: WalletItemType) => t === 'license',
  tagExtras: (t: WalletItemType) => t === 'tag',
  permitExtras: (t: WalletItemType) => t === 'permit',
  stampExtras: (t: WalletItemType) => t === 'stamp',
  hrcExtras: (t: WalletItemType) => t === 'harvest_report_card',
  photoNudge: (t: WalletItemType) => t === 'stamp' || t === 'permit',
} as const

const IDENTIFIER_LABEL: Record<WalletItemType, string> = {
  license: 'License number',
  tag: 'Tag number',
  permit: 'Permit number',
  stamp: 'Stamp identifier',
  harvest_report_card: 'Report card number',
  guide_license: 'Guide license number',
  insurance: 'Certificate number',
  business_credential: 'Credential number',
}

const IDENTIFIER_PLACEHOLDER: Record<WalletItemType, string> = {
  license: 'e.g. CA-12345',
  tag: 'e.g. D-67890',
  permit: 'e.g. P-2026-001',
  stamp: 'e.g. FED-DUCK-2026',
  harvest_report_card: 'e.g. HRC-2026',
  guide_license: 'e.g. CA-G-12345',
  insurance: 'e.g. ACORD cert # 9876',
  business_credential: 'e.g. CERT-9876',
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
  const [jurisdiction, setJurisdiction] = useState<WalletJurisdiction>(initial.jurisdiction)

  const isArchived = !!initial.archived_at
  const e = initial.extras ?? {}

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    const fd = new FormData(ev.currentTarget)
    fd.set('type', type)
    fd.set('jurisdiction', SHOW.jurisdiction(type) ? jurisdiction : 'state')
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

  function callMutation(fn: (id: string) => Promise<{ error: string } | { ok: true; id: string }>) {
    if (!initial.id) return
    setError(null)
    startTransition(async () => {
      const res = await fn(initial.id!)
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
      {/* TYPE + IDENTIFIER + STATE/JURISDICTION */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Basics</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="type">Type</label>
            <select
              id="type"
              value={type}
              onChange={(ev) => setType(ev.target.value as WalletItemType)}
              className="bb-input"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <label className="bb-form-label" htmlFor="identifier">{IDENTIFIER_LABEL[type]}</label>
            <label className="bb-field">
              <span className="bb-field-icon"><FileText size={18} aria-hidden="true" /></span>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                defaultValue={initial.identifier}
                placeholder={IDENTIFIER_PLACEHOLDER[type]}
                className="bb-input bb-input-iconed"
                autoComplete="off"
              />
            </label>
          </div>

          {SHOW.jurisdiction(type) && (
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
          )}

          {SHOW.state(type) && (jurisdiction === 'state' || !SHOW.jurisdiction(type)) && (
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="state">{type === 'guide_license' ? 'Issuing state' : 'State'}</label>
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

      {/* HUNTER LICENSE — extras: license_type_code, residency, hunter_ed_number */}
      {SHOW.hunterLicense(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">License details</h2>
            <div className="bb-form-grid-2">
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_license_type_code">License type</label>
                <input
                  id="extras_license_type_code"
                  name="extras_license_type_code"
                  type="text"
                  defaultValue={e.license_type_code ?? ''}
                  placeholder="Annual, junior, daily, etc."
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_residency">Residency</label>
                <select
                  id="extras_residency"
                  name="extras_residency"
                  defaultValue={e.residency ?? ''}
                  className="bb-input"
                >
                  <option value="">—</option>
                  <option value="resident">Resident</option>
                  <option value="non_resident">Non-resident</option>
                </select>
              </div>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="extras_hunter_ed_number">Hunter Ed certificate <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><GraduationCap size={18} aria-hidden="true" /></span>
                <input
                  id="extras_hunter_ed_number"
                  name="extras_hunter_ed_number"
                  type="text"
                  defaultValue={e.hunter_ed_number ?? ''}
                  placeholder="Hunter Ed cert number"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        </section>
      )}

      {/* GUIDE LICENSE extras: license_class, business_name */}
      {SHOW.guideLicense(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Guide details</h2>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="extras_license_class">License class</label>
              <select
                id="extras_license_class"
                name="extras_license_class"
                defaultValue={e.license_class ?? ''}
                className="bb-input"
              >
                <option value="">—</option>
                <option value="guide">Guide</option>
                <option value="outfitter">Outfitter</option>
                <option value="apprentice">Apprentice</option>
                <option value="master">Master</option>
              </select>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="extras_business_name">Business name <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <label className="bb-field">
                <span className="bb-field-icon"><Briefcase size={18} aria-hidden="true" /></span>
                <input
                  id="extras_business_name"
                  name="extras_business_name"
                  type="text"
                  defaultValue={e.business_name ?? ''}
                  placeholder="Outfitter or business name"
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        </section>
      )}

      {/* SPECIES + ZONE for tag/permit/HRC */}
      {(SHOW.species(type) || SHOW.zone(type)) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Hunt details</h2>
            <div className="bb-form-grid-2">
              {SHOW.species(type) && (
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
              {SHOW.zone(type) && (
                <div className="bb-form-row">
                  <label className="bb-form-label" htmlFor="zone">Zone / unit <span style={{ opacity: 0.6 }}>(optional)</span></label>
                  <label className="bb-field">
                    <span className="bb-field-icon"><Mountain size={18} aria-hidden="true" /></span>
                    <input
                      id="zone"
                      name="zone"
                      type="text"
                      defaultValue={initial.zone ?? ''}
                      placeholder="D6 / Unit 22"
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

      {/* TAG extras: tag_type, weapon_restriction, sex_restriction */}
      {SHOW.tagExtras(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Tag conditions</h2>
            <div className="bb-form-grid-2">
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_tag_type">Tag type</label>
                <input
                  id="extras_tag_type"
                  name="extras_tag_type"
                  type="text"
                  defaultValue={e.tag_type ?? ''}
                  placeholder="General, archery, depredation"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_weapon_restriction">Weapon</label>
                <select
                  id="extras_weapon_restriction"
                  name="extras_weapon_restriction"
                  defaultValue={e.weapon_restriction ?? ''}
                  className="bb-input"
                >
                  <option value="">—</option>
                  <option value="any">Any legal</option>
                  <option value="archery">Archery only</option>
                  <option value="muzzleloader">Muzzleloader only</option>
                  <option value="rifle">Rifle only</option>
                </select>
              </div>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="extras_sex_restriction">Sex restriction <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <select
                id="extras_sex_restriction"
                name="extras_sex_restriction"
                defaultValue={e.sex_restriction ?? ''}
                className="bb-input"
              >
                <option value="">—</option>
                <option value="any">Any sex</option>
                <option value="antlered">Antlered</option>
                <option value="antlerless">Antlerless</option>
                <option value="either_sex">Either sex</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* PERMIT extras: permit_type, landowner_name */}
      {SHOW.permitExtras(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Permit details</h2>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="extras_permit_type">Permit type</label>
              <input
                id="extras_permit_type"
                name="extras_permit_type"
                type="text"
                defaultValue={e.permit_type ?? ''}
                placeholder="Depredation, landowner, special drawing"
                className="bb-input"
                autoComplete="off"
              />
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="extras_landowner_name">Landowner / property <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <input
                id="extras_landowner_name"
                name="extras_landowner_name"
                type="text"
                defaultValue={e.landowner_name ?? ''}
                placeholder="Landowner or property name"
                className="bb-input"
                autoComplete="off"
              />
            </div>
          </div>
        </section>
      )}

      {/* STAMP extras: signed checkbox (federal duck stamp must be signed across face) */}
      {SHOW.stampExtras(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Stamp</h2>
            <label
              className="bb-check-row"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <input
                type="checkbox"
                name="extras_stamp_signed"
                value="yes"
                defaultChecked={e.stamp_signed === 'yes'}
              />
              Signed across the face (required for federal duck stamps)
            </label>
          </div>
        </section>
      )}

      {/* HARVEST REPORT CARD extras: report_due_date (separate from valid_to) */}
      {SHOW.hrcExtras(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Reporting</h2>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="extras_report_due_date">Report due by</label>
              <input
                id="extras_report_due_date"
                name="extras_report_due_date"
                type="date"
                className="bb-input"
                defaultValue={e.report_due_date ?? ''}
                aria-label="Report due date"
              />
              <p className="bb-form-help">
                Different from the hunt window. CA HRC is due Jan 31 the year after the season.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* INSURANCE — ACORD 25 baseline. Multi-coverage list is a v27.0a.x add. */}
      {SHOW.insurance(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Insurance details</h2>
            <div className="bb-form-row">
              <label className="bb-form-label" htmlFor="extras_insurer">Insurer</label>
              <label className="bb-field">
                <span className="bb-field-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
                <input
                  id="extras_insurer"
                  name="extras_insurer"
                  type="text"
                  defaultValue={e.insurer ?? ''}
                  placeholder="e.g. Outdoor Liability Co."
                  className="bb-input bb-input-iconed"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="extras_policy_number">Policy number</label>
              <input
                id="extras_policy_number"
                name="extras_policy_number"
                type="text"
                defaultValue={e.policy_number ?? ''}
                placeholder="POL-12345"
                className="bb-input"
                autoComplete="off"
              />
            </div>
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_coverage_per_occurrence">Per occurrence</label>
                <input
                  id="extras_coverage_per_occurrence"
                  name="extras_coverage_per_occurrence"
                  type="text"
                  defaultValue={e.coverage_per_occurrence ?? ''}
                  placeholder="$1,000,000"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_coverage_aggregate">Aggregate</label>
                <input
                  id="extras_coverage_aggregate"
                  name="extras_coverage_aggregate"
                  type="text"
                  defaultValue={e.coverage_aggregate ?? ''}
                  placeholder="$2,000,000"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_named_insured">Named insured</label>
                <input
                  id="extras_named_insured"
                  name="extras_named_insured"
                  type="text"
                  defaultValue={e.named_insured ?? ''}
                  placeholder="Business or individual"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_additional_insured">Additional insured <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <input
                  id="extras_additional_insured"
                  name="extras_additional_insured"
                  type="text"
                  defaultValue={e.additional_insured ?? ''}
                  placeholder="Comma-separated"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* BUSINESS CREDENTIAL — course name, level, issuer, instructor id */}
      {SHOW.credential(type) && (
        <section className="bb-tile bb-form-section">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head">Credential details</h2>
            <div className="bb-form-grid-2">
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_credential_course">Course / cert name</label>
                <input
                  id="extras_credential_course"
                  name="extras_credential_course"
                  type="text"
                  defaultValue={e.credential_course ?? ''}
                  placeholder="CPR / WFA / Hunter Ed Instructor"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_credential_level">Level <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <input
                  id="extras_credential_level"
                  name="extras_credential_level"
                  type="text"
                  defaultValue={e.credential_level ?? ''}
                  placeholder="WFA / WFR / WEMT"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_issuer">Issuing org</label>
                <label className="bb-field">
                  <span className="bb-field-icon"><Building2 size={18} aria-hidden="true" /></span>
                  <input
                    id="extras_issuer"
                    name="extras_issuer"
                    type="text"
                    defaultValue={e.issuer ?? ''}
                    placeholder="Red Cross / NOLS / NRA"
                    className="bb-input bb-input-iconed"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_instructor_id">Instructor ID <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <input
                  id="extras_instructor_id"
                  name="extras_instructor_id"
                  type="text"
                  defaultValue={e.instructor_id ?? ''}
                  placeholder="IHEA / agency #"
                  className="bb-input"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* DATES (all types) */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Validity</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="valid_from">Valid from</label>
            <input
              id="valid_from"
              name="valid_from"
              type="date"
              required
              className="bb-input"
              defaultValue={initial.valid_from || ''}
              aria-label="Valid from date"
            />
          </div>
          <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
            <label className="bb-form-label" htmlFor="valid_to">Valid to</label>
            <input
              id="valid_to"
              name="valid_to"
              type="date"
              required
              className="bb-input"
              defaultValue={initial.valid_to || ''}
              aria-label="Valid to date"
            />
          </div>
          {(SHOW.issueDate(type) || SHOW.seasonYear(type)) && (
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              {SHOW.issueDate(type) && (
                <div className="bb-form-row">
                  <label className="bb-form-label" htmlFor="issue_date">Issue date <span style={{ opacity: 0.6 }}>(optional)</span></label>
                  <input
                    id="issue_date"
                    name="issue_date"
                    type="date"
                    className="bb-input"
                    defaultValue={initial.issue_date ?? ''}
                    aria-label="Issue date"
                  />
                </div>
              )}
              {SHOW.seasonYear(type) && (
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
              )}
            </div>
          )}
        </div>
      </section>

      {/* PHOTO NUDGE for stamps/permits + NOTES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Notes</h2>
          {SHOW.photoNudge(type) && (
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
        {initial.id && !isArchived && (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => callMutation(archiveWalletItemAction)}
            disabled={pending}
          >
            Archive
          </button>
        )}
        {initial.id && isArchived && (
          <>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={() => callMutation(restoreWalletItemAction)}
              disabled={pending}
            >
              Restore
            </button>
            <button
              type="button"
              className="bb-cta-sm bb-cta-sm-destructive"
              onClick={() => {
                if (window.confirm('Delete this wallet item? This cannot be undone.')) {
                  callMutation(deleteWalletItemAction)
                }
              }}
              disabled={pending}
            >
              Delete
            </button>
          </>
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
