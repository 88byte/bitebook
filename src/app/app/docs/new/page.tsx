import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireGuide } from '../../_lib/auth'
import NewDocForm from './NewDocForm'

// v27.1.0 — guide upload form. Drag/drop or file picker → direct upload to
// Supabase Storage → server action inserts the docs row pointing at the
// uploaded path. Supports waiver / log / resource. Mapping wizards land in
// v27.1.1+ — this page just gets the file into the library.
export default async function NewDocPage() {
  const { profile } = await requireGuide()

  return (
    <main className="bb-app-main">
      <div className="mb-3">
        <Link
          href="/app/docs"
          className="bb-text-action"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to library
        </Link>
      </div>
      <header>
        <p className="bb-page-eyebrow">Documents</p>
        <h1 className="bb-page-title">Upload a doc</h1>
        <p className="bb-page-sub">PDF only. You can attach this to one or many trips later.</p>
      </header>

      <NewDocForm userId={profile.id} />
    </main>
  )
}
