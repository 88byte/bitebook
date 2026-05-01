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
  DATA_SOURCES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  STATIC_TEXT_PREFIX,
  isStaticText,
  staticTextValue,
} from '../../../_lib/doc-data-sources'

// v27.1.1.0 — wizard client. Hits extractDocFieldsAction on mount, renders
// each PDF field with a grouped data-source dropdown + a static-text
// fallback input. Save persists rows via saveDocMappingsAction.
//
// Layout: one card per field with type pill + name + dropdown. The static
// text input shows below the dropdown when the user picks "Static text".
// Save Draft saves all current selections; Save & Mark Complete additionally
// flips docs.mapping_status to 'complete' so the library badge shows
// "Mapped" instead of "Partial".

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

  // Selection state: keyed by field_name → either a known path,
  // STATIC_TEXT_PREFIX (means user picked Static text but hasn't typed yet),
  // a literal "static:..." (real saved value), "skip", or "" for unmapped.
  const [selection, setSelection] = useState<Record<string, string>>(existingByField)
  // Mirror static-text payloads separately so the dropdown choice and the
  // typed literal stay independent until the user navigates away.
  const initialStaticText: Record<string, string> = {}
  for (const [fname, path] of Object.entries(existingByField)) {
    if (isStaticText(path)) initialStaticText[fname] = staticTextValue(path)
  }
  const [staticText, setStaticText] = useState<Record<string, string>>(initialStaticText)

  // Discover fields on mount. Re-runnable via the Refresh button if the
  // guide replaces the PDF (v27.1.x — file replace not built yet but the
  // affordance is here).
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
      } else if (choice === STATIC_TEXT_PREFIX) {
        // Picked Static text — store the bare prefix until the user types.
        // Save will skip empty static-text entries.
        next[fieldName] = STATIC_TEXT_PREFIX
      } else {
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

  function buildPayload(): MappingInput[] {
    const out: MappingInput[] = []
    for (const f of fields ?? []) {
      const sel = selection[f.name] ?? ''
      // Treat bare prefix (= picked static but didn't type) as no mapping,
      // mirroring server behavior — keeps in-flight UI consistent.
      const finalPath = sel === STATIC_TEXT_PREFIX ? '' : sel
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
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: '#8C3C2A',
            }}
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
            Pick a data source for each. Auto-fill ships in the next build (v27.1.1.1).
          </p>
        </div>
      </div>

      {fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={selection[f.name] ?? ''}
          staticTextValue={staticText[f.name] ?? ''}
          onChange={handleDropdownChange}
          onStaticTextChange={handleStaticTextChange}
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
  staticTextValue,
  onChange,
  onStaticTextChange,
}: {
  field: DocPdfField
  value: string
  staticTextValue: string
  onChange: (fieldName: string, value: string) => void
  onStaticTextChange: (fieldName: string, value: string) => void
}) {
  const showsStaticInput = value === STATIC_TEXT_PREFIX || isStaticText(value)
  const dropdownValue = useMemo(() => {
    if (isStaticText(value)) return STATIC_TEXT_PREFIX
    return value
  }, [value])

  // Group sources by category for the optgroups.
  const grouped = useMemo(() => {
    const out: Record<string, typeof DATA_SOURCES> = {}
    for (const cat of CATEGORY_ORDER) out[cat] = []
    for (const src of DATA_SOURCES) out[src.category].push(src)
    return out
  }, [])

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
        <option value="">— No mapping —</option>
        {CATEGORY_ORDER.map((cat) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
            {grouped[cat].map((src) => (
              <option key={src.value} value={src.value}>
                {src.label}
                {src.perRow ? ' (per row)' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {showsStaticInput && (
        <input
          type="text"
          className="bb-input"
          placeholder="Type the value to write into this field"
          value={staticTextValue}
          onChange={(e) => onStaticTextChange(field.name, e.target.value)}
          maxLength={500}
        />
      )}
    </div>
  )
}
