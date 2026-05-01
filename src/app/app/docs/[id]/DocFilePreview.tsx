'use client'

import { useEffect, useState } from 'react'
import { FileText, ExternalLink, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// v27.1.0.3 — file card. Dropped the inline <iframe> preview that was
// only rendering page 1 of multi-page PDFs on iOS Safari (the OS just
// doesn't paginate inside iframes — the entire PDF gets rasterized as
// a single page-height frame, no scrollbars, no nav). Inline PDF.js
// render is the proper fix for an in-app reader, but it's a ~1MB JS
// dep + extra rendering surface that doesn't earn its keep at v27.1.0
// when the user can hit the native viewer in one tap.
//
// Pattern: present the file as a tappable card with prominent Open
// (new tab) + Download CTAs. Native iOS Safari PDF viewer handles
// multi-page nav, pinch zoom, share, save-to-Files cleanly. Android
// Chrome opens in its inline viewer with full pagination. Desktop
// opens in the browser's PDF viewer. Same UX everywhere.
//
// Locked decision §10.2 was default-B (external open). v27.1.0
// shipped a halfway-house iframe + fallback button; this build just
// commits to default-B which is what actually works on mobile.

export default function DocFilePreview({
  filePath,
  fileMime,
}: {
  filePath: string
  fileMime: string
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    sb.storage
      .from('bb-private')
      .createSignedUrl(filePath, 3600)
      .then((res) => {
        if (cancelled) return
        if (res.error) setError(res.error.message)
        else setSignedUrl(res.data?.signedUrl ?? null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Sign failed')
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  if (error) {
    return (
      <div className="bb-tile">
        <div className="bb-tile-body" style={{ padding: '0.75rem' }}>
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', margin: 0 }}>
            Couldn&rsquo;t load the file: {error}
          </p>
        </div>
      </div>
    )
  }

  if (!signedUrl) {
    return (
      <div className="bb-tile">
        <div className="bb-tile-body" style={{ padding: '0.75rem' }}>
          <p className="bb-form-help" style={{ margin: 0 }}>Preparing file…</p>
        </div>
      </div>
    )
  }

  const isPdf = fileMime === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')
  const fileName = filePath.split('/').pop() ?? 'document'

  return (
    <div className="bb-tile">
      <div className="bb-tile-body" style={{ padding: '0.875rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: 'var(--color-paper-tint)',
              color: 'var(--color-ink-soft)',
            }}
          >
            <FileText size={22} />
          </span>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--color-ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fileName}
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-ink-soft)',
                marginTop: '0.1rem',
              }}
            >
              {isPdf ? 'PDF' : fileMime} · stored privately
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginTop: '0.875rem',
          }}
        >
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="bb-cta-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open file
          </a>
          <a
            href={signedUrl}
            download={fileName}
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Download size={14} aria-hidden="true" />
            Download
          </a>
        </div>

        {isPdf && (
          <p className="bb-form-help" style={{ margin: '0.75rem 0 0 0' }}>
            Open uses your device&rsquo;s built-in PDF viewer for full multi-page navigation, pinch zoom, and share.
          </p>
        )}
      </div>
    </div>
  )
}
