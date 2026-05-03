'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmModal from '@/app/_components/ConfirmModal'
import { replaceDocPdfAction } from '../../_lib/docs-actions'

// v27.1.5.3.5 — Replace PDF on an existing doc.
//
// Flow:
//   1. Hidden file input → user picks a PDF (25MB cap, application/pdf
//      only, same as NewDocForm).
//   2. ConfirmModal shows the chosen filename + the warning copy
//      (mappings may need re-review, every default-pointing guide gets
//      the new file).
//   3. Confirm → upload to docs/{viewer_id}/temp-{ts}.pdf via the
//      user-session storage API.
//   4. Server action overwrites the doc's existing file_path with the
//      new bytes, recomputes form_template_hash, stamps replaced_at,
//      cleans up the temp.
//   5. If the action reports hashChanged=true, surface a follow-up
//      banner via ?replaced=hash_changed in the URL so the doc detail
//      page can render a "Re-run AI mapping" prompt.
//
// Permission gating happens server-side (action validates owner OR
// admin). Client just renders the button regardless — admin users see
// it on every doc detail; owners see it on their own.

const MAX_BYTES = 25 * 1024 * 1024 // match NewDocForm cap

export default function ReplaceDocButton({
  docId,
  viewerId,
}: {
  docId: string
  viewerId: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function onPickClick() {
    setError(null)
    fileInputRef.current?.click()
  }

  function onFileChosen(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    // Reset the input so picking the same filename twice still fires.
    ev.target.value = ''
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF only — pick a .pdf file.')
      return
    }
    if (f.size > MAX_BYTES) {
      setError(`File is too large (${(f.size / 1024 / 1024).toFixed(1)}MB). 25MB max.`)
      return
    }
    setPickedFile(f)
    setConfirmOpen(true)
  }

  async function runReplace() {
    if (!pickedFile) return
    setUploading(true)
    setError(null)
    let tempPath = ''
    try {
      const supabase = createClient()
      const ts = Date.now()
      tempPath = `docs/${viewerId}/temp-${ts}.pdf`
      const { error: upErr } = await supabase.storage
        .from('bb-private')
        .upload(tempPath, pickedFile, {
          contentType: 'application/pdf',
          upsert: false,
        })
      if (upErr) throw upErr
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
      setUploading(false)
      return
    }
    setUploading(false)

    startTransition(async () => {
      const fd = new FormData()
      fd.set('doc_id', docId)
      fd.set('temp_path', tempPath)
      const res = await replaceDocPdfAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setPickedFile(null)
      const next = res.hashChanged
        ? `/app/docs/${docId}?replaced=hash_changed`
        : `/app/docs/${docId}?replaced=ok`
      router.push(next)
      router.refresh()
    })
  }

  const busy = uploading || pending

  return (
    <>
      <button
        type="button"
        className="bb-btn-secondary"
        onClick={onPickClick}
        disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {busy ? 'Replacing…' : 'Replace PDF'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={onFileChosen}
        style={{ display: 'none' }}
      />
      {error && (
        <p
          className="bb-form-help"
          role="alert"
          style={{ margin: 0, flexBasis: '100%', color: '#8C3C2A' }}
        >
          {error}
        </p>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Replace this doc’s PDF?"
        body={
          <span>
            Field mappings may need to be reviewed if the form fields
            changed. Guides using this as their default will see the new
            version automatically.
            {pickedFile && (
              <>
                <br />
                <br />
                <strong>New file:</strong> {pickedFile.name} (
                {(pickedFile.size / 1024 / 1024).toFixed(2)} MB)
              </>
            )}
          </span>
        }
        confirmLabel="Replace PDF"
        isPending={busy}
        onCancel={() => {
          setConfirmOpen(false)
          setPickedFile(null)
        }}
        onConfirm={() => {
          setConfirmOpen(false)
          runReplace()
        }}
      />
    </>
  )
}
