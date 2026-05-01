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
  sourcesForFieldType,
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
  currentStatus,
}: {
  docId: string
  docKind: 'log' | 'waiver'
  existingByField: Record<string, string>
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
      // Bare picker prefix → no mapping (server strips it too).
      const isBarePrefix =
        sel === STATIC_TEXT_PREFIX ||
        sel === STATIC_DATE_PREFIX ||
        sel === STATIC_DATE_RANGE_PREFIX
      const finalPath = isBarePrefix ? '' : sel
      out.push({ field_name: f.name, data_source_path: finalPath })
    }
    return out
  }

  function save(thenComplete: boolean) {
    setSaveError(null)
    setSavedAt(null)
    setCompletedAt(null)
    const payload = buildPayload()
    startTransition(async () => {
      const res = await saveDocMappingsAction(docId, payload)
      if ('error' in res) {
        setSaveError(res.error)
        return
      }
      setSavedAt(Date.now())
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

      {fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={selection[f.name] ?? ''}
          staticText={staticText[f.name] ?? ''}
          staticDate={staticDate[f.name] ?? ''}
          rangeStart={rangeStart[f.name] ?? ''}
          rangeEnd={rangeEnd[f.name] ?? ''}
          onChange={handleDropdownChange}
          onStaticTextChange={handleStaticTextChange}
          onStaticDateChange={handleStaticDateChange}
          onRangeChange={handleRangeChange}
        />
      ))}

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

function FieldRow({
  field,
  value,
  staticText,
  staticDate,
  rangeStart,
  rangeEnd,
  onChange,
  onStaticTextChange,
  onStaticDateChange,
  onRangeChange,
}: {
  field: DocPdfField
  value: string
  staticText: string
  staticDate: string
  rangeStart: string
  rangeEnd: string
  onChange: (fieldName: string, value: string) => void
  onStaticTextChange: (fieldName: string, value: string) => void
  onStaticDateChange: (fieldName: string, value: string) => void
  onRangeChange: (fieldName: string, which: 'start' | 'end', value: string) => void
}) {
  // Source list filtered by AcroForm field type so checkbox fields only
  // see boolean sources.
  const sources = useMemo(() => sourcesForFieldType(field.type), [field.type])
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
        <span
          aria-label={`Field type ${field.type}`}
          style={{
            flexShrink: 0,
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

      {field.options && field.options.length > 0 && (
        <p className="bb-form-help" style={{ margin: 0 }}>
          Form expects one of: {field.options.join(' · ')}
        </p>
      )}

      <select
        className="bb-input"
        value={dropdownValue}
        onChange={(e) => onChange(field.name, e.target.value)}
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
