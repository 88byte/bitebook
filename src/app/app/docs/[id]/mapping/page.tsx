import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../../_lib/auth'
import { fetchGuideDoc } from '../../../_lib/docs-queries'
import { createClient } from '@/lib/supabase/server'
import MappingWizard from './MappingWizard'

type Params = Promise<{ id: string }>

// v27.1.1.0 — log + waiver field-mapping wizard.
// v27.1.0 only stubbed this with a coming-soon card on the doc detail
// page. This route hosts the actual UI: list every PDF field with a
// data-source dropdown, save to doc_field_mappings.
//
// Auto-fill engine + Generate button + combined/per-hunter scope toggle
// land in v27.1.1.1.
export default async function DocMappingPage({ params }: { params: Params }) {
  const { profile } = await requireGuide()
  const { id } = await params
  const doc = await fetchGuideDoc(profile.id, id)
  if (!doc) notFound()
  if (doc.kind !== 'log' && doc.kind !== 'waiver') {
    // Resources don't get a mapping flow; bounce back to the detail.
    notFound()
  }

  // v27.9.7.8 — gate the wizard's write CTAs by ownership. fetchGuideDoc
  // returns Bite Book templates to any guide (so they can VIEW the
  // mapping), but server actions filter by guide_id so non-owners' Save
  // attempts silently no-op. Pass through ownership so the wizard can
  // render read-only when a non-owner is viewing.
  const viewerOwnsDoc = doc.guide_id === profile.id

  // Pre-fetch any existing mappings so the wizard can hydrate the
  // dropdowns. Field discovery happens client-side via the server action
  // because it requires reading the PDF binary on every visit (cheap, a
  // few hundred ms even for a 5-page state form).
  const sb = await createClient()
  const { data: existingRows } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, fallback_path, mapping_kind, hunter_slot, is_override, is_ai_suggested, ai_suggested_path, ai_suggested_slot')
    .eq('doc_id', doc.id)
    .eq('mapping_kind', 'field')

  const existingByField: Record<string, string> = {}
  // v27.1.1.0.3e.5: hydrate the optional fallback_path. Empty/null →
  // no entry, so the wizard's "+ Add fallback source" link is the
  // surface where guides opt in.
  const existingFallbackByField: Record<string, string> = {}
  const existingSlotByField: Record<string, number> = {}
  const existingOverrideByField: Record<string, boolean> = {}
  const existingAiSuggestedByField: Record<string, boolean> = {}
  const existingAiSuggestedPathByField: Record<string, string> = {}
  const existingAiSuggestedSlotByField: Record<string, number> = {}
  for (const r of existingRows ?? []) {
    if (r.field_name) {
      existingByField[r.field_name] = r.data_source_path ?? ''
      const fb = (r as { fallback_path?: string | null }).fallback_path ?? null
      if (typeof fb === 'string' && fb.length > 0) {
        existingFallbackByField[r.field_name] = fb
      }
      existingSlotByField[r.field_name] = typeof r.hunter_slot === 'number' ? r.hunter_slot : 0
      existingOverrideByField[r.field_name] = r.is_override === true
      existingAiSuggestedByField[r.field_name] = r.is_ai_suggested === true
      if (typeof r.ai_suggested_path === 'string' && r.ai_suggested_path.length > 0) {
        existingAiSuggestedPathByField[r.field_name] = r.ai_suggested_path
      }
      if (typeof r.ai_suggested_slot === 'number') {
        existingAiSuggestedSlotByField[r.field_name] = r.ai_suggested_slot
      }
    }
  }

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href={`/app/docs/${doc.id}`}
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to doc
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">
          {doc.kind === 'log' ? 'Harvest log' : 'Waiver'} · Field mapping
        </p>
        <h1 className="bb-page-title">{doc.label}</h1>
        <p className="bb-page-sub">
          {viewerOwnsDoc
            ? doc.kind === 'log'
              ? 'Match each PDF field to a Bite Book data source. Tap Auto-suggest mappings to let AI pre-fill suggestions you can review.'
              : 'Field mapping is set up here. The signature-placement step ships in v27.1.2.'
            : 'These are the field mappings for this Bite Book template.'}
        </p>
      </header>

      <MappingWizard
        docId={doc.id}
        docKind={doc.kind}
        existingByField={existingByField}
        existingFallbackByField={existingFallbackByField}
        existingSlotByField={existingSlotByField}
        existingOverrideByField={existingOverrideByField}
        existingAiSuggestedByField={existingAiSuggestedByField}
        existingAiSuggestedPathByField={existingAiSuggestedPathByField}
        existingAiSuggestedSlotByField={existingAiSuggestedSlotByField}
        currentStatus={doc.mapping_status}
        viewerOwnsDoc={viewerOwnsDoc}
      />
    </main>
  )
}
