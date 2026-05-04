import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireGuide } from '../../../_lib/auth'
import { fetchGuideDoc } from '../../../_lib/docs-queries'
import SignPlacementWizard from './SignPlacementWizard'

// v27.2.0.3.1 — signature placement wizard route. Waiver- and
// harvest_log-class docs both use this; resource docs don't have a
// signing flow.
//
// Server side fetches:
//   - the doc (RLS-gated to owner OR template viewer)
//   - a 1-hour signed URL for the PDF so the client-side pdfjs-dist
//     loader can pull the bytes via fetch
//   - existing placement_coords rows so the wizard hydrates with the
//     guide's prior layout
//
// Client side handles the drag/resize UI + save.

type Params = Promise<{ id: string }>

export default async function SignPlacementPage({ params }: { params: Params }) {
  const { profile } = await requireGuide()
  const { id } = await params
  const doc = await fetchGuideDoc(profile.id, id)
  if (!doc) notFound()
  if (doc.kind !== 'waiver' && doc.kind !== 'log') {
    // v27.2.0.3.1: waivers + harvest logs both support placement.
    // Resource docs don't have a signing flow, so 404.
    notFound()
  }
  if (doc.guide_id !== profile.id) {
    // Template viewers (non-owners) can't edit placements.
    notFound()
  }

  const sb = await createClient()
  const { data: signed } = await sb.storage
    .from('bb-private')
    .createSignedUrl(doc.file_path, 3600)

  type PlacementRow = {
    id: string
    signature_role: string | null
    placement_coords: unknown
  }
  const { data: existing } = await sb
    .from('doc_field_mappings')
    .select('id, signature_role, placement_coords')
    .eq('doc_id', id)
    .eq('mapping_kind', 'signature')

  // Coerce existing rows into the wizard's input shape. Anything malformed
  // is silently dropped — the wizard only renders rows it understands.
  type WizardPlacement = {
    role: 'hunter' | 'guide'
    page: number
    x: number
    y: number
    w: number
    h: number
  }
  const initialPlacements: WizardPlacement[] = []
  for (const r of (existing ?? []) as PlacementRow[]) {
    if (r.signature_role !== 'hunter' && r.signature_role !== 'guide') continue
    const c = r.placement_coords as
      | { x?: number; y?: number; w?: number; h?: number; page?: number }
      | null
    if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue
    initialPlacements.push({
      role: r.signature_role,
      page: typeof c.page === 'number' ? c.page : 1,
      x: c.x,
      y: c.y,
      w: typeof c.w === 'number' ? c.w : 0.2,
      h: typeof c.h === 'number' ? c.h : 0.06,
    })
  }

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href={`/app/docs/${id}`}
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to doc
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">{doc.kind === 'log' ? 'Harvest log setup' : 'Waiver setup'}</p>
        <h1 className="bb-page-title">Place signatures</h1>
        <p className="bb-page-sub">
          {doc.kind === 'log'
            ? 'Drop a box where the guide signs. The signing flow paints your signature inside the box.'
            : 'Drop boxes where the hunter and guide sign. The signing flow paints their signature inside each box.'}
        </p>
      </header>

      {!signed?.signedUrl ? (
        <p className="bb-form-help mt-4" style={{ color: '#8C3C2A' }}>
          Couldn’t load the PDF for editing. Reload the page to try again.
        </p>
      ) : (
        <SignPlacementWizard
          docId={id}
          pdfUrl={signed.signedUrl}
          initialPlacements={initialPlacements}
          kind={doc.kind === 'log' ? 'log' : 'waiver'}
        />
      )}
    </main>
  )
}
