'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  extractDocFieldsAction,
  saveDocMappingsAction,
  markMappingCompleteAction,
  type DocPdfField,
  type MappingInput,
} from '../../../_lib/docs-actions'
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  STATIC_TEXT_PREFIX,
  STATIC_DATE_PREFIX,
  STATIC_DATE_RANGE_PREFIX,
  SKIP_VALUE,
  isStaticText,
  staticTextValue,
  isStaticDate,
  staticDateValue,
  isStaticDateRange,
  staticDateRangeValue,
  sourcesForFieldOnSlot,
  type DataSourceOption,
} from '../../../_lib/doc-data-sources'

// v27.1.1.0   — initial wizard.
// v27.1.1.0.1 — checkbox sources filtered by field type, name granularity
//               (full / first / last) routed through the catalog, picker
//               sentinels for static dates and date ranges, unmapped
//               fields default to skip (no row) which means Mark Complete
//               is no longer gated on row count.
//
// The dropdown choice and the typed/picked literal stay independent until
// save: STATIC_TEXT_PREFIX, STATIC_DATE_PREFIX, STATIC_DATE_RANGE_PREFIX
// are bare-prefix sentinels — when a guide picks one, the wizard reveals
// the matching input and the actual saved value carries the literal.

export default function MappingWizard({
  docId,
  docKind,
  existingByField,
  existingSlotByField,
  existingOverrideByField,
  currentStatus,
}: {
  docId: string
  docKind: 'log' | 'waiver'
  existingByField: Record<string, string>
  existingSlotByField: Record<string, number>
  existingOverrideByField: Record<string, boolean>
  currentStatus: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [extractError, setExtractError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [fields, setFields] = useState<DocPdfField[] | null>(null)
  const [hasAcroForm, setHasAcroForm] = useState<boolean>(true)
  const [loadingFields, setLoadingFields] = useState<boolean>(true)

  // Selection state. Bare prefixes mean "picker open, value not yet set"
  // and never get persisted. Real saves carry the suffix.
  const [selection, setSelection] = useState<Record<string, string>>(existingByField)

  // Mirror picker payloads so the dropdown choice stays stable when the
  // user types/picks. These are wiped by a no-mapping reset.
  const initStatic: Record<string, string> = {}
  const initDate: Record<string, string> = {}
  const initRangeStart: Record<string, string> = {}
  const initRangeEnd: Record<string, string> = {}
  for (const [fname, path] of Object.entries(existingByField)) {
    if (isStaticText(path)) initStatic[fname] = staticTextValue(path)
    else if (isStaticDate(path)) initDate[fname] = staticDateValue(path)
    else if (isStaticDateRange(path)) {
      const { start, end } = staticDateRangeValue(path)
      initRangeStart[fname] = start
      initRangeEnd[fname] = end
    }
  }
  const [staticText, setStaticText] = useState<Record<string, string>>(initStatic)
  const [staticDate, setStaticDate] = useState<Record<string, string>>(initDate)
  const [rangeStart, setRangeStart] = useState<Record<string, string>>(initRangeStart)
  const [rangeEnd, setRangeEnd] = useState<Record<string, string>>(initRangeEnd)

  // v27.1.1.0.3c.1: per-field manual slot override. 0 = auto-detect via
  // regex; 1+ = explicit slot. Hydrated from doc_field_mappings.hunter_slot.
  const [slotOverrides, setSlotOverrides] = useState<Record<string, number>>(
    () => ({ ...existingSlotByField })
  )

  // v27.1.1.0.3c.2: per-field is_override flag. true = decoupled from
  // Hunter 1 auto-mirroring. Hydrated from doc_field_mappings.is_override.
  const [overrideFlags, setOverrideFlags] = useState<Record<string, boolean>>(
    () => ({ ...existingOverrideByField })
  )
  // Mirror count from the last save, surfaced as a small toast in the
  // status bar (e.g. "Updated 3 mirrored fields").
  const [mirroredCount, setMirroredCount] = useState<number>(0)

  function handleSlotChange(fieldName: string, slot: number) {
    setSlotOverrides((prev) => ({ ...prev, [fieldName]: slot }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  function handleOverrideToggle(fieldName: string, isOverride: boolean) {
    setOverrideFlags((prev) => ({ ...prev, [fieldName]: isOverride }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  useEffect(() => {
    discover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  function discover() {
    setLoadingFields(true)
    setExtractError(null)
    startTransition(async () => {
      const res = await extractDocFieldsAction(docId)
      if ('error' in res) {
        setExtractError(res.error)
        setFields([])
        setHasAcroForm(false)
      } else {
        setFields(res.fields)
        setHasAcroForm(res.hasAcroForm)
      }
      setLoadingFields(false)
    })
  }

  function handleDropdownChange(fieldName: string, choice: string) {
    setSelection((prev) => {
      const next = { ...prev }
      if (choice === '') {
        delete next[fieldName]
      } else {
        // Picker sentinels are stored as bare prefix until the user fills
        // in the literal. saveDocMappingsAction strips bare prefixes.
        next[fieldName] = choice
      }
      return next
    })
    setSavedAt(null)
    setCompletedAt(null)
  }

  function handleStaticTextChange(fieldName: string, value: string) {
    setStaticText((prev) => ({ ...prev, [fieldName]: value }))
    setSelection((prev) => ({
      ...prev,
      [fieldName]: value ? `${STATIC_TEXT_PREFIX}${value}` : STATIC_TEXT_PREFIX,
    }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  function handleStaticDateChange(fieldName: string, iso: string) {
    setStaticDate((prev) => ({ ...prev, [fieldName]: iso }))
    setSelection((prev) => ({
      ...prev,
      [fieldName]: iso ? `${STATIC_DATE_PREFIX}${iso}` : STATIC_DATE_PREFIX,
    }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  function handleRangeChange(fieldName: string, which: 'start' | 'end', iso: string) {
    if (which === 'start') setRangeStart((prev) => ({ ...prev, [fieldName]: iso }))
    else setRangeEnd((prev) => ({ ...prev, [fieldName]: iso }))
    const start = which === 'start' ? iso : (rangeStart[fieldName] ?? '')
    const end = which === 'end' ? iso : (rangeEnd[fieldName] ?? '')
    const finalPath =
      start && end
        ? `${STATIC_DATE_RANGE_PREFIX}${start}..${end}`
        : STATIC_DATE_RANGE_PREFIX
    setSelection((prev) => ({ ...prev, [fieldName]: finalPath }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  function buildPayload(): MappingInput[] {
    const out: MappingInput[] = []
    for (const f of fields ?? []) {
      const sel = selection[f.name] ?? ''
      const isBarePrefix =
        sel === STATIC_TEXT_PREFIX ||
        sel === STATIC_DATE_PREFIX ||
        sel === STATIC_DATE_RANGE_PREFIX
      const finalPath = isBarePrefix ? '' : sel
      const slot = slotOverrides[f.name] ?? 0
      const isOverride = overrideFlags[f.name] === true
      out.push({
        field_name: f.name,
        data_source_path: finalPath,
        hunter_slot: slot,
        is_override: isOverride,
      })
    }
    return out
  }

  function save(thenComplete: boolean) {
    setSaveError(null)
    setSavedAt(null)
    setCompletedAt(null)
    setMirroredCount(0)
    const payload = buildPayload()
    startTransition(async () => {
      const res = await saveDocMappingsAction(docId, payload)
      if ('error' in res) {
        setSaveError(res.error)
        return
      }
      setSavedAt(Date.now())
      setMirroredCount(res.mirrored_count)
      if (thenComplete) {
        const r2 = await markMappingCompleteAction(docId, true)
        if ('error' in r2) {
          setSaveError(r2.error)
          return
        }
        setCompletedAt(Date.now())
      }
      router.refresh()
    })
  }

  // ----- render -----------------------------------------------------------

  if (loadingFields) {
    return (
      <section className="bb-tile mt-4">
        <div className="bb-tile-body" style={{ padding: '1rem' }}>
          <p className="bb-form-help" style={{ margin: 0 }}>Reading the PDF…</p>
        </div>
      </section>
    )
  }

  if (extractError) {
    return (
      <section className="bb-tile mt-4" style={{ borderColor: 'var(--color-copper)' }}>
        <div className="bb-tile-body" style={{ padding: '1rem' }}>
          <p
            role="alert"
            style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#8C3C2A' }}
          >
            <AlertCircle size={16} aria-hidden="true" />
            {extractError}
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={discover}
              disabled={pending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!hasAcroForm) {
    return (
      <section className="bb-tile mt-4" style={{ borderColor: 'var(--color-copper)' }}>
        <div className="bb-tile-body" style={{ padding: '1rem' }}>
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>
            This PDF has no fillable fields
          </h2>
          <p className="bb-form-help" style={{ margin: 0 }}>
            Form mapping needs an AcroForm — a PDF with embedded fillable fields. This file looks
            like a flat scan or a non-fillable export. Try uploading the official version from
            your state agency, which is usually fillable. OCR-based mapping for flat forms is
            slated for a later build.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={discover}
              disabled={pending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Re-check
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!fields || fields.length === 0) {
    return (
      <section className="bb-tile mt-4">
        <div className="bb-tile-body" style={{ padding: '1rem' }}>
          <p className="bb-form-help" style={{ margin: 0 }}>
            No fields detected.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="bb-tile">
        <div className="bb-tile-body" style={{ padding: '0.875rem 1rem' }}>
          <p className="bb-form-help" style={{ margin: 0 }}>
            Found <strong>{fields.length}</strong> field{fields.length === 1 ? '' : 's'} in this PDF.
            Map only the fields you need filled — anything left as &ldquo;No mapping&rdquo; is
            intentionally skipped at fill time.
          </p>
        </div>
      </div>

      {/* v27.1.1.0.3c.2: build slot1 path-by-base map for live mirror
          display. Walks current selections; the SAVE-time mirror pass on
          the server is the source of truth — this is just so the UI can
          surface "Mirrored from Hunter 1" tags + the inherited dropdown
          value before the next save round-trip. */}
      {(() => null)()}
      {fields.map((f) => {
        const slot1ByBase = computeSlot1ByBase(fields, selection, slotOverrides)
        const parsed = parseFieldNameInline(f.name)
        const effSlot = (slotOverrides[f.name] ?? 0) > 0
          ? (slotOverrides[f.name] ?? 0)
          : parsed.slot
        const mirrorPath = effSlot >= 2 ? slot1ByBase.get(parsed.base) ?? null : null
        return (
          <FieldRow
            key={f.name}
            field={f}
            value={selection[f.name] ?? ''}
            staticText={staticText[f.name] ?? ''}
            staticDate={staticDate[f.name] ?? ''}
            rangeStart={rangeStart[f.name] ?? ''}
            rangeEnd={rangeEnd[f.name] ?? ''}
            slotOverride={slotOverrides[f.name] ?? 0}
            isOverride={overrideFlags[f.name] === true}
            mirrorPath={mirrorPath}
            onChange={handleDropdownChange}
            onStaticTextChange={handleStaticTextChange}
            onStaticDateChange={handleStaticDateChange}
            onRangeChange={handleRangeChange}
            onSlotChange={handleSlotChange}
            onOverrideToggle={handleOverrideToggle}
          />
        )
      })}

      {saveError && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          {saveError}
        </p>
      )}

      <div
        className="bb-tile"
        style={{
          padding: '0.875rem 1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="bb-btn-secondary"
          onClick={() => save(false)}
          disabled={pending}
        >
          {savedAt !== null && completedAt === null ? 'Saved' : pending ? 'Saving…' : 'Save draft'}
        </button>
        {savedAt !== null && mirroredCount > 0 && (
          <span style={{ fontSize: '0.85rem', color: 'var(--color-copper)' }}>
            Updated {mirroredCount} mirrored field{mirroredCount === 1 ? '' : 's'}.
          </span>
        )}
        <button
          type="button"
          className="bb-cta-sm"
          onClick={() => save(true)}
          disabled={pending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          {completedAt !== null ? 'Saved + marked complete' : pending ? 'Working…' : 'Save & mark complete'}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
          Status: <strong>{currentStatus}</strong>
        </span>
      </div>
    </section>
  )
}

// v27.1.1.0.3c.2: parseFieldName equivalent inline (so wizard doesn't
// import the engine module). Mirror of harvest-log-fill-types.parseFieldName.
function parseFieldNameInline(name: string): { slot: number; base: string } {
  const prefix = /^(?:hunter|h|row)[_-]?(\d+)[_-]?(.*)$/i.exec(name)
  if (prefix) {
    const n = Number(prefix[1])
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      return { slot: n, base: (prefix[2] || '').trim() }
    }
  }
  const suffix = /^(.*?)[_-](\d+)$/i.exec(name)
  if (suffix) {
    const n = Number(suffix[2])
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      return { slot: n, base: (suffix[1] || '').trim() }
    }
  }
  return { slot: 0, base: name }
}

// Walk current wizard state to derive slot-1 paths keyed by base. Used by
// the FieldRow render to surface "Mirrored from Hunter 1" tags + the
// inherited dropdown value live, before save round-trips.
function computeSlot1ByBase(
  fields: DocPdfField[] | null,
  selection: Record<string, string>,
  slotOverrides: Record<string, number>
): Map<string, string> {
  const out = new Map<string, string>()
  for (const f of fields ?? []) {
    const sel = selection[f.name]
    if (!sel) continue
    if (
      sel === STATIC_TEXT_PREFIX ||
      sel === STATIC_DATE_PREFIX ||
      sel === STATIC_DATE_RANGE_PREFIX
    ) {
      continue
    }
    const parsed = parseFieldNameInline(f.name)
    const effSlot = (slotOverrides[f.name] ?? 0) > 0 ? slotOverrides[f.name] : parsed.slot
    if (effSlot === 1) {
      out.set(parsed.base, sel)
    }
  }
  return out
}

function FieldRow({
  field,
  value,
  staticText,
  staticDate,
  rangeStart,
  rangeEnd,
  slotOverride,
  isOverride,
  mirrorPath,
  onChange,
  onStaticTextChange,
  onStaticDateChange,
  onRangeChange,
  onSlotChange,
  onOverrideToggle,
}: {
  field: DocPdfField
  value: string
  staticText: string
  staticDate: string
  rangeStart: string
  rangeEnd: string
  slotOverride: number
  isOverride: boolean
  mirrorPath: string | null
  onChange: (fieldName: string, value: string) => void
  onStaticTextChange: (fieldName: string, value: string) => void
  onStaticDateChange: (fieldName: string, value: string) => void
  onRangeChange: (fieldName: string, which: 'start' | 'end', value: string) => void
  onSlotChange: (fieldName: string, slot: number) => void
  onOverrideToggle: (fieldName: string, isOverride: boolean) => void
}) {
  // v27.1.1.0.3c: source list slot-aware (per-hunter vs trip-level filter).
  // v27.1.1.0.3c.1: slotOverride from doc_field_mappings.hunter_slot wins
  // when > 0; otherwise we fall back to the regex auto-detect, matching
  // the engine's resolution rule exactly.
  const detectedSlot = useMemo(() => {
    const prefix = /^(?:hunter|h|row)[_-]?(\d+)[_-]?(.*)$/i.exec(field.name)
    if (prefix) {
      const n = Number(prefix[1])
      if (Number.isFinite(n) && n >= 1 && n <= 99) return n
    }
    const suffix = /^(.*?)[_-](\d+)$/i.exec(field.name)
    if (suffix) {
      const n = Number(suffix[2])
      if (Number.isFinite(n) && n >= 1 && n <= 99) return n
    }
    return 0
  }, [field.name])

  const slot = slotOverride > 0 ? slotOverride : detectedSlot

  const sources = useMemo(() => sourcesForFieldOnSlot(field.type, slot), [field.type, slot])
  const grouped = useMemo(() => {
    const out: Record<string, DataSourceOption[]> = {}
    for (const cat of CATEGORY_ORDER) out[cat] = []
    for (const src of sources) out[src.category].push(src)
    return out
  }, [sources])

  // Resolve the dropdown's display value back to a sentinel when the
  // saved selection is a literal payload (e.g. "static:My Outfit" maps
  // back to STATIC_TEXT_PREFIX in the dropdown).
  const dropdownValue = useMemo(() => {
    if (isStaticText(value)) return STATIC_TEXT_PREFIX
    if (isStaticDate(value)) return STATIC_DATE_PREFIX
    if (isStaticDateRange(value)) return STATIC_DATE_RANGE_PREFIX
    return value
  }, [value])

  const showsStaticInput = dropdownValue === STATIC_TEXT_PREFIX
  const showsDatePicker = dropdownValue === STATIC_DATE_PREFIX
  const showsRangePicker = dropdownValue === STATIC_DATE_RANGE_PREFIX

  return (
    <div
      className="bb-tile"
      style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: 'var(--color-ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
          }}
        >
          {field.name}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {slot > 0 && (
            <span
              aria-label={`Hunter ${slot}`}
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: 999,
                background: 'rgba(168, 92, 50, 0.12)',
                color: 'var(--color-copper)',
                letterSpacing: '0.04em',
              }}
            >
              HUNTER {slot}
            </span>
          )}
          <span
            aria-label={`Field type ${field.type}`}
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '0.15rem 0.45rem',
              borderRadius: 999,
              background: 'var(--color-paper-tint)',
              color: 'var(--color-ink-soft)',
            }}
          >
            {field.type}
          </span>
        </div>
      </div>

      {field.options && field.options.length > 0 && (
        <p className="bb-form-help" style={{ margin: 0 }}>
          Form expects one of: {field.options.join(' · ')}
        </p>
      )}

      {/* v27.1.1.0.3c.1: manual slot picker. Default to auto-detect (0)
          which uses the regex parse; guide can pin to a specific hunter
          slot when the field name doesn't follow the conventions. Cap
          at Hunter 5 — covers common state forms; engine accepts up
          to 99 if needed later. */}
      <div className="bb-form-row" style={{ marginBottom: '0.1rem' }}>
        <label
          className="bb-form-label"
          htmlFor={`slot-${field.name}`}
          style={{ marginBottom: '0.2rem' }}
        >
          Field belongs to
        </label>
        <select
          id={`slot-${field.name}`}
          className="bb-input"
          value={slotOverride}
          onChange={(e) => onSlotChange(field.name, Number(e.target.value))}
        >
          <option value={0}>
            Auto-detect{detectedSlot > 0 ? ` (Hunter ${detectedSlot})` : ' (Trip-level)'}
          </option>
          <option value={1}>Hunter 1</option>
          <option value={2}>Hunter 2</option>
          <option value={3}>Hunter 3</option>
          <option value={4}>Hunter 4</option>
          <option value={5}>Hunter 5</option>
        </select>
      </div>

      {/* v27.1.1.0.3c.2: mirror tag + override toggle. Renders only on
          slot 2..N fields whose base name has a saved Hunter 1 source.
          When isOverride=false, the dropdown is read-only and shows the
          mirrored value. Toggle on -> dropdown becomes editable. */}
      {mirrorPath !== null && slot >= 2 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.4rem 0.55rem',
            borderRadius: 8,
            background: isOverride ? 'transparent' : 'rgba(168, 92, 50, 0.08)',
            border: '1px dashed var(--color-ink-tint)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              color: isOverride ? 'var(--color-ink-soft)' : 'var(--color-copper)',
              fontWeight: 600,
            }}
          >
            {isOverride ? 'Custom for this slot' : 'Mirrored from Hunter 1'}
          </span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.85rem',
              color: 'var(--color-ink-soft)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isOverride}
              onChange={(e) => onOverrideToggle(field.name, e.target.checked)}
            />
            Use a different source for this slot
          </label>
        </div>
      )}

      <select
        className="bb-input"
        value={mirrorPath !== null && !isOverride && slot >= 2 ? mirrorPath : dropdownValue}
        onChange={(e) => onChange(field.name, e.target.value)}
        disabled={mirrorPath !== null && !isOverride && slot >= 2}
      >
        <option value="">— No mapping (skip) —</option>
        {CATEGORY_ORDER.map((cat) =>
          grouped[cat].length > 0 ? (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {grouped[cat].map((src) => (
                <option key={`${cat}:${src.value}`} value={src.value}>
                  {src.label}
                  {src.perRow ? ' (per row)' : ''}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>

      {showsStaticInput && (
        <input
          type="text"
          className="bb-input"
          placeholder="Type the value to write into this field"
          value={staticText}
          onChange={(e) => onStaticTextChange(field.name, e.target.value)}
          maxLength={500}
        />
      )}

      {showsDatePicker && (
        <input
          type="date"
          className="bb-input"
          value={staticDate}
          onChange={(e) => onStaticDateChange(field.name, e.target.value)}
        />
      )}

      {showsRangePicker && (
        <div className="bb-form-grid-2" style={{ gap: '0.5rem' }}>
          <div className="bb-form-row">
            <label
              className="bb-form-label"
              htmlFor={`${field.name}-rstart`}
              style={{ marginBottom: '0.2rem' }}
            >
              Start
            </label>
            <input
              id={`${field.name}-rstart`}
              type="date"
              className="bb-input"
              value={rangeStart}
              onChange={(e) => onRangeChange(field.name, 'start', e.target.value)}
            />
          </div>
          <div className="bb-form-row">
            <label
              className="bb-form-label"
              htmlFor={`${field.name}-rend`}
              style={{ marginBottom: '0.2rem' }}
            >
              End
            </label>
            <input
              id={`${field.name}-rend`}
              type="date"
              className="bb-input"
              value={rangeEnd}
              onChange={(e) => onRangeChange(field.name, 'end', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
