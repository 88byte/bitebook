'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// v27.0a.15: photo upload field for a wallet item. Browser file picker
// (camera or library on iOS/Android) → client-side downscale to max 2000px
// long edge → JPEG q=0.85 → upload to Supabase Storage at
// `bb-private/wallet/{userId}/{walletItemId}/{timestamp}.jpg`.
// Storage RLS (see migration v27_0a_15_create_bb_private_bucket) restricts
// reads + writes to `wallet/{auth.uid()}/...` so each user owns their own
// folder. Calls onChange with the public-style signed URL after upload so
// the parent form can persist it on wallet_items.document_url.
//
// New items: walletItemId is null → field is disabled with a "save once,
// then come back to upload" helper. Avoids the temp-path move dance.
export default function WalletPhotoField({
  userId,
  walletItemId,
  initialUrl,
  emphasize,
  onChange,
}: {
  userId: string
  walletItemId: string | null
  initialUrl: string | null
  emphasize: boolean
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const disabled = !walletItemId

  function pickFile() {
    if (disabled) return
    setError(null)
    inputRef.current?.click()
  }

  async function onFileChosen(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file || !walletItemId) return
    ev.target.value = '' // allow re-picking the same file later
    setBusy('upload')
    setError(null)
    try {
      const compressed = await downscaleToJpeg(file, 2000, 0.85)
      const supabase = createClient()
      const ts = Date.now()
      const path = `wallet/${userId}/${walletItemId}/${ts}.jpg`
      const { error: upErr } = await supabase.storage
        .from('bb-private')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert: true,
        })
      if (upErr) throw upErr
      // We store the bucket-relative path (not a signed URL) so future
      // reads can sign on the fly per-request. Display layer signs.
      setUrl(path)
      onChange(path)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
    } finally {
      setBusy(null)
    }
  }

  async function onRemove() {
    if (!url) return
    setBusy('remove')
    setError(null)
    try {
      const supabase = createClient()
      const { error: rmErr } = await supabase.storage
        .from('bb-private')
        .remove([url])
      if (rmErr) throw rmErr
      setUrl(null)
      onChange(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Remove failed'
      setError(msg)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={`bb-tile bb-form-section${emphasize ? ' bb-photo-emphasize' : ''}`}>
      <div className="bb-tile-body">
        <h2 className="bb-form-section-head">Photo</h2>
        {emphasize && (
          <p className="bb-form-help" style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
            Wardens often check the physical document. A photo on file means you can prove
            it's in your possession even if you forgot the original.
          </p>
        )}

        {url ? (
          <div className="bb-photo-preview">
            <SignedImage path={url} alt="Wallet item photo" />
            <div className="bb-photo-actions">
              <button
                type="button"
                onClick={pickFile}
                className="bb-text-action bb-text-action-copper"
                disabled={busy !== null}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <ImagePlus size={14} aria-hidden="true" />
                Replace
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="bb-text-action bb-text-action-copper"
                disabled={busy !== null}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Trash2 size={14} aria-hidden="true" />
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={pickFile}
            className="bb-photo-empty"
            disabled={disabled || busy !== null}
            aria-label="Add a photo"
          >
            <span className="bb-photo-empty-icon" aria-hidden="true">
              <Camera size={28} />
            </span>
            <span className="bb-photo-empty-title">
              {disabled ? 'Save first, then add a photo' : busy === 'upload' ? 'Uploading…' : 'Add photo'}
            </span>
            <span className="bb-photo-empty-sub">
              {disabled
                ? 'Photo upload unlocks once this item is saved.'
                : 'Tap to use camera or pick from library.'}
            </span>
          </button>
        )}

        {error && (
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', marginTop: '0.4rem' }}>
            {error}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          onChange={onFileChosen}
          style={{ display: 'none' }}
        />
      </div>
    </section>
  )
}

// Lightweight signed-URL fetcher. Signs via supabase-js for ~1h then renders.
function SignedImage({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // Fire once on mount. We don't bother with refresh-on-expiry for v27.0a.15
  // — the form is short-lived and 1-hour signed URLs cover any realistic
  // session. If the URL expires while the user lingers, they can refresh.
  if (src === null && err === null) {
    const supabase = createClient()
    supabase.storage
      .from('bb-private')
      .createSignedUrl(path, 3600)
      .then((res) => {
        if (res.error) setErr(res.error.message)
        else setSrc(res.data?.signedUrl ?? null)
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Signing failed'))
  }

  if (err) {
    return <div className="bb-form-help" style={{ color: '#8C3C2A' }}>Couldn&apos;t load photo: {err}</div>
  }
  if (!src) {
    return <div className="bb-form-help">Loading photo…</div>
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="bb-photo-img" />
}

// Downscale to max long-edge dim and re-encode as JPEG. Returns a Blob.
// Honors EXIF orientation by drawing through createImageBitmap with
// imageOrientation: 'from-image' where available; falls back to a plain
// HTMLImageElement decode otherwise.
async function downscaleToJpeg(file: File, maxDim: number, quality: number): Promise<Blob> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // fall through to <img> decode below
  }

  const draw = (w: number, h: number, drawFn: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    drawFn(ctx)
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))),
        'image/jpeg',
        quality
      )
    })
  }

  if (bitmap) {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    return draw(w, h, (ctx) => ctx.drawImage(bitmap!, 0, 0, w, h))
  }

  // Fallback: HTMLImageElement
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('Image decode failed'))
      i.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    return await draw(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h))
  } finally {
    URL.revokeObjectURL(url)
  }
}
