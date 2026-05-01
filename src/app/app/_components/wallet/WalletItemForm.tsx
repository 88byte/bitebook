'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PawPrint, Mountain, FileText, Map,
  Building2, ShieldCheck, GraduationCap, Briefcase,
  Trophy, RotateCcw,
} from 'lucide-react'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { US_STATES } from '@/lib/us-states'
import {
  addWalletItemAction,
  updateWalletItemAction,
  archiveWalletItemAction,
  restoreWalletItemAction,
  deleteWalletItemAction,
  tagOutWalletItemAction,
  untagWalletItemAction,
} from '../../_lib/wallet-actions'
import { WALLET_TYPES_HUNTER, normalizeSexRestriction, type WalletItemType, type WalletJurisdiction } from '../../_lib/wallet-utils'
import DateField from '../DateField'
import WalletPhotoField from './WalletPhotoField'
import SpeciesField from '../SpeciesField'
import type { SpeciesOption } from '../../_lib/queries'

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
  document_url?: string | null
  tagged_out_at?: string | null
  /** v27.0b.5: tags only. true = covers one animal (auto-tags-out on
   * harvest). false = multi-use (turkey, pig, predator). */
  single_use?: boolean
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
  userId,
  initial,
  speciesOptions = [],
}: {
  basePath: '/app/h/wallet' | '/app/wallet'
  userId: string
  initial: Initial
  /** v27.0b.6: full hunting + fishing seed from the species table.
   * Filtered locally by the kind toggle. Empty array = no autocomplete
   * (falls back to plain free-text input via SpeciesField). */
  speciesOptions?: SpeciesOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<WalletItemType>(initial.type)
  const [jurisdiction, setJurisdiction] = useState<WalletJurisdiction>(initial.jurisdiction)
  // v27.0b.5 / .5.2: store as multiUse for the UX (checkbox checked =
  // multi-use). Default false (most tags are single-use). Hidden input
  // below maps back to single_use boolean for the server: !multiUse.
  const [multiUse, setMultiUse] = useState<boolean>(initial.single_use === false)
  // v27.0b.6: species + species kind toggle. Species is now a controlled
  // datalist autocomplete; the kind toggle filters which seed options
  // appear in the list. Default kind: hunting (most common path).
  const [speciesValue, setSpeciesValue] = useState<string>(initial.species ?? '')
  const [speciesKind, setSpeciesKind] = useState<'hunting' | 'fishing'>('hunting')
  // v27.0a.15: photo state. Persisted on form submit via the hidden
  // document_url input below — the actual upload happens out-of-band
  // (already in Supabase Storage) by the time we reach submit.
  const [documentUrl, setDocumentUrl] = useState<string | null>(initial.document_url ?? null)
  // v27.0b.1: confirm-modal state for the manual tag-out / mark-active flows.
  const [confirmMode, setConfirmMode] = useState<null | 'tagOut' | 'untag'>(null)

  const isArchived = !!initial.archived_at
  const isTaggedOut = !!initial.tagged_out_at
  const isTagType = initial.type === 'tag'
  const e = initial.extras ?? {}

  // Hunter route locks the type dropdown to hunter types only — hunters
  // cannot be issued guide credentials in real life, so guide_license /
  // insurance / business_credential are not selectable from /app/h/wallet.
  // Guide route shows all 8 types since guides can be dual-role (have
  // personal hunter licenses).
  const isHunterPath = basePath === '/app/h/wallet'
  const visibleTypeOptions = isHunterPath
    ? TYPE_OPTIONS.filter((o) => WALLET_TYPES_HUNTER.includes(o.value))
    : TYPE_OPTIONS

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    const fd = new FormData(ev.currentTarget)
    fd.set('type', type)
    fd.set('jurisdiction', SHOW.jurisdiction(type) ? jurisdiction : 'state')
    if (initial.id) fd.set('item_id', initial.id)
    fd.set('document_url', documentUrl ?? '')

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
      {/* PHOTO — emphasized above Basics for stamps + permits where the
          photo nudge is strongest (warden visibility); for other types
          the field appears at the bottom (see below). */}
      {SHOW.photoNudge(type) && (
        <WalletPhotoField
          userId={userId}
          walletItemId={initial.id ?? null}
          initialUrl={documentUrl}
          emphasize
          onChange={setDocumentUrl}
        />
      )}

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
              {visibleTypeOptions.map((o) => (
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
                <div className="bb-form-row" style={{ gridColumn: '1 / -1' }}>
                  <label className="bb-form-label" htmlFor="species">
                    Species <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  {/* v27.0b.6: Hunting / Fishing kind toggle filters the
                      datalist suggestions. The text input itself accepts
                      free entry so outliers / regional names that aren't
                      in the seed still save fine. */}
                  <div
                    className="bb-segmented"
                    role="radiogroup"
                    aria-label="Species category"
                    style={{ marginBottom: '0.5rem' }}
                  >
                    <label>
                      <input
                        type="radio"
                        name="species_kind"
                        value="hunting"
                        checked={speciesKind === 'hunting'}
                        onChange={() => setSpeciesKind('hunting')}
                      />
                      Hunting
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="species_kind"
                        value="fishing"
                        checked={speciesKind === 'fishing'}
                        onChange={() => setSpeciesKind('fishing')}
                      />
                      Fishing
                    </label>
                  </div>
                  <label className="bb-field">
                    <span className="bb-field-icon"><PawPrint size={18} aria-hidden="true" /></span>
                    <SpeciesField
                      id="species"
                      name="species"
                      value={speciesValue}
                      onChange={setSpeciesValue}
                      options={speciesOptions}
                      kind={speciesKind}
                      placeholder="Type or pick a species"
                      className="bb-input bb-input-iconed"
                    />
                  </label>
                  <p className="bb-form-help">
                    Pick from the list or type your own.
                  </p>
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
                {/* v27.0b.4.4: copy refactored to remove overlap with the
                    Weapon (weapon_restriction) and Sex restriction
                    (sex_restriction) fields below. Tag designation is
                    ONLY the issuing agency's program/class for the tag —
                    drawing pool, age program, voucher type, etc. Sex and
                    weapon are independent attributes printed alongside
                    on the actual tag. Real classifications validated
                    against CA DFW (General/Premium/Restricted/PLM/SHARE/
                    Fund/First-Deer/Second-Deer), CO CPW (Limited/OTC/
                    PLO/RFW/Voucher/Leftover), MT FWP (General license/
                    Special permit/Combination), WY WGFD (General/Type
                    0-9/Full-price/Reduced-price/Limited Quota/Pioneer/
                    Youth/Landowner), AK ADFG (General-season/Drawing
                    permit/Registration permit/Targeted/Tier I/Tier II/
                    Cultural). Free-text because every state uses a
                    different vocabulary. */}
                <label className="bb-form-label" htmlFor="extras_tag_type">Tag designation <span style={{ opacity: 0.6 }}>(optional)</span></label>
                <input
                  id="extras_tag_type"
                  name="extras_tag_type"
                  type="text"
                  defaultValue={e.tag_type ?? ''}
                  placeholder="General, Limited Quota, Premium, PLO, Apprentice"
                  className="bb-input"
                  autoComplete="off"
                />
                <p className="bb-form-help">Whatever your tag is officially called by the issuing agency — the program or class (General-season, Limited Quota, Premium, Restricted, PLO, Voucher, Apprentice, Junior, Pioneer, Depredation, Reduced-fee, etc.). Don&rsquo;t put sex or weapon restrictions here — those are tracked in their own fields below.</p>
              </div>
              <div className="bb-form-row">
                <label className="bb-form-label" htmlFor="extras_weapon_restriction">Weapon</label>
                {/* v27.0b.4.5: dropped "only" / "legal" qualifiers per
                    Flavio. The selection IS the choice. Storage values
                    bumped to canonical method labels (Any/Bow/Muzzleloader/
                    Rifle) so the wallet's weapon_restriction can flow into
                    method_display in queries.ts without case-mapping. The
                    legacy lowercase values (archery/muzzleloader/rifle/any)
                    are still normalized in queries.ts for backward
                    compatibility. */}
                <select
                  id="extras_weapon_restriction"
                  name="extras_weapon_restriction"
                  defaultValue={e.weapon_restriction ?? ''}
                  className="bb-input"
                >
                  <option value="">—</option>
                  <option value="Any">Any</option>
                  <option value="Bow">Bow</option>
                  <option value="Crossbow">Crossbow</option>
                  <option value="Muzzleloader">Muzzleloader</option>
                  <option value="Rifle">Rifle</option>
                  <option value="Shotgun">Shotgun</option>
                  <option value="Handgun">Handgun</option>
                </select>
              </div>
            </div>
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              {/* v27.0b.4.6: dropped deer-specific Antlered/Antlerless/
                  Either-sex labels in favor of universal Male/Female/
                  Either. Wallet covers bear, elk, turkey, pig, fish too.
                  defaultValue runs through normalizeSexRestriction so
                  legacy values (antlered/antlerless/either_sex/any)
                  saved before this build still match a new option on
                  edit. Storage values going forward are Male/Female/
                  Either Title Case. */}
              <label className="bb-form-label" htmlFor="extras_sex_restriction">Sex restriction <span style={{ opacity: 0.6 }}>(optional)</span></label>
              <select
                id="extras_sex_restriction"
                name="extras_sex_restriction"
                defaultValue={normalizeSexRestriction(e.sex_restriction) ?? ''}
                className="bb-input"
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Either">Either</option>
              </select>
            </div>

            {/* v27.0b.5.2: replaced the single-use toggle with a plainer
                conditional checkbox. Default unchecked = single use
                (auto-tag-out via _on_harvest_consume_tag trigger).
                Checked = multi-use (no auto-tag-out; hunter manually
                marks tagged-out). The label IS the helper. No role
                gating — section visibility depends only on type === 'tag'. */}
            <div className="bb-form-row" style={{ marginTop: '0.85rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  fontSize: '0.95rem',
                  color: 'var(--color-ink)',
                  cursor: 'pointer',
                  lineHeight: 1.4,
                }}
              >
                <input
                  type="checkbox"
                  checked={multiUse}
                  onChange={(ev) => setMultiUse(ev.target.checked)}
                  style={{
                    width: '1.05rem',
                    height: '1.05rem',
                    marginTop: '0.15rem',
                    accentColor: 'var(--color-copper)',
                    flexShrink: 0,
                  }}
                />
                <span>
                  <strong>Check this box if your tag covers multiple animals</strong>{' '}
                  <span style={{ color: 'var(--color-ink-soft)' }}>(turkey, pig, predator, etc.)</span>
                </span>
              </label>
              <input type="hidden" name="single_use" value={multiUse ? 'false' : 'true'} />
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
              <span className="bb-form-label">Report due by</span>
              <DateField
                name="extras_report_due_date"
                defaultValue={e.report_due_date ?? ''}
                ariaLabel="Report due date"
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
          <div className="bb-form-grid-2">
            <div className="bb-form-row">
              <span className="bb-form-label">Valid from</span>
              <DateField
                name="valid_from"
                required
                defaultValue={initial.valid_from || ''}
                ariaLabel="Valid from date"
              />
            </div>
            <div className="bb-form-row">
              <span className="bb-form-label">Valid to</span>
              <DateField
                name="valid_to"
                required
                defaultValue={initial.valid_to || ''}
                ariaLabel="Valid to date"
              />
            </div>
          </div>
          {(SHOW.issueDate(type) || SHOW.seasonYear(type)) && (
            <div className="bb-form-grid-2" style={{ marginTop: '0.75rem' }}>
              {SHOW.issueDate(type) && (
                <div className="bb-form-row">
                  <span className="bb-form-label">Issue date <span style={{ opacity: 0.6 }}>(optional)</span></span>
                  <DateField
                    name="issue_date"
                    defaultValue={initial.issue_date ?? ''}
                    ariaLabel="Issue date"
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

      {/* NOTES */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Notes</h2>
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

      {/* PHOTO — quiet-optional position for non-stamp/permit types
          (stamps + permits get the emphasized treatment above Basics). */}
      {!SHOW.photoNudge(type) && (
        <WalletPhotoField
          userId={userId}
          walletItemId={initial.id ?? null}
          initialUrl={documentUrl}
          emphasize={false}
          onChange={setDocumentUrl}
        />
      )}

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="submit" disabled={pending} className="bb-cta">
          {pending ? 'Saving...' : initial.id ? 'Save changes' : 'Add wallet item'}
        </button>
        {/* v27.0b.1: tag-only manual flip. */}
        {initial.id && isTagType && !isArchived && !isTaggedOut && (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setConfirmMode('tagOut')}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Trophy size={14} aria-hidden="true" />
            Mark as tagged out
          </button>
        )}
        {initial.id && isTagType && !isArchived && isTaggedOut && (
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setConfirmMode('untag')}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Mark as active
          </button>
        )}
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

      {/* v27.0b.1: confirm modal for manual tag-out / mark-active */}
      <ConfirmModal
        open={confirmMode === 'tagOut'}
        title="Mark this tag as used?"
        body="It'll move to your Tagged Out section. You can flip it back later if it wasn't used."
        confirmLabel="Mark tagged out"
        cancelLabel="Cancel"
        isPending={pending}
        onConfirm={() => {
          setConfirmMode(null)
          callMutation(tagOutWalletItemAction)
        }}
        onCancel={() => setConfirmMode(null)}
      />
      <ConfirmModal
        open={confirmMode === 'untag'}
        title="Mark this tag as active?"
        body="The tag goes back into your Active section. If a harvest is linked to this tag, you'll need to edit or delete the harvest first."
        confirmLabel="Mark active"
        cancelLabel="Cancel"
        isPending={pending}
        onConfirm={() => {
          setConfirmMode(null)
          callMutation(untagWalletItemAction)
        }}
        onCancel={() => setConfirmMode(null)}
      />
    </form>
  )
}
