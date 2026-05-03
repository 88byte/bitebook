'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import {
  extractDocFieldsAction,
  saveDocMappingsAction,
  markMappingCompleteAction,
  suggestMappingsAction,
  type DocPdfField,
  type MappingInput,
} from '../../../_lib/docs-actions'
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  STATIC_TEXT_PREFIX,
  STATIC_DATE_PREFIX,
  STATIC_DATE_RANGE_PREFIX,
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
// v27.1.1.0.3c.3 — UX cleanup. Slot picker hidden on auto-detected fields
//               (replaced with tap-to-edit badge); only fields that need
//               disambiguation expose the dropdown. Plain-English copy
//               throughout (intro, dropdown labels via doc-data-sources,
//               "Fill this field with" label, "Use a different value for
//               this hunter" override toggle).
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
  existingAiSuggestedByField,
  currentStatus,
}: {
  docId: string
  docKind: 'log' | 'waiver'
  existingByField: Record<string, string>
  existingSlotByField: Record<string, number>
  existingOverrideByField: Record<string, boolean>
  existingAiSuggestedByField: Record<string, boolean>
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

  // v27.1.1.0.3d: per-field is_ai_suggested flag. true = row was inserted
  // by Claude Haiku 4.5 and not yet confirmed/edited by the guide.
  // Wizard surfaces a ✨ AI badge on these rows. Editing the dropdown
  // optimistically clears the flag client-side; server clears on save.
  const [aiSuggestedFlags, setAiSuggestedFlags] = useState<Record<string, boolean>>(
    () => ({ ...existingAiSuggestedByField })
  )
  const [aiSuggesting, setAiSuggesting] = useState<boolean>(false)
  const [aiResultMsg, setAiResultMsg] = useState<string | null>(null)
  const [aiNeedsSetup, setAiNeedsSetup] = useState<boolean>(false)
  // v27.1.1.0.3d.2.2: success banner. Flips true for 3 seconds after a
  // successful suggestion run; renders an "✨ AI suggested N fields"
  // toast with a green-ish copper accent before collapsing.
  const [aiSuccessCount, setAiSuccessCount] = useState<number | null>(null)
  // v27.1.1.0.3d.2.5: ref for Step 3's "Review N AI suggestions" CTA
  // to scroll the user to the field cards. MUST be declared before any
  // conditional early returns so React's rules-of-hooks order stays
  // stable across renders. (v3d.2.4 placed this after the loadingFields
  // guard, which crashed the wizard once fields hydrated.)
  const fieldsAreaRef = useRef<HTMLDivElement>(null)

  function handleSlotChange(fieldName: string, slot: number) {
    setSlotOverrides((prev) => ({ ...prev, [fieldName]: slot }))
    setSavedAt(null)
    setCompletedAt(null)
    // v27.1.1.0.3d: any guide edit clears the AI badge optimistically.
    setAiSuggestedFlags((prev) => (prev[fieldName] ? { ...prev, [fieldName]: false } : prev))
  }

  // v27.1.1.0.3d: kick off AI suggestion run. Server pulls the PDF,
  // calls Claude Sonnet 4.6 with tool-use, upserts is_ai_suggested
  // rows. Wizard then router.refresh()es to pull the new mappings via
  // the server component's fetch.
  // v27.1.1.0.3d.2.2: drives a centered loading overlay while the call
  // is in flight + a 3-second success banner after the rows land.
  function handleSuggestMappings() {
    setAiResultMsg(null)
    setAiNeedsSetup(false)
    setAiSuccessCount(null)
    setAiSuggesting(true)
    startTransition(async () => {
      const res = await suggestMappingsAction(docId)
      setAiSuggesting(false)
      if ('error' in res) {
        setAiResultMsg(res.error)
        if (res.needs_setup) setAiNeedsSetup(true)
        return
      }
      // Trigger the success banner. The actual badges render after the
      // server refresh hydrates is_ai_suggested rows back into the
      // wizard's existingAiSuggestedByField prop.
      setAiSuccessCount(res.suggested)
      const parts: string[] = []
      if (res.suggested > 0) parts.push(`${res.suggested} suggestion${res.suggested === 1 ? '' : 's'}`)
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`)
      if (res.rejected > 0) parts.push(`${res.rejected} rejected`)
      setAiResultMsg(parts.length > 0 ? parts.join(' · ') : 'AI returned nothing usable.')
      router.refresh()
      // Auto-collapse the banner after 3s.
      window.setTimeout(() => setAiSuccessCount(null), 3000)
    })
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

  // v27.1.1.0.3d.2: pending-suggestions detector. When a fresh log
  // upload kicks off auto-run via createDocAction's after(), the AI
  // call lands on a Vercel function that completes after the wizard
  // page is already rendered. We detect "nothing saved yet, status
  // unmapped" → poll for new is_ai_suggested rows by router.refresh()
  // every 4 seconds for up to 60 seconds. Once any AI row appears OR
  // the timer runs out, polling stops. The manual button remains as a
  // recovery path.
  const initialIsEmpty =
    Object.keys(existingByField).length === 0 &&
    Object.values(existingAiSuggestedByField).every((v) => !v) &&
    currentStatus === 'unmapped'
  const [aiPending, setAiPending] = useState<boolean>(initialIsEmpty)
  useEffect(() => {
    if (!aiPending) return
    let elapsed = 0
    const tick = setInterval(() => {
      elapsed += 4000
      router.refresh()
      if (elapsed >= 60000) {
        setAiPending(false)
        clearInterval(tick)
      }
    }, 4000)
    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPending])
  // Cancel pending state the moment any AI row hydrates from the server
  // (router.refresh re-mounts the wizard with the new prop).
  // v27.1.1.0.3d.2.6: also fire the Step-3 success banner on the
  // auto-run path. Previous behavior only set aiSuccessCount from the
  // manual button-tap response; the auto-run path cleared aiPending
  // directly and skipped Step 3 entirely (Flavio: "what the hell
  // happened to step 1 and 3?"). We track prev AI row count in a ref
  // and surface aiSuccessCount = newAdditions when new rows arrive.
  const prevAiCountRef = useRef<number>(
    Object.values(existingAiSuggestedByField).filter((v) => v).length
  )
  useEffect(() => {
    const newAiCount = Object.values(existingAiSuggestedByField).filter((v) => v).length
    if (aiPending && newAiCount > 0) {
      setAiPending(false)
    }
    const additions = newAiCount - prevAiCountRef.current
    if (additions > 0 && aiSuccessCount === null) {
      setAiSuccessCount(additions)
      window.setTimeout(() => setAiSuccessCount(null), 3000)
    }
    prevAiCountRef.current = newAiCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAiSuggestedByField])

  // v27.1.1.0.3d.2.3: prop->state sync. Wizard's state hooks (selection,
  // slotOverrides, overrideFlags, aiSuggestedFlags) only seed on first
  // mount via useState's initializer — when router.refresh() re-runs
  // page.tsx after suggestMappingsAction inserts new is_ai_suggested
  // rows, the parent passes new prop maps but the stale useState wins.
  // Result: the success banner fires "AI suggested 82 fields" but no
  // rows actually populate in the form.
  //
  // Fix: re-sync state from props whenever the prop maps change by
  // reference identity. We MERGE rather than replace so any in-flight
  // unsaved edit the guide is mid-typing isn't clobbered. Specifically:
  // for each prop entry, only push into state when state doesn't have
  // that key yet OR when the existing state value matches the previous
  // server value (i.e. nothing dirty to lose).
  useEffect(() => {
    setSelection((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(existingByField)) {
        if (next[k] !== v && (next[k] === undefined || next[k] === '')) {
          next[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
    setSlotOverrides((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(existingSlotByField)) {
        if (next[k] !== v && (next[k] === undefined || next[k] === 0)) {
          next[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
    setOverrideFlags((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(existingOverrideByField)) {
        if (next[k] !== v && next[k] === undefined) {
          next[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
    setAiSuggestedFlags((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(existingAiSuggestedByField)) {
        if (next[k] !== v) {
          next[k] = v
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingByField, existingSlotByField, existingOverrideByField, existingAiSuggestedByField])

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
        // v27.1.1.0.3c.4: implicit slot-1 derivation. CDFW-style forms
        // name Hunter 1 fields without any slot suffix and only suffix
        // Hunter 2..N as `_2`, `_3`, etc. — promote bare-base fields
        // whose `<base>_<N>` siblings exist (N>=2) to slot 1 unless the
        // guide already saved an override for them.
        const names = res.fields.map((f) => f.name)
        const implicit1 = detectImplicitSlot1Set(names)
        setSlotOverrides((prev) => {
          const next = { ...prev }
          for (const n of implicit1) {
            // Don't clobber an existing saved/manual override.
            if (next[n] === undefined || next[n] === 0) next[n] = 1
          }
          return next
        })
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
    // v27.1.1.0.3d: editing a row optimistically clears its AI badge.
    setAiSuggestedFlags((prev) => (prev[fieldName] ? { ...prev, [fieldName]: false } : prev))
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
            We can&rsquo;t auto-fill this PDF because it doesn&rsquo;t have any fillable
            boxes built in. Try downloading the official version from your state&rsquo;s
            wildlife agency website &mdash; those are usually fillable. We&rsquo;ll add
            support for flat (non-fillable) forms in a later release.
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

  // v27.1.1.0.3c.5: group fields by base name + slot pattern so the
  // wizard collapses repeating Hunter 1-5 fields under a single primary
  // row (mirror covers slots 2..N) and tucks complex sequential groups
  // (10-slot SPECIES TAKEN, 10-slot Tag Report Card) into single
  // expandable accordions. On Flavio's CDFW 992-B PDF this trims the
  // visible row count from 83 -> 23.
  const groups = buildFieldGroups(fields, slotOverrides)
  const slot1ByBase = computeSlot1ByBase(fields, selection, slotOverrides)

  // v27.1.1.0.3d.2.5: stage discriminant + helper. Hook (useRef) was
  // moved to the top of the component above the early returns to
  // satisfy the rules-of-hooks; v3d.2.4 placed it here which crashed
  // the wizard with "Rendered more hooks than during the previous
  // render" once `loadingFields` flipped false and the early-return
  // guards fell through.
  const aiRowCount = Object.values(aiSuggestedFlags).filter((v) => v).length
  const hasAnySaved = Object.values(selection).some((v) => v)
  type WizardStage = 'start' | 'working' | 'success' | 'review'
  let stage: WizardStage
  if (aiSuggesting || aiPending) {
    stage = 'working'
  } else if (aiSuccessCount !== null) {
    stage = 'success'
  } else if (aiRowCount > 0 || hasAnySaved) {
    stage = 'review'
  } else {
    stage = 'start'
  }

  function scrollToFirstField() {
    fieldsAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function renderFieldRow(f: DocPdfField) {
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
        isAiSuggested={aiSuggestedFlags[f.name] === true}
        mirrorPath={mirrorPath}
        onChange={handleDropdownChange}
        onStaticTextChange={handleStaticTextChange}
        onStaticDateChange={handleStaticDateChange}
        onRangeChange={handleRangeChange}
        onSlotChange={handleSlotChange}
        onOverrideToggle={handleOverrideToggle}
      />
    )
  }

  return (
    <section className="mt-4 flex flex-col gap-3">
      {/* v27.1.1.0.3d.2.4: explicit step-by-step CTA flow. Each phase
          gets its own card with a single primary copper CTA so the
          guide always knows the next action. Stages: 'start' (welcome
          + Start AI mapping), 'working' (spinner, no CTA), 'success'
          (Review N AI suggestions, scrolls to fields), 'review'
          (re-run path with small auto-suggest button). */}
      {stage === 'start' && (
        <StepCard
          stepNumber={1}
          title="Start by letting AI map your form"
          tone="copper"
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
            We&rsquo;ll read your PDF and pre-fill the mappings for you. Takes about 10&ndash;20 seconds.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="bb-cta"
              onClick={handleSuggestMappings}
              disabled={pending || aiSuggesting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Sparkles size={16} aria-hidden="true" />
              Start AI mapping
            </button>
          </div>
          {aiResultMsg && (
            <p
              className="bb-form-help"
              role="status"
              style={{
                margin: '0.6rem 0 0',
                color: aiNeedsSetup ? '#8C3C2A' : 'var(--color-ink-soft)',
              }}
            >
              {aiResultMsg}
            </p>
          )}
        </StepCard>
      )}

      {stage === 'working' && (
        <StepCard
          stepNumber={2}
          title={aiSuggesting ? 'AI is reading your form…' : 'AI is reading your PDF…'}
          tone="copper"
          centerBody
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0 0.2rem',
            }}
            role="status"
            aria-live="polite"
          >
            <Loader2
              size={32}
              aria-hidden="true"
              style={{
                color: 'var(--color-copper)',
                animation: 'bb-spin 1s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.9rem', color: 'var(--color-ink-soft)', textAlign: 'center' }}>
              Usually lands in 10&ndash;20 seconds.{' '}
              {aiPending ? 'This page refreshes itself.' : 'Hang tight.'}
            </span>
          </div>
        </StepCard>
      )}

      {stage === 'success' && (
        <StepCard
          stepNumber={3}
          title={`AI suggested ${aiSuccessCount ?? 0} field${aiSuccessCount === 1 ? '' : 's'}`}
          tone="success"
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
            AI pre-filled mappings for {aiSuccessCount} field{aiSuccessCount === 1 ? '' : 's'}.
            Tap each card below to confirm or change.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="bb-cta"
              onClick={scrollToFirstField}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Sparkles size={16} aria-hidden="true" />
              Review {aiSuccessCount} AI suggestion{aiSuccessCount === 1 ? '' : 's'} →
            </button>
          </div>
        </StepCard>
      )}

      {stage === 'review' && (
        <StepCard
          stepNumber={4}
          title="Review your mappings"
          tone="ink"
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
            Look for the <strong>✨ AI</strong> badge on each row &mdash; tap to confirm or
            pick a different source. Anything left on &ldquo;Skip&rdquo; stays blank in the
            final PDF.
            {fields.length > 0 && (
              <>
                {' '}
                <span style={{ color: 'var(--color-ink-soft)' }}>
                  ({fields.length} total box{fields.length === 1 ? '' : 'es'}, grouped into{' '}
                  {groups.length} row{groups.length === 1 ? '' : 's'}.)
                </span>
              </>
            )}
          </p>
          <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="bb-btn-secondary"
              onClick={handleSuggestMappings}
              disabled={pending || aiSuggesting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Sparkles size={14} aria-hidden="true" />
              Re-run AI mapping
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>
              Optional &mdash; only if you want fresh suggestions.
            </span>
          </div>
          {aiResultMsg && (
            <p
              className="bb-form-help"
              role="status"
              style={{
                margin: '0.6rem 0 0',
                color: aiNeedsSetup ? '#8C3C2A' : 'var(--color-ink-soft)',
              }}
            >
              {aiResultMsg}
            </p>
          )}
        </StepCard>
      )}

      {/* Anchor target so the success-step CTA can scroll the user
          straight to the first field card. */}
      <div ref={fieldsAreaRef} />


      {/* v27.1.1.0.3c.5: render groups instead of raw fields. Three group
          kinds: 'single' (no siblings), 'simple-mirror' (slots 1..N, N<=5
          contiguous — slot 1 visible, siblings tucked under <details>),
          'complex' (everything else — fully collapsed accordion). */}
      {groups.map((g) => {
        if (g.kind === 'single') {
          return renderFieldRow(g.field)
        }
        if (g.kind === 'simple-mirror') {
          return (
            <div key={`simple-${g.base}`} className="bb-tile" style={{ padding: 0 }}>
              <div style={{ padding: '0.5rem 1rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-copper)', letterSpacing: '0.04em' }}>
                  {g.siblings.length + 1} HUNTERS · MIRRORED
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-soft)' }}>
                  Map Hunter 1 below — slots {g.siblings.map((s) => parseFieldNameInline(s.name).slot || '?').join(', ')} inherit on save.
                </span>
              </div>
              {renderFieldRow(g.primary)}
              <details style={{ padding: '0 1rem 0.875rem' }}>
                <summary style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)', cursor: 'pointer', padding: '0.4rem 0' }}>
                  Edit Hunter 2-{g.siblings.length + 1} individually ({g.siblings.length} field{g.siblings.length === 1 ? '' : 's'})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                  {g.siblings.map(renderFieldRow)}
                </div>
              </details>
            </div>
          )
        }
        // complex group — single accordion with all fields nested.
        return (
          <details key={`complex-${g.base}`} className="bb-tile" style={{ padding: '0.875rem 1rem' }}>
            <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{g.base}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-soft)' }}>
                {g.fields.length} sequential fields &mdash; tap to map individually
              </span>
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.6rem' }}>
              {g.fields.map(renderFieldRow)}
            </div>
          </details>
        )
      })}

      {saveError && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          {saveError}
        </p>
      )}

      {/* v27.1.1.0.3d.2.4: Step 5 — Mark mapping complete. Promoted from
          a tight save bar to a full step card with primary CTA + helper
          copy + status indicator. */}
      <StepCard
        stepNumber={5}
        title="Done? Mark this mapping complete"
        tone="copper"
      >
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
          Once you&rsquo;re happy with each row, tap below. The auto-fill engine will use
          these mappings on every report you generate. You can come back to edit anytime.
        </p>
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="bb-cta"
            onClick={() => save(true)}
            disabled={pending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {completedAt !== null
              ? 'Saved + marked complete'
              : pending
              ? 'Working…'
              : 'Mark mapping complete'}
          </button>
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => save(false)}
            disabled={pending}
          >
            {savedAt !== null && completedAt === null ? 'Saved' : pending ? 'Saving…' : 'Save draft'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
            Status: <strong>{currentStatus}</strong>
          </span>
        </div>
        {savedAt !== null && mirroredCount > 0 && (
          <p
            className="bb-form-help"
            style={{ margin: '0.6rem 0 0', color: 'var(--color-copper)' }}
          >
            Updated {mirroredCount} mirrored field{mirroredCount === 1 ? '' : 's'} across slots.
          </p>
        )}
      </StepCard>
    </section>
  )
}

// v27.1.1.0.3d.2.4: shared step-card layout. Number badge + title +
// children body. Three tones: 'copper' (primary action), 'success'
// (post-AI green-ish), 'ink' (neutral, for the review step).
function StepCard({
  stepNumber,
  title,
  tone,
  centerBody,
  children,
}: {
  stepNumber: number
  title: string
  tone: 'copper' | 'success' | 'ink'
  centerBody?: boolean
  children: React.ReactNode
}) {
  const accent =
    tone === 'success'
      ? '#3F6B3A'
      : tone === 'ink'
      ? 'var(--color-ink-soft)'
      : 'var(--color-copper)'
  const bg =
    tone === 'success'
      ? 'linear-gradient(180deg, rgba(78, 130, 70, 0.10), rgba(78, 130, 70, 0.02))'
      : tone === 'ink'
      ? undefined
      : 'linear-gradient(180deg, rgba(168, 92, 50, 0.06), rgba(168, 92, 50, 0.01))'
  return (
    <div
      className="bb-tile"
      style={{
        padding: '1rem',
        background: bg,
        borderColor: tone === 'copper' ? 'var(--color-copper)' : undefined,
        borderWidth: tone === 'copper' ? '1.5px' : undefined,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.4rem',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.5rem',
            height: '1.5rem',
            borderRadius: 999,
            background: accent,
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {stepNumber}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--color-ink)',
          }}
        >
          {title}
        </h3>
      </div>
      <div style={centerBody ? { textAlign: 'center' } : undefined}>{children}</div>
    </div>
  )
}

// v27.1.1.0.3c.5: field grouping for the wizard list. Three kinds:
//
//   single        — no siblings, render as a normal FieldRow.
//   simple-mirror — 2..5 siblings with slots [1..N] contiguous (after
//                   implicit-1 promotion). Slot 1 renders as the visible
//                   primary; slots 2..N tuck under <details>. Mirror
//                   covers them on save so the guide doesn't need to
//                   touch each one.
//   complex       — anything else (sequential 6+ slots like CDFW's 10x
//                   SPECIES TAKEN with hunter×species 2D layout, or
//                   non-contiguous slot ranges). Renders as one
//                   <details> accordion with all fields nested. Guide
//                   maps each individually but the row count drops to 1.
//
// Order: groups appear in the order their primary field first appears
// in the PDF's natural form-tab order (preserving the guide's mental
// flow through the document).
type FieldGroup =
  | { kind: 'single'; field: DocPdfField }
  | { kind: 'simple-mirror'; base: string; primary: DocPdfField; siblings: DocPdfField[] }
  | { kind: 'complex'; base: string; fields: DocPdfField[] }

function buildFieldGroups(
  fields: DocPdfField[] | null,
  slotOverrides: Record<string, number>
): FieldGroup[] {
  if (!fields || fields.length === 0) return []
  // Effective slot per field = manual override > 0 wins, else regex.
  const effSlot = (f: DocPdfField): number => {
    const ov = slotOverrides[f.name] ?? 0
    if (ov > 0) return ov
    return parseFieldNameInline(f.name).slot
  }
  // bucket fields by base
  const byBase = new Map<string, DocPdfField[]>()
  const baseOrder: string[] = []
  for (const f of fields) {
    const base = parseFieldNameInline(f.name).base
    if (!byBase.has(base)) {
      byBase.set(base, [])
      baseOrder.push(base)
    }
    byBase.get(base)!.push(f)
  }
  const out: FieldGroup[] = []
  for (const base of baseOrder) {
    const members = byBase.get(base)!
    if (members.length === 1) {
      out.push({ kind: 'single', field: members[0] })
      continue
    }
    // Group analysis: collect effective slots, find slot 1 primary.
    const slotMap = new Map<number, DocPdfField>()
    for (const m of members) {
      const s = effSlot(m)
      if (!slotMap.has(s)) slotMap.set(s, m)
    }
    const slots = [...slotMap.keys()].filter((s) => s >= 1).sort((a, b) => a - b)
    const primary = slotMap.get(1)
    // Simple-mirror requires: a slot-1 anchor + slots [1..N] contiguous + N <= 5.
    const isContiguous =
      slots.length >= 2 &&
      slots.length <= 5 &&
      slots[0] === 1 &&
      slots.every((s, i) => s === i + 1)
    if (primary && isContiguous) {
      const siblings = slots.slice(1).map((s) => slotMap.get(s)!).filter(Boolean)
      out.push({ kind: 'simple-mirror', base, primary, siblings })
    } else {
      out.push({ kind: 'complex', base, fields: members })
    }
  }
  return out
}

// v27.1.1.0.3c.4: implicit slot-1 derivation, inline mirror of
// harvest-log-fill-types.detectImplicitSlot1. Walks all field names and
// returns a Set of names that should be treated as slot 1 because their
// base has a slot >= 2 sibling (e.g. "FULL NAME" alongside "FULL NAME_2",
// "FULL NAME_3" — common on CDFW-style state forms).
function detectImplicitSlot1Set(fieldNames: string[]): Set<string> {
  const out = new Set<string>()
  const bySlot = new Map<string, Set<number>>()
  for (const raw of fieldNames) {
    const parsed = parseFieldNameInline(raw)
    if (!bySlot.has(parsed.base)) bySlot.set(parsed.base, new Set())
    bySlot.get(parsed.base)!.add(parsed.slot)
  }
  for (const raw of fieldNames) {
    const parsed = parseFieldNameInline(raw)
    if (parsed.slot !== 0) continue
    const slots = bySlot.get(parsed.base)
    if (!slots) continue
    let hasSibling = false
    for (const slot of slots) {
      if (slot >= 2) { hasSibling = true; break }
    }
    if (hasSibling) out.add(raw)
  }
  return out
}

// v27.1.1.0.3c.2: parseFieldName equivalent inline (so wizard doesn't
// import the engine module). Mirror of harvest-log-fill-types.parseFieldName.
// v27.1.1.0.3c.4: regex loosened — adds space separator (` 1`) and parens
// suffix (`(2)`) on top of existing prefix/suffix patterns.
function parseFieldNameInline(name: string): { slot: number; base: string } {
  const prefix = /^(?:hunter|h|row)[\s_-]?(\d+)[\s_-]?(.*)$/i.exec(name)
  if (prefix) {
    const n = Number(prefix[1])
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      return { slot: n, base: (prefix[2] || '').trim() }
    }
  }
  const suffix = /^(.*?)[\s_-](\d+)$/i.exec(name)
  if (suffix) {
    const n = Number(suffix[2])
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      return { slot: n, base: (suffix[1] || '').trim() }
    }
  }
  const parens = /^(.*?)\s*\((\d+)\)$/.exec(name)
  if (parens) {
    const n = Number(parens[2])
    if (Number.isFinite(n) && n >= 1 && n <= 99) {
      return { slot: n, base: (parens[1] || '').trim() }
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

// v27.1.1.0.3c.3: tap-to-edit slot badge. Default render is a pill
// reading "HUNTER N" or "TRIP-LEVEL"; tapping flips it into a small
// inline picker so guides can correct auto-detect when the field name
// doesn't match the regex conventions. Replaces the always-on "Field
// belongs to" dropdown that took up real estate on every field card.
function SlotBadgeButton({
  slot,
  slotOverride,
  detectedSlot,
  onSlotChange,
}: {
  slot: number
  slotOverride: number
  detectedSlot: number
  onSlotChange: (slot: number) => void
}) {
  const [editing, setEditing] = useState(false)
  // v27.1.1.0.3c.4: badge is always tappable, even for slot 0
  // ("TRIP-LEVEL"). State forms with non-standard hunter naming
  // (e.g. CDFW 992-A's bare-name Hunter 1 fields whose siblings live
  // at `_2`/`_3`) need a manual override path. Implicit-1 derivation
  // catches the common case automatically; this badge is the escape
  // hatch for everything else. Trip-level pill stays subtle so hunter
  // pills still pop visually.
  const isOverridden = slotOverride > 0 && slotOverride !== detectedSlot
  const label = slot > 0 ? `HUNTER ${slot}` : 'TRIP-LEVEL'
  if (editing) {
    return (
      <select
        autoFocus
        className="bb-input"
        value={slotOverride}
        onChange={(e) => {
          onSlotChange(Number(e.target.value))
          setEditing(false)
        }}
        onBlur={() => setEditing(false)}
        style={{ fontSize: '0.85rem', padding: '0.15rem 0.45rem', height: 'auto', width: 'auto' }}
        aria-label="Pick which hunter this field belongs to"
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
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${label} (tap to change)`}
      title="Tap to change which hunter this is for"
      style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        border: isOverridden ? '1px solid var(--color-copper)' : '1px solid transparent',
        background: slot > 0 ? 'rgba(168, 92, 50, 0.12)' : 'var(--color-paper-tint)',
        color: slot > 0 ? 'var(--color-copper)' : 'var(--color-ink-soft)',
        letterSpacing: '0.04em',
        cursor: 'pointer',
        lineHeight: 1.4,
      }}
    >
      {label}
      {isOverridden ? ' ·' : ''}
    </button>
  )
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
  isAiSuggested,
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
  isAiSuggested: boolean
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
          {/* v27.1.1.0.3d: AI suggestion badge. Surfaces only while the
              guide hasn't confirmed/edited the row. Editing or saving
              clears it. */}
          {isAiSuggested && (
            <span
              aria-label="AI-suggested mapping — review and confirm"
              title="AI-suggested mapping. Review the dropdown below and save (or edit) to confirm."
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 999,
                background: 'rgba(168, 92, 50, 0.14)',
                color: 'var(--color-copper)',
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <Sparkles size={11} aria-hidden="true" />
              AI
            </span>
          )}
          {/* v27.1.1.0.3c.3: tap-to-edit slot badge. Default state shows
              the auto-detected slot or "Trip-level"; tapping reveals an
              inline picker so guides can override only when needed.
              The dedicated "Field belongs to" select below is removed. */}
          <SlotBadgeButton
            slot={slot}
            slotOverride={slotOverride}
            detectedSlot={detectedSlot}
            onSlotChange={(s) => onSlotChange(field.name, s)}
          />
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

      {/* v27.1.1.0.3c.3: standalone slot picker dropdown removed. The
          "Hunter N" / "Trip-level" badge above is the new tap-to-edit
          UI for slot assignment. */}

      {/* v27.1.1.0.3c.2: mirror tag + override toggle. Renders only on
          slot 2..N fields whose base name has a saved Hunter 1 source.
          When isOverride=false, the dropdown is read-only and shows the
          mirrored value. Toggle on -> dropdown becomes editable.
          v27.1.1.0.3c.3: copy refresh — "Use a different value for this
          hunter" reads more naturally than "Use a different source for
          this slot" to a non-technical guide. */}
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
            {isOverride ? 'Custom value for this hunter' : 'Same as Hunter 1'}
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
            Use a different value for this hunter
          </label>
        </div>
      )}

      {/* v27.1.1.0.3c.3: relabel "Source" to plain English. */}
      <label
        className="bb-form-label"
        htmlFor={`src-${field.name}`}
        style={{ marginBottom: '0.2rem' }}
      >
        Fill this field with
      </label>
      <select
        id={`src-${field.name}`}
        className="bb-input"
        value={mirrorPath !== null && !isOverride && slot >= 2 ? mirrorPath : dropdownValue}
        onChange={(e) => onChange(field.name, e.target.value)}
        disabled={mirrorPath !== null && !isOverride && slot >= 2}
      >
        <option value="">— Skip — leave blank —</option>
        {CATEGORY_ORDER.map((cat) =>
          grouped[cat].length > 0 ? (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {grouped[cat].map((src) => (
                <option key={`${cat}:${src.value}`} value={src.value}>
                  {src.label}
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
