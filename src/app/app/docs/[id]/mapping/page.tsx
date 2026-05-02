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

  // Pre-fetch any existing mappings so the wizard can hydrate the
  // dropdowns. Field discovery happens client-side via the server action
  // because it requires reading the PDF binary on every visit (cheap, a
  // few hundred ms even for a 5-page state form).
  const sb = await createClient()
  const { data: existingRows } = await sb
    .from('doc_field_mappings')
    .select('field_name, data_source_path, mapping_kind, hunter_slot, is_override')
    .eq('doc_id', doc.id)
    .eq('mapping_kind', 'field')

  const existingByField: Record<string, string> = {}
  const existingSlotByField: Record<string, number> = {}
  const existingOverrideByField: Record<string, boolean> = {}
  for (const r of existingRows ?? []) {
    if (r.field_name) {
      existingByField[r.field_name] = r.data_source_path ?? ''
      existingSlotByField[r.field_name] = typeof r.hunter_slot === 'number' ? r.hunter_slot : 0
      existingOverrideByField[r.field_name] = r.is_override === true
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
          {doc.kind === 'log'
            ? 'Match each PDF field to a Bite Book data source. The auto-fill engine ships in the next build (v27.1.1.1).'
            : 'Field mapping is set up here. The signature-placement step ships in v27.1.2.'}
        </p>
      </header>

      <MappingWizard
        docId={doc.id}
        docKind={doc.kind}
        existingByField={existingByField}
        existingSlotByField={existingSlotByField}
        existingOverrideByField={existingOverrideByField}
        currentStatus={doc.mapping_status}
      />
    </main>
  )
}
