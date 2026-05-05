'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, FileText, BookOpen, UploadCloud, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { US_STATES } from '@/lib/us-states'
import { createDocAction } from '../../_lib/docs-actions'

// v27.1.0 — upload form for the docs library. Two-step flow:
// 1. Client uploads file directly to Supabase Storage at
//    `docs/{userId}/temp-{timestamp}.{ext}` (Storage RLS gates writes to
//    docs/{auth.uid()}/...).
// 2. Server action createDocAction inserts the docs row, then renames the
//    storage object to the canonical `docs/{userId}/{doc_id}.{ext}` so the
//    layout stays clean.
//
// v27.6.2.2 — mime acceptance broadened by kind:
//   - log: PDF only (fill engine + AcroForm requires PDF)
//   - waiver: PDF, images (jpg/png/webp), DOCX, TXT. AI mapping +
//     signature placement only run on PDF; non-PDF waivers display as-is
//     for hunter acknowledgment (mapping_status flagged not_applicable
//     server-side).
//   - resource: same broad set as waiver. Resources are reference
//     handouts — maps, photos, gear notes — and rarely PDFs.

type DocKind = 'waiver' | 'log' | 'resource'

// v27.6.2.2 — accepted file types per doc kind. The accept= attribute
// surfaces extensions in the picker; the explicit mime list lets the
// validator catch dragged-in files whose extension lies. Source of
// truth for both client + server.
const ACCEPT_BY_KIND: Record<DocKind, { exts: string[]; mimes: string[]; label: string }> = {
  log: {
    exts: ['.pdf'],
    mimes: ['application/pdf'],
    label: 'PDF',
  },
  waiver: {
    exts: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.txt'],
    mimes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    label: 'PDF, image, DOCX, or TXT',
  },
  resource: {
    exts: ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.txt'],
    mimes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    label: 'PDF, image, DOCX, or TXT',
  },
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

function isAccepted(kind: DocKind, file: File): boolean {
  const a = ACCEPT_BY_KIND[kind]
  if (file.type && a.mimes.includes(file.type)) return true
  // Fallback to extension when the browser didn't set a useful type.
  return a.exts.includes(fileExt(file.name))
}

const KIND_OPTIONS: { value: DocKind; label: string; sub: string; Icon: typeof ClipboardCheck }[] = [
  {
    value: 'waiver',
    label: 'Waiver',
    sub: 'Liability or hunt-day forms hunters and you sign before the trip.',
    Icon: ClipboardCheck,
  },
  {
    value: 'log',
    label: 'Harvest log',
    sub: 'State harvest reporting forms you fill in after the hunt.',
    Icon: FileText,
  },
  {
    value: 'resource',
    label: 'Resource',
    sub: 'Reference handouts you share with hunters — packing list, gear notes, maps.',
    Icon: BookOpen,
  },
]

const MAX_BYTES = 25 * 1024 * 1024 // 25MB cap — generous for state forms.

export default function NewDocForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<DocKind>('waiver')
  const [label, setLabel] = useState('')
  const [state, setState] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  function onFileChosen(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    setError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!isAccepted(kind, f)) {
      setError(`Not an accepted file type for ${kind === 'log' ? 'harvest logs' : kind === 'waiver' ? 'waivers' : 'resources'}. Pick a ${ACCEPT_BY_KIND[kind].label}.`)
      return
    }
    if (f.size > MAX_BYTES) {
      setError(`File is too large (${(f.size / 1024 / 1024).toFixed(1)}MB). 25MB max.`)
      return
    }
    setFile(f)
  }

  // Re-validate the picked file when the kind toggles. Avoids a stale
  // "PDF picked, kind switched to log" mismatch where the file no longer
  // satisfies the kind's accept set.
  function onKindChange(next: DocKind) {
    setKind(next)
    if (file && !isAccepted(next, file)) {
      setFile(null)
      setError(`Selected file isn't accepted for ${next === 'log' ? 'harvest logs' : next === 'waiver' ? 'waivers' : 'resources'}. Pick a new file.`)
    }
  }

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    if (!label.trim()) {
      setError('Give the doc a label.')
      return
    }
    if (!file) {
      setError(`Pick a ${ACCEPT_BY_KIND[kind].label} to upload.`)
      return
    }

    setUploading(true)
    let tempPath: string
    // v27.6.2.2 — temp path uses the file's actual extension so the
    // canonical rename in createDocAction yields the right ext on the
    // final storage path.
    const ext = fileExt(file.name) || '.pdf'
    const fileMime = file.type || 'application/pdf'
    try {
      const supabase = createClient()
      const ts = Date.now()
      tempPath = `docs/${userId}/temp-${ts}${ext}`
      const { error: upErr } = await supabase.storage
        .from('bb-private')
        .upload(tempPath, file, {
          contentType: fileMime,
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
      fd.set('kind', kind)
      fd.set('label', label.trim())
      if (state) fd.set('state', state)
      fd.set('temp_path', tempPath)
      fd.set('file_mime', fileMime)
      const res = await createDocAction(fd)
      if ('error' in res) {
        setError(res.error)
        return
      }
      router.push(`/app/docs/${res.id}`)
      router.refresh()
    })
  }

  const showState = kind === 'log' || kind === 'waiver'
  const acceptAttr = [...ACCEPT_BY_KIND[kind].mimes, ...ACCEPT_BY_KIND[kind].exts].join(',')

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-4 bb-form-narrow">
      {/* Kind picker */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">What kind of doc?</h2>
          <div className="flex flex-col gap-2">
            {KIND_OPTIONS.map(({ value, label: lbl, sub, Icon }) => (
              <label
                key={value}
                className="bb-tile"
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  borderColor:
                    kind === value ? 'var(--color-copper)' : 'var(--color-ink-tint)',
                }}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => onKindChange(value)}
                  style={{ marginTop: '0.25rem' }}
                />
                <span style={{ display: 'flex', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                  <Icon size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-ink-soft)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'block' }}>{lbl}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>{sub}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Basics */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">Basics</h2>
          <div className="bb-form-row">
            <label className="bb-form-label" htmlFor="label">Label</label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. CA DFW 992b — Bear Tag"
              className="bb-input"
              autoComplete="off"
              maxLength={200}
              required
            />
            <p className="bb-form-help">A short name only you see in your library.</p>
          </div>
          {showState && (
            <div className="bb-form-row" style={{ marginTop: '0.75rem' }}>
              <label className="bb-form-label" htmlFor="state">
                State <span style={{ opacity: 0.6 }}>(optional)</span>
              </label>
              <select
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="bb-input"
              >
                <option value="">— Not state-specific —</option>
                {US_STATES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <p className="bb-form-help">Helpful for state harvest logs. Leave blank for federal or non-state docs.</p>
            </div>
          )}
        </div>
      </section>

      {/* File */}
      <section className="bb-tile bb-form-section">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head">File</h2>
          {/* v27.6.2.2 — kind-aware helper copy. Logs stay PDF-only;
              waivers + resources accept a broader set so non-fillable
              reference material doesn't get blocked at upload. */}
          <p className="bb-form-help" style={{ marginBottom: '0.5rem' }}>
            Accepted: <strong>{ACCEPT_BY_KIND[kind].label}</strong>. 25MB max.
            {kind === 'waiver' && ' AI mapping + signature placement only run on PDF — non-PDF waivers display as-is for hunter acknowledgment.'}
          </p>
          {file ? (
            <div
              className="bb-tile"
              style={{
                padding: '0.75rem',
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'center',
              }}
            >
              <FileText size={18} aria-hidden="true" style={{ color: 'var(--color-ink-soft)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span style={{ fontWeight: 600 }}>{file.name}</span>
                <br />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="bb-text-action"
                disabled={uploading || pending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Trash2 size={14} aria-hidden="true" />
                Remove
              </button>
            </div>
          ) : (
            <label
              className="bb-tile"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
                borderStyle: 'dashed',
                color: 'var(--color-ink-soft)',
              }}
            >
              <UploadCloud size={28} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>Pick a file</span>
              <span style={{ fontSize: '0.85rem' }}>Or drop one here. 25MB max.</span>
              <input
                type="file"
                accept={acceptAttr}
                onChange={onFileChosen}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      </section>

      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A' }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="bb-cta-sm"
          disabled={uploading || pending}
        >
          {uploading ? 'Uploading…' : pending ? 'Saving…' : 'Save doc'}
        </button>
      </div>
    </form>
  )
}
