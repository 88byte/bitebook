'use client'

import { useRef, useState, useTransition } from 'react'
import { Upload, Building2 } from 'lucide-react'
import { setOutfitterLogoAction } from '../upgrade-to-outfitter/actions'

// v28.1.0b.3 — Self-serve outfitter-logo upload for the Settings
// page's Outfitter card. Only mounted for tier='outfitter_owner';
// the server action gates that again.
//
// File picker is hidden — the visible "Change logo" button forwards
// click to the file input. Mobile-friendly: 44x44 tap target, no
// drag-drop required.
//
// v28.1.0b.4 — Pre-validate on the client so the user sees a friendly
// inline error BEFORE the network round-trip. Allowed mimes + size
// match the server action + bucket exactly.
const CLIENT_ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml',
  'image/heic', 'image/heif',
])
const CLIENT_SIZE_LIMIT_BYTES = 5 * 1024 * 1024

export default function OutfitterLogoUploader({ currentLogoUrl }: { currentLogoUrl: string | null }) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(currentLogoUrl)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function onPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    if (!f) return
    setError(null)
    setSavedAt(null)
    // Client-side validation — surfaces problems instantly without a
    // round-trip. Identical rules to the server action so the two
    // can't disagree.
    if (!CLIENT_ALLOWED_MIME.has(f.type)) {
      setError(`That file isn't supported (${f.type || 'unknown type'}). Please pick a PNG, JPEG, WebP, SVG, HEIC, or HEIF image.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (f.size > CLIENT_SIZE_LIMIT_BYTES) {
      setError(`Logo must be under 5 MB. This file is ${(f.size / 1024 / 1024).toFixed(1)} MB. Try a smaller version or scale it down in Photos / Preview first.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    // Optimistic preview using object URL.
    setPreview(URL.createObjectURL(f))
    const fd = new FormData()
    fd.append('file', f)
    startTransition(async () => {
      try {
        const res = await setOutfitterLogoAction(fd)
        if ('error' in res) {
          setError(res.error)
          setPreview(currentLogoUrl)
        } else {
          setPreview(res.logo_url)
          setSavedAt(Date.now())
        }
      } catch (e) {
        // Final safety net — server action already wraps in try/catch
        // and returns {error}, but if something inside the transition
        // throws (network blip, FormData serialization issue) we still
        // surface inline instead of an error page.
        const msg = e instanceof Error ? e.message : String(e)
        setError(`Couldn't reach the server: ${msg}. Check your connection and try again.`)
        setPreview(currentLogoUrl)
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flexShrink: 0 }}>
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview}
            alt="Outfitter logo"
            style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8, background: '#FFF' }}
          />
        ) : (
          <span
            style={{
              width: 72,
              height: 72,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              background: 'rgba(168, 92, 50, 0.12)',
              color: 'var(--color-copper)',
            }}
          >
            <Building2 size={28} aria-hidden="true" />
          </span>
        )}
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/heic,image/heif,.heic,.heif"
          onChange={onPick}
          disabled={pending}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="bb-cta-sm"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: 44 }}
        >
          <Upload size={14} aria-hidden="true" />
          {pending ? 'Uploading…' : currentLogoUrl ? 'Change logo' : 'Upload logo'}
        </button>
        {error && (
          <p className="bb-form-help" role="alert" style={{ marginTop: '0.5rem', color: '#A33D3D' }}>
            {error}
          </p>
        )}
        {savedAt && !error && (
          <p className="bb-form-help" style={{ marginTop: '0.5rem', color: '#3F6B3A' }}>
            Saved. Reload the page if it doesn&rsquo;t appear in the header right away.
          </p>
        )}
        <p className="bb-form-help" style={{ marginTop: '0.5rem' }}>
          PNG, JPEG, WebP, SVG, or HEIC, up to 5 MB. Visible across your dashboard, network, and trips.
        </p>
      </div>
    </div>
  )
}
