'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
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
  DATA_SOURCES,
  SKIP_VALUE,
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
  existingFallbackByField,
  existingSlotByField,
  existingOverrideByField,
  existingAiSuggestedByField,
  existingAiSuggestedPathByField,
  existingAiSuggestedSlotByField,
  currentStatus,
}: {
  docId: string
  docKind: 'log' | 'waiver'
  existingByField: Record<string, string>
  existingFallbackByField: Record<string, string>
  existingSlotByField: Record<string, number>
  existingOverrideByField: Record<string, boolean>
  existingAiSuggestedByField: Record<string, boolean>
  existingAiSuggestedPathByField: Record<string, string>
  existingAiSuggestedSlotByField: Record<string, number>
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

  // v27.1.1.0.3e.5: per-field optional fallback path. Hydrated from
  // doc_field_mappings.fallback_path. Empty/missing entry = no fallback;
  // dropdown is hidden until the guide taps "+ Add fallback source". The
  // engine evaluates primary first, falls through here if primary is
  // empty. Lets a single PDF field accept either-or sources (e.g. CDFW
  // "TAG / REPORT CARD").
  const [fallbacks, setFallbacks] = useState<Record<string, string>>(
    () => ({ ...existingFallbackByField })
  )

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

  // v27.1.5.4: "Show advanced" toggle. Hides the slot picker pill,
  // override toggle, AI restore link, and "+ Add fallback source" link
  // by default so most guides see only:
  //   field name + type pill + source dropdown + AI badge.
  // Power users flip it on to reveal the full toolkit. Persists per
  // browser via localStorage so re-visits respect the prior choice.
  // Initialized false on the server / first paint so SSR + first-render
  // markup match; the useEffect below hydrates from localStorage on
  // mount.
  const [advancedMode, setAdvancedMode] = useState<boolean>(false)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const saved = window.localStorage.getItem('bb-mapping-wizard-advanced')
      if (saved === '1') setAdvancedMode(true)
    } catch {
      // localStorage can throw in strict-privacy modes; default-off is fine.
    }
  }, [])
  function handleToggleAdvanced(next: boolean) {
    setAdvancedMode(next)
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem('bb-mapping-wizard-advanced', next ? '1' : '0')
    } catch {
      // ignore — UI state still flips, just doesn't persist.
    }
  }
  // v27.1.1.0.3d.2.2: success banner. Flips true for 3 seconds after a
  // successful suggestion run; renders an "✨ AI suggested N fields"
  // toast with a green-ish copper accent before collapsing.
  const [aiSuccessCount, setAiSuccessCount] = useState<number | null>(null)

  // v27.3.10.3 — design pass on the field list. Replaces the long flat
  // groups.map() render with: a sticky toolbar (search + filter chips +
  // re-run AI), slot-grouped sections (Trip-level + Hunter 1..N) with
  // tap-to-collapse headers, and a compact "name → source · status" row
  // that expands inline to the existing FieldRow editor on tap. The goal
  // is to keep 50+ field forms (DFW 992b ext) scannable without
  // sacrificing any of the existing edit affordances.
  // v27.3.10.5 item 3: REVERT 10.4 default-expanded. Flavio's actual
  // ask was "collapsed sections so the user can see just the title of
  // each section, then expand one at a time." Two state flips:
  //   1. expandedSlots (default empty = ALL sections collapsed). Click
  //      a section header to expand its rows.
  //   2. expandedFields (default empty = rows render in compact summary
  //      form). Click a row to expand its full editor.
  // The flow: collapsed sections → click header → see compact rows →
  // click row → expand editor. One section, one row at a time.
  const [expandedSlots, setExpandedSlots] = useState<Set<number>>(new Set())
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState<string>('')
  type FilterMode = 'all' | 'mapped' | 'needs-review' | 'skipped' | 'log-time'
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  function toggleFieldExpanded(fieldName: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev)
      if (next.has(fieldName)) next.delete(fieldName)
      else next.add(fieldName)
      return next
    })
  }
  function toggleSlotExpanded(slot: number) {
    setExpandedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slot)) next.delete(slot)
      else next.add(slot)
      return next
    })
  }
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

  // v27.1.1.0.3e.5: fallback dropdown handler. Empty string clears the
  // fallback. Picker sentinels (static text/date/date-range) are NOT
  // surfaced as options — fallback only supports clean path-based
  // sources to keep the UI simple. Static literals belong on primary.
  function handleFallbackChange(fieldName: string, value: string) {
    setFallbacks((prev) => {
      const next = { ...prev }
      if (!value) delete next[fieldName]
      else next[fieldName] = value
      return next
    })
    setSavedAt(null)
    setCompletedAt(null)
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
      // v27.1.1.0.3d.2.9: no auto-collapse — Step 3 stays visible until
      // the guide taps the "See the suggestions →" CTA. Time-driven
      // dismissal was vanishing before users could read it.
    })
  }

  function handleOverrideToggle(fieldName: string, isOverride: boolean) {
    setOverrideFlags((prev) => ({ ...prev, [fieldName]: isOverride }))
    setSavedAt(null)
    setCompletedAt(null)
  }

  // v27.1.1.0.3d.2.8: revert a manually-edited row back to the AI's
  // original suggestion. Operates client-side only — guide saves at the
  // bottom to persist. Doesn't re-run the AI.
  function handleRestoreAiSuggestion(fieldName: string) {
    const aiPath = existingAiSuggestedPathByField[fieldName]
    const aiSlot = existingAiSuggestedSlotByField[fieldName]
    if (!aiPath) return
    setSelection((prev) => ({ ...prev, [fieldName]: aiPath }))
    if (typeof aiSlot === 'number') {
      setSlotOverrides((prev) => ({ ...prev, [fieldName]: aiSlot }))
    }
    setAiSuggestedFlags((prev) => ({ ...prev, [fieldName]: true }))
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
  // v27.1.1.0.3d.2.8: tightened auto-run heuristic. Engages aiPending
  // ONLY when the doc has zero rows in doc_field_mappings AT ALL (which
  // also implies status='unmapped'). Previous logic could fire on a
  // partially-mapped doc when transient fetch state made existingByField
  // briefly empty, sending the wizard into a Step 2 → Step 1 loop on
  // revisit even though the 82 saved rows existed in the DB.
  // v27.3.10.8 item 1: AI auto-poll only fires for log kinds. Waivers
  // get manual mapping only — no AI Step 1/2/3 onboarding, no
  // background polling.
  const initialIsEmpty =
    docKind === 'log' &&
    Object.keys(existingByField).length === 0 &&
    Object.keys(existingAiSuggestedByField).length === 0 &&
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
      // v27.1.1.0.3d.2.9: no auto-collapse here either — same reason
      // as the manual path. Banner stays until the user taps the CTA.
      setAiSuccessCount(additions)
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
      // v27.1.1.0.3e.5: include optional fallback. Bare-prefix sentinels
      // are filtered out the same way the primary path is — fallback only
      // ships when the guide has actually picked a known source.
      const rawFb = fallbacks[f.name] ?? ''
      const fbBarePrefix =
        rawFb === STATIC_TEXT_PREFIX ||
        rawFb === STATIC_DATE_PREFIX ||
        rawFb === STATIC_DATE_RANGE_PREFIX
      const fallback_path = fbBarePrefix || !rawFb ? null : rawFb
      out.push({
        field_name: f.name,
        data_source_path: finalPath,
        fallback_path,
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
        // v27.1.1.0.3d.2.10: after marking complete, send the guide to
        // the docs library so they land somewhere useful with a sense
        // of "I'm done". `?just_completed=<docId>` lets the library
        // show a one-time success banner.
        router.push(`/app/docs?just_completed=${encodeURIComponent(docId)}`)
        return
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

  // v27.3.10.3: buildFieldGroups (base-name simple-mirror/complex
  // grouping) retired in favor of slot-based sectioning below — the
  // helper + FieldGroup type are kept in this file for potential
  // future re-use, but no longer drive the render. computeSlot1ByBase
  // stays — renderFieldRow still consults it for the mirror dropdown
  // affordance on slot >= 2 fields.
  const slot1Anchors = computeSlot1ByBase(fields, selection, slotOverrides)

  // v27.3.10.3: per-field effective slot. Manual override > 0 wins,
  // else regex auto-detect via parseFieldNameInline. Slot 0 = trip-level.
  function effSlotForField(f: DocPdfField): number {
    const ov = slotOverrides[f.name] ?? 0
    if (ov > 0) return ov
    return parseFieldNameInline(f.name).slot
  }

  // v27.3.10.3: per-field status — drives the colored pill. Order of
  // precedence: needs-review (AI hasn't been confirmed) > log-time
  // (will be filled at hunt log entry time) > skipped (no source) >
  // mapped (any other path).
  type FieldStatus = 'mapped' | 'log-time' | 'needs-review' | 'skipped'
  function statusForField(fieldName: string): FieldStatus {
    if (aiSuggestedFlags[fieldName] === true) return 'needs-review'
    const sel = selection[fieldName] ?? ''
    if (!sel || sel === SKIP_VALUE) return 'skipped'
    if (
      sel === STATIC_TEXT_PREFIX ||
      sel === STATIC_DATE_PREFIX ||
      sel === STATIC_DATE_RANGE_PREFIX
    ) {
      return 'skipped'
    }
    if (sel === 'user_input.log_time') return 'log-time'
    return 'mapped'
  }

  // v27.3.10.3: short human label for the chosen source, for the
  // compact row "→ <source>" hint. Falls back to "Skipped" / "AI
  // suggestion" / static literal display. Kept short so 50+ field
  // forms stay scannable on mobile.
  function shortSourceLabel(fieldName: string): string {
    const status = statusForField(fieldName)
    if (status === 'skipped') return 'Skipped'
    const sel = selection[fieldName] ?? ''
    if (isStaticText(sel)) {
      const v = staticTextValue(sel)
      return v ? `"${v}"` : 'Static text'
    }
    if (isStaticDate(sel)) {
      return staticDateValue(sel) || 'Static date'
    }
    if (isStaticDateRange(sel)) {
      const { start, end } = staticDateRangeValue(sel)
      return start && end ? `${start} → ${end}` : 'Date range'
    }
    if (sel === 'user_input.log_time') return 'Filled at log entry'
    const found = DATA_SOURCES.find((s) => s.value === sel)
    return found?.label ?? sel
  }

  // v27.3.10.3: counts per filter chip — shown inline so the guide
  // can see at a glance how many "Needs review" rows remain.
  const filterCounts = (() => {
    const c = { all: 0, mapped: 0, 'needs-review': 0, skipped: 0, 'log-time': 0 }
    for (const f of fields ?? []) {
      c.all++
      c[statusForField(f.name)]++
    }
    return c
  })()

  // v27.3.10.3: filter predicate — combines search query + filter chip.
  function passesFilter(f: DocPdfField): boolean {
    const q = searchQuery.trim().toLowerCase()
    if (q && !f.name.toLowerCase().includes(q)) return false
    if (filterMode === 'all') return true
    return statusForField(f.name) === filterMode
  }

  // v27.3.10.3: slot-based sectioning. Each section keeps the natural
  // PDF tab order of its fields. Slots present are sorted ascending so
  // Trip-level (0) → Hunter 1 → Hunter 2 → ... reads top-to-bottom.
  const sections = (() => {
    const bySlot = new Map<number, DocPdfField[]>()
    for (const f of fields ?? []) {
      const s = effSlotForField(f)
      if (!bySlot.has(s)) bySlot.set(s, [])
      bySlot.get(s)!.push(f)
    }
    const slots = [...bySlot.keys()].sort((a, b) => a - b)
    return slots.map((slot) => ({ slot, members: bySlot.get(slot)! }))
  })()

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

  // v27.1.1.0.3d.2.10: scrollToFirstField removed — Step 3 is now a
  // passive info banner with no CTA. Field cards render directly below
  // it, so scrolling is implicit. fieldsAreaRef stays for ref stability
  // but is no longer dereferenced.

  function renderFieldRow(f: DocPdfField) {
    const parsed = parseFieldNameInline(f.name)
    const effSlot = (slotOverrides[f.name] ?? 0) > 0
      ? (slotOverrides[f.name] ?? 0)
      : parsed.slot
    // v27.3.10.8 item 2 — paired-aware mirror path lookup. For paired
    // bases (e.g. "Tag Report Card 1..10" CDFW pattern), key by
    // (base, species_idx) so Hunter 2..N species 1 inherits from
    // Hunter 1 species 1 — NOT the last-iteration slot-1 entry which
    // collapsed across species_idx and overwrote Hunter 2..N's
    // alternating species mappings.
    let mirrorPath: string | null = null
    if (effSlot >= 2) {
      if (slot1Anchors.pairedBases.has(parsed.base)) {
        const speciesIdx = ((parsed.slot - 1) % 2) + 1
        mirrorPath = slot1Anchors.byBaseSpecies.get(`${parsed.base}|${speciesIdx}`) ?? null
      } else {
        mirrorPath = slot1Anchors.byBase.get(parsed.base) ?? null
      }
    }
    // v27.1.1.0.3d.2.8: surface "Use AI suggestion" link when guide has
    // edited away from AI's original recommendation.
    const aiOriginalPath = existingAiSuggestedPathByField[f.name] ?? null
    const currentPath = selection[f.name] ?? ''
    const aiDiffers =
      aiOriginalPath !== null &&
      aiOriginalPath !== '' &&
      aiOriginalPath !== currentPath
    return (
      <FieldRow
        key={f.name}
        field={f}
        value={currentPath}
        fallbackValue={fallbacks[f.name] ?? ''}
        staticText={staticText[f.name] ?? ''}
        staticDate={staticDate[f.name] ?? ''}
        rangeStart={rangeStart[f.name] ?? ''}
        rangeEnd={rangeEnd[f.name] ?? ''}
        slotOverride={slotOverrides[f.name] ?? 0}
        isOverride={overrideFlags[f.name] === true}
        isAiSuggested={aiSuggestedFlags[f.name] === true}
        aiOriginalPath={aiDiffers ? aiOriginalPath : null}
        mirrorPath={mirrorPath}
        advanced={advancedMode}
        onChange={handleDropdownChange}
        onFallbackChange={handleFallbackChange}
        onStaticTextChange={handleStaticTextChange}
        onStaticDateChange={handleStaticDateChange}
        onRangeChange={handleRangeChange}
        onSlotChange={handleSlotChange}
        onOverrideToggle={handleOverrideToggle}
        onRestoreAi={handleRestoreAiSuggestion}
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
          (re-run path with small auto-suggest button).
          v27.3.10.8 item 1: Steps 1, 2, 3 + Re-run AI surfaces are
          gated to log kinds. Waivers go straight to manual mapping —
          no AI flow at all. The signature-placement wizard is the
          waiver-side automation, separate from this flow. */}
      {docKind === 'log' && stage === 'start' && (
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

      {docKind === 'log' && stage === 'working' && (
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

      {docKind === 'log' && stage === 'success' && (
        <div
          className="bb-tile"
          style={{
            padding: '0.875rem 1rem',
            background:
              'linear-gradient(180deg, rgba(78, 130, 70, 0.10), rgba(78, 130, 70, 0.02))',
            borderColor: '#3F6B3A',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
          role="status"
          aria-live="polite"
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontWeight: 700,
              color: '#3F6B3A',
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            AI suggested {aiSuccessCount ?? 0} field{aiSuccessCount === 1 ? '' : 's'}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
            We pre-filled mappings for {aiSuccessCount} field{aiSuccessCount === 1 ? '' : 's'}.
            Review them below &mdash; edit anything wrong, then tap{' '}
            <strong>Mark mapping complete</strong> at the bottom when you&rsquo;re done.
          </span>
        </div>
      )}

      {/* v27.3.10.5 item 5: once the doc has been marked complete at
          least once (currentStatus === 'complete'), Step 3 + Step 4
          collapse to a single compact button row.
          v27.3.10.6 item 1: hide Step 4 / the compact button row while
          Step 2 is running (stage === 'working'). Prevents accidental
          "Mapping Complete" taps before the AI returns its mappings.
          v27.3.10.6 item 1: also drop the "Save draft" button — guides
          weren't using it; the auto-save inside the editor is the
          implicit save.
          v27.3.10.6 item 2: CTA copy "Mark mapping complete" →
          "Mapping Complete" (one word shorter, simpler). */}
      {stage !== 'working' && (() => {
        const mappingPreviouslyCompleted = currentStatus === 'complete'

        if (mappingPreviouslyCompleted) {
          return (
            <div
              className="bb-tile"
              style={{
                padding: '0.7rem 1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <button
                type="button"
                className="bb-cta-sm"
                onClick={() => save(true)}
                disabled={pending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <CheckCircle2 size={14} aria-hidden="true" />
                {completedAt !== null
                  ? 'Saved + complete'
                  : pending
                  ? 'Working…'
                  : 'Mapping Complete'}
              </button>
              {docKind === 'log' && (
                <button
                  type="button"
                  className="bb-btn-secondary"
                  onClick={handleSuggestMappings}
                  disabled={pending || aiSuggesting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Re-run AI
                </button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
                Status: <strong>{currentStatus}</strong>
              </span>
              {savedAt !== null && mirroredCount > 0 && (
                <p
                  className="bb-form-help"
                  style={{ flexBasis: '100%', margin: '0.3rem 0 0', color: 'var(--color-copper)' }}
                >
                  Updated {mirroredCount} mirrored field{mirroredCount === 1 ? '' : 's'} across slots.
                </p>
              )}
              {aiResultMsg && (
                <p
                  className="bb-form-help"
                  role="status"
                  style={{
                    flexBasis: '100%',
                    margin: '0.3rem 0 0',
                    color: aiNeedsSetup ? '#8C3C2A' : 'var(--color-ink-soft)',
                  }}
                >
                  {aiResultMsg}
                </p>
              )}
            </div>
          )
        }

        // First-time mapping flow: full StepCards 3 + 4.
        // v27.3.10.8 item 1: Step 3 (Review your mappings + Re-run AI)
        // is log-only. Waivers skip it.
        return (
          <>
            {docKind === 'log' && stage === 'review' && (
              <StepCard
                stepNumber={3}
                title="Review your mappings"
                tone="ink"
              >
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-soft)' }}>
                  Look for the <strong>✨ AI</strong> badge on each row &mdash; that&rsquo;s a
                  suggestion. Edit anything wrong, then tap{' '}
                  <strong>Mapping Complete</strong> at the bottom when you&rsquo;re done.
                  Anything left on &ldquo;Skip&rdquo; stays blank in the final PDF.
                  {fields.length > 0 && (
                    <>
                      {' '}
                      <span style={{ color: 'var(--color-ink-soft)' }}>
                        ({fields.length} total box{fields.length === 1 ? '' : 'es'} across{' '}
                        {sections.length} section{sections.length === 1 ? '' : 's'}.)
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

            {/* v27.3.7 item 8 — Step 4 promoted to TOP of the wizard
                so the "I'm done" CTA is in reach without scrolling past
                dozens of field rows. */}
            <StepCard
              stepNumber={4}
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
                  alignItems: 'stretch',
                }}
              >
                <button
                  type="button"
                  className="bb-cta"
                  onClick={() => save(true)}
                  disabled={pending}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    width: '100%',
                    maxWidth: '24rem',
                  }}
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {completedAt !== null
                    ? 'Saved + complete'
                    : pending
                    ? 'Working…'
                    : 'Mapping Complete'}
                </button>
                <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
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
          </>
        )
      })()}

      {/* Anchor target so the success-step CTA can scroll the user
          straight to the first field card. */}
      <div ref={fieldsAreaRef} />

      {/* v27.1.5.4: "Show advanced" toggle. Hides slot picker pill,
          override checkbox, AI restore link, and +Add fallback link by
          default so the wizard reads as a clean source-pick-per-field
          flow. Default OFF; persists per browser via localStorage. */}
      {fields.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.1rem 0',
          }}
        >
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              color: 'var(--color-ink-soft)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={(e) => handleToggleAdvanced(e.target.checked)}
            />
            Show advanced
          </label>
        </div>
      )}

      {/* v27.3.10.3: real design pass on the field list. Replaces the
          long flat groups.map() with: a sticky toolbar (search + filter
          chips + Re-run AI), slot-grouped sections (Trip-level, Hunter
          1..N) with sticky tap-to-collapse headers showing field counts
          + status summary, and a compact name → source · status row
          that expands inline to the existing FieldRow editor on tap.
          Mirror save logic at line 690 (renderFieldRow's mirrorPath)
          is unchanged — slot 2..N rows still inherit slot 1 unless the
          guide flips override in advanced mode. The grouping just
          changes what's *visible by default*; the underlying state +
          save payload is identical to v27.3.10.2.

          Why slot grouping over the prior 'simple-mirror' / 'complex'
          group kinds: on real DFW 50+ field forms (multi-hunter +
          paired tag/report card columns) the base-name grouping
          collapsed unrelated rows together and hid slot 2..N siblings
          behind <details>. Slot grouping reads more naturally — guides
          mentally walk the form per-hunter — and surfaces each hunter
          section with a status summary so the guide knows where to
          focus review effort. */}

      <MappingToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterMode={filterMode}
        onFilterChange={setFilterMode}
        filterCounts={filterCounts}
        onRerunAi={handleSuggestMappings}
        rerunDisabled={pending || aiSuggesting}
        showRerunAi={docKind === 'log'}
      />

      {sections.map(({ slot, members }) => {
        const visible = members.filter(passesFilter)
        if (visible.length === 0) return null
        // v27.3.10.5 item 3: default collapsed; expandedSlots tracks
        // sections the guide has explicitly opened.
        const isCollapsed = !expandedSlots.has(slot)
        // Per-section status summary: count of mapped + needs-review +
        // skipped + log-time across the section's full member list (not
        // filtered) so the header reads consistently regardless of
        // which chip is active.
        const stats = { mapped: 0, 'needs-review': 0, skipped: 0, 'log-time': 0 }
        for (const m of members) stats[statusForField(m.name)]++
        const sectionTitle = slot === 0 ? 'Trip-level' : `Hunter ${slot}`
        // Build the human summary: "8 fields · 6 mapped · 2 needs review"
        const summaryParts: string[] = [`${members.length} field${members.length === 1 ? '' : 's'}`]
        if (stats.mapped > 0) summaryParts.push(`${stats.mapped} mapped`)
        if (stats['needs-review'] > 0) summaryParts.push(`${stats['needs-review']} needs review`)
        if (stats['log-time'] > 0) summaryParts.push(`${stats['log-time']} log-time`)
        if (stats.skipped > 0) summaryParts.push(`${stats.skipped} skipped`)
        return (
          <div key={`section-${slot}`} className="bb-mapping-section">
            <button
              type="button"
              className="bb-mapping-section-head"
              onClick={() => toggleSlotExpanded(slot)}
              aria-expanded={!isCollapsed}
              aria-controls={`section-${slot}-body`}
            >
              <span className="bb-mapping-section-title-wrap">
                <span className="bb-mapping-section-title">{sectionTitle}</span>
                <span className="bb-mapping-section-summary">
                  {summaryParts.map((p, i) => (
                    <span key={i}>
                      {i > 0 ? ' · ' : ''}
                      {i === 0 ? <strong>{p}</strong> : p}
                    </span>
                  ))}
                </span>
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={
                  'bb-mapping-section-chevron' + (isCollapsed ? ' is-collapsed' : '')
                }
              />
            </button>
            {!isCollapsed && (
              <div id={`section-${slot}-body`}>
                {visible.map((f) => {
                  // v27.3.10.5 item 3: default compact; expandedFields
                  // tracks rows the guide has explicitly tapped to open.
                  const isExpanded = expandedFields.has(f.name)
                  if (isExpanded) {
                    return (
                      <div
                        key={f.name}
                        className="bb-mapping-row-expanded"
                      >
                        <button
                          type="button"
                          className="bb-mapping-row-compact"
                          style={{ padding: '0 0 0.4rem', borderBottom: 'none', minHeight: 0 }}
                          onClick={() => toggleFieldExpanded(f.name)}
                          aria-expanded={true}
                          title="Collapse this row"
                        >
                          <StatusPill status={statusForField(f.name)} />
                          <div className="bb-mapping-row-compact-name">
                            <span className="bb-mapping-row-compact-label">{f.name}</span>
                          </div>
                          <ChevronDown
                            size={16}
                            aria-hidden="true"
                            className="bb-mapping-row-compact-chevron"
                          />
                        </button>
                        {renderFieldRow(f)}
                      </div>
                    )
                  }
                  return (
                    <button
                      key={f.name}
                      type="button"
                      className="bb-mapping-row-compact"
                      onClick={() => toggleFieldExpanded(f.name)}
                      aria-expanded={false}
                      title="Expand this row to edit"
                    >
                      <StatusPill status={statusForField(f.name)} />
                      <div className="bb-mapping-row-compact-name">
                        <span className="bb-mapping-row-compact-label">{f.name}</span>
                        <span className="bb-mapping-row-compact-source">
                          <span className="bb-mapping-row-compact-source-arrow">→</span>
                          {shortSourceLabel(f.name)}
                        </span>
                      </div>
                      <ChevronRight
                        size={16}
                        aria-hidden="true"
                        className="bb-mapping-row-compact-chevron"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Empty state when search + filter combination matches nothing. */}
      {sections.every(({ members }) => members.filter(passesFilter).length === 0) && (
        <div className="bb-mapping-empty" role="status">
          No fields match your search or filter.
          {(searchQuery || filterMode !== 'all') && (
            <>
              {' '}
              <button
                type="button"
                className="bb-text-action"
                onClick={() => {
                  setSearchQuery('')
                  setFilterMode('all')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-copper)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      )}

      {saveError && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          {saveError}
        </p>
      )}

      {/* v27.3.7 item 8 — Step 4 footer card removed; the Mark-complete
          CTA was promoted to the top of the wizard so it's reachable
          without scrolling past every field row. */}
    </section>
  )
}

// v27.1.1.0.3d.2.4: shared step-card layout. Number badge + title +
// children body. Three tones: 'copper' (primary action), 'success'
// (post-AI green-ish), 'ink' (neutral, for the review step).
// v27.1.1.0.3d.2.8: resolve a catalog path to its human label so the
// "AI suggested: <label> — use this" link reads like prose. Falls back
// to the raw path when the source isn't in the slot-filtered list.
function aiOriginalLabel(path: string, sources: DataSourceOption[]): string {
  if (path === SKIP_VALUE || !path) return 'Skip — leave blank'
  if (isStaticText(path)) return `"${staticTextValue(path)}"`
  if (isStaticDate(path)) return staticDateValue(path)
  const match = sources.find((s) => s.value === path)
  if (match) return match.label
  // Search the full catalog as a fallback (slot filter may exclude it).
  const fallback = DATA_SOURCES.find((s) => s.value === path)
  return fallback?.label ?? path
}

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

// v27.3.10.8 item 2 — paired-row-aware slot-1 lookup.
//
// Walk current wizard state to derive slot-1 paths. For non-paired bases,
// keyed by base only (returned in `byBase`). For paired bases, keyed by
// `${base}|${species_idx}` (returned in `byBaseSpecies`) so Hunter 2..N
// species 1 mirrors from Hunter 1 species 1 and Hunter 2..N species 2
// mirrors from Hunter 1 species 2 — NOT both collapsed to the
// last-iteration slot-1 entry (the recurring v27.3.10.x bug).
//
// Used by renderFieldRow to surface the "Mirrored from Hunter 1"
// affordance + the inherited dropdown value live, before save
// round-trips.
function computeSlot1ByBase(
  fields: DocPdfField[] | null,
  selection: Record<string, string>,
  slotOverrides: Record<string, number>
): { byBase: Map<string, string>; byBaseSpecies: Map<string, string>; pairedBases: Set<string> } {
  const byBase = new Map<string, string>()
  const byBaseSpecies = new Map<string, string>()
  const fieldNames = (fields ?? []).map((f) => f.name)
  const pairedBases = detectPairedBasesInline(fieldNames)
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
    if (effSlot !== 1) continue
    if (pairedBases.has(parsed.base)) {
      const speciesIdx = ((parsed.slot - 1) % 2) + 1
      byBaseSpecies.set(`${parsed.base}|${speciesIdx}`, sel)
    } else {
      byBase.set(parsed.base, sel)
    }
  }
  return { byBase, byBaseSpecies, pairedBases }
}

// v27.3.10.8 — inlined paired-base detection (mirrors detectPairedBases
// in harvest-log-fill-types.ts; the wizard is a 'use client' module
// that already keeps a parseFieldNameInline copy of parseFieldName
// rather than importing it, so the same pattern applies here).
const PAIRED_BASE_REGEX_INLINE = /\b(tag|report|species|kept|released)\b/i
function detectPairedBasesInline(fieldNames: string[]): Set<string> {
  const byBase = new Map<string, number[]>()
  for (const raw of fieldNames) {
    const parsed = parseFieldNameInline(raw)
    if (parsed.slot === 0 || !parsed.base) continue
    const arr = byBase.get(parsed.base) ?? []
    arr.push(parsed.slot)
    byBase.set(parsed.base, arr)
  }
  const out = new Set<string>()
  for (const [base, slots] of byBase) {
    if (!PAIRED_BASE_REGEX_INLINE.test(base)) continue
    if (slots.length < 4) continue
    slots.sort((a, b) => a - b)
    const maxSlot = slots[slots.length - 1]
    if (maxSlot < 4 || maxSlot % 2 !== 0) continue
    out.add(base)
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

// v27.3.10.3: sticky top toolbar for the redesigned wizard. Search
// input + filter chips (with live counts) + Re-run AI button. Wraps
// to two rows on phones.
function MappingToolbar({
  searchQuery,
  onSearchChange,
  filterMode,
  onFilterChange,
  filterCounts,
  onRerunAi,
  rerunDisabled,
  showRerunAi,
}: {
  searchQuery: string
  onSearchChange: (v: string) => void
  filterMode: 'all' | 'mapped' | 'needs-review' | 'skipped' | 'log-time'
  onFilterChange: (v: 'all' | 'mapped' | 'needs-review' | 'skipped' | 'log-time') => void
  filterCounts: { all: number; mapped: number; 'needs-review': number; skipped: number; 'log-time': number }
  onRerunAi: () => void
  rerunDisabled: boolean
  // v27.3.10.8 item 1: false on waivers (no AI flow at all).
  showRerunAi: boolean
}) {
  const chips: Array<{
    key: 'all' | 'mapped' | 'needs-review' | 'skipped' | 'log-time'
    label: string
    count: number
  }> = [
    { key: 'all', label: 'All', count: filterCounts.all },
    { key: 'mapped', label: 'Mapped', count: filterCounts.mapped },
    { key: 'needs-review', label: 'Needs review', count: filterCounts['needs-review'] },
    { key: 'log-time', label: 'Log-time', count: filterCounts['log-time'] },
    { key: 'skipped', label: 'Skipped', count: filterCounts.skipped },
  ]
  return (
    <div className="bb-mapping-toolbar">
      <div className="bb-mapping-toolbar-row">
        <div className="bb-mapping-search">
          <Search size={14} aria-hidden="true" className="bb-mapping-search-icon" />
          <input
            type="search"
            placeholder="Search fields…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search PDF field names"
          />
        </div>
        {showRerunAi && (
          <button
            type="button"
            className="bb-mapping-rerun"
            onClick={onRerunAi}
            disabled={rerunDisabled}
            title="Re-run AI mapping suggestions"
          >
            <Sparkles size={13} aria-hidden="true" />
            Re-run AI
          </button>
        )}
      </div>
      <div className="bb-mapping-filters" aria-label="Filter fields by status">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className="bb-mapping-chip"
            aria-pressed={filterMode === c.key}
            onClick={() => onFilterChange(c.key)}
          >
            {c.label}
            <span className="bb-mapping-chip-count">{c.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// v27.3.10.3: status pill for compact rows. Four variants:
// mapped (green) | log-time (blue) | needs-review (copper) | skipped (gray).
function StatusPill({
  status,
}: {
  status: 'mapped' | 'log-time' | 'needs-review' | 'skipped'
}) {
  const className = `bb-status-pill bb-status-pill-${status}`
  const label =
    status === 'mapped'
      ? 'Mapped'
      : status === 'log-time'
      ? 'Log-time'
      : status === 'needs-review'
      ? 'Review'
      : 'Skipped'
  return <span className={className}>{label}</span>
}

function FieldRow({
  field,
  value,
  fallbackValue,
  staticText,
  staticDate,
  rangeStart,
  rangeEnd,
  slotOverride,
  isOverride,
  isAiSuggested,
  aiOriginalPath,
  mirrorPath,
  advanced,
  onChange,
  onFallbackChange,
  onStaticTextChange,
  onStaticDateChange,
  onRangeChange,
  onSlotChange,
  onOverrideToggle,
  onRestoreAi,
}: {
  field: DocPdfField
  value: string
  fallbackValue: string
  staticText: string
  staticDate: string
  rangeStart: string
  rangeEnd: string
  slotOverride: number
  isOverride: boolean
  advanced: boolean
  isAiSuggested: boolean
  aiOriginalPath: string | null
  mirrorPath: string | null
  onChange: (fieldName: string, value: string) => void
  onFallbackChange: (fieldName: string, value: string) => void
  onStaticTextChange: (fieldName: string, value: string) => void
  onStaticDateChange: (fieldName: string, value: string) => void
  onRangeChange: (fieldName: string, which: 'start' | 'end', value: string) => void
  onSlotChange: (fieldName: string, slot: number) => void
  onOverrideToggle: (fieldName: string, isOverride: boolean) => void
  onRestoreAi: (fieldName: string) => void
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
    // v27.3.10.2 item 3 — table-row treatment. Stripped the bb-tile
    // card chrome (no padding bloat, shadow, border-radius) and
    // replaced with a thin border-bottom divider so the field list
    // reads as scannable table rows instead of stacked cards.
    <div
      className="bb-mapping-row"
      style={{
        padding: '0.6rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        borderBottom: '1px solid var(--color-card-divider)',
      }}
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
              aria-label="AI-suggested mapping"
              title="AI-suggested mapping. Edit if it's wrong, otherwise leave it — Mark mapping complete locks everything in at the bottom."
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
              The dedicated "Field belongs to" select below is removed.
              v27.1.5.4: hidden by default behind "Show advanced". The
              auto-detected slot still applies silently; this badge is
              the manual escape hatch. */}
          {advanced && (
            <SlotBadgeButton
              slot={slot}
              slotOverride={slotOverride}
              detectedSlot={detectedSlot}
              onSlotChange={(s) => onSlotChange(field.name, s)}
            />
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
      {/* v27.1.5.4: hidden by default. When advanced is OFF the dropdown
          below still respects the existing isOverride flag (mirrors
          slot 1 unless the guide previously enabled override in
          advanced mode), so behavior is preserved — only the toggle
          UI is hidden. */}
      {advanced && mirrorPath !== null && slot >= 2 && (
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

      {/* v27.1.1.0.3d.2.8: "Use AI suggestion" restore link. Renders only
          when the AI's saved recommendation differs from the guide's
          current pick. Tap reverts data_source_path + hunter_slot to
          the AI values without re-running the whole form.
          v27.1.5.4: also gated to advanced mode — the simple flow only
          shows the source dropdown the guide has now, no "go back to
          AI" affordance. */}
      {advanced && aiOriginalPath !== null && (
        <button
          type="button"
          onClick={() => onRestoreAi(field.name)}
          className="bb-text-action"
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.8rem',
            color: 'var(--color-copper)',
            background: 'transparent',
            border: 'none',
            padding: '0.1rem 0',
            cursor: 'pointer',
          }}
        >
          <Sparkles size={11} aria-hidden="true" />
          AI suggested:{' '}
          <strong>{aiOriginalLabel(aiOriginalPath, sources)}</strong>
          {' '}— use this
        </button>
      )}

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

      {/* v27.1.1.0.3e.5: optional fallback source. Hidden by default;
          "+ Add fallback source" link reveals a secondary dropdown. The
          engine evaluates primary first, falls through here if primary
          returns null/empty. Lets a single PDF field accept either-or
          sources (e.g. CDFW "TAG / REPORT CARD"). Static literals
          (text/date/range) are intentionally NOT surfaced here — fallback
          only supports clean source paths to keep the UI simple.
          v27.1.5.4: hidden behind advanced mode unless a fallback is
          already saved (in which case we always render the editor —
          can't silently strand existing data). */}
      {(advanced || !!fallbackValue) && (
        <FallbackSourceEditor
          fieldName={field.name}
          fallbackValue={fallbackValue}
          sources={sources}
          grouped={grouped}
          primaryDropdownValue={dropdownValue}
          onChange={onFallbackChange}
        />
      )}
    </div>
  )
}

// ── FallbackSourceEditor ────────────────────────────────────────────────
//
// v27.1.1.0.3e.5. Renders a small "+ Add fallback source" link when no
// fallback is set; otherwise renders a labeled dropdown identical to the
// primary picker (sans static-literal pickers) plus a Remove link to
// clear back to no-fallback.
//
// We intentionally exclude the bare-prefix sentinels (STATIC_TEXT_PREFIX
// etc.) from the option list — fallbacks for "Tag or Report Card"-style
// fields are between catalog sources, not literal text.

function FallbackSourceEditor({
  fieldName,
  fallbackValue,
  sources,
  grouped,
  primaryDropdownValue,
  onChange,
}: {
  fieldName: string
  fallbackValue: string
  sources: DataSourceOption[]
  grouped: Record<string, DataSourceOption[]>
  primaryDropdownValue: string
  onChange: (fieldName: string, value: string) => void
}) {
  const expanded = !!fallbackValue
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onChange(fieldName, sources[0]?.value ?? '')}
        className="bb-text-action"
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          fontSize: '0.8rem',
          color: 'var(--color-copper)',
          background: 'transparent',
          border: 'none',
          padding: '0.1rem 0',
          cursor: 'pointer',
        }}
      >
        + Add fallback source
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
        }}
      >
        <label
          className="bb-form-label"
          htmlFor={`fb-${fieldName}`}
          style={{ marginBottom: 0, fontSize: '0.78rem' }}
        >
          If primary source is empty, fill with this instead
        </label>
        <button
          type="button"
          onClick={() => onChange(fieldName, '')}
          className="bb-text-action"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: '0.78rem',
            color: 'var(--color-ink-soft)',
            background: 'transparent',
            border: 'none',
            padding: '0.1rem 0',
            cursor: 'pointer',
          }}
        >
          Remove
        </button>
      </div>
      <select
        id={`fb-${fieldName}`}
        className="bb-input"
        value={fallbackValue}
        onChange={(e) => onChange(fieldName, e.target.value)}
      >
        <option value="">— None —</option>
        {CATEGORY_ORDER.map((cat) =>
          grouped[cat].length > 0 ? (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {grouped[cat].map((src) => (
                <option
                  key={`fb:${cat}:${src.value}`}
                  value={src.value}
                  // Hide picker sentinels from the fallback list.
                  disabled={
                    src.value === STATIC_TEXT_PREFIX ||
                    src.value === STATIC_DATE_PREFIX ||
                    src.value === STATIC_DATE_RANGE_PREFIX ||
                    src.value === primaryDropdownValue
                  }
                >
                  {src.label}
                </option>
              ))}
            </optgroup>
          ) : null
        )}
      </select>
    </div>
  )
}
