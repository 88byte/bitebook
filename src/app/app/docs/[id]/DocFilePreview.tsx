'use client'

import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// v27.1.0 — bare-bones PDF preview. Native <iframe src=signedUrl> works on
// desktop browsers and Android Chrome. iOS Safari renders PDFs in <iframe>
// inconsistently — we surface a fallback "Open" link in all cases so the
// hunter / guide can always view via the OS default. Inline PDF.js render
// lands later if Flavio bumps it from default-B to A on §10.2.
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
          <p className="bb-form-help" style={{ margin: 0 }}>Loading file…</p>
        </div>
      </div>
    )
  }

  const isPdf = fileMime === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')

  return (
    <div className="bb-tile">
      <div className="bb-tile-body" style={{ padding: '0.6rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--color-ink-soft)',
              fontSize: '0.85rem',
            }}
          >
            <FileText size={14} aria-hidden="true" />
            File preview
          </div>
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="bb-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Download size={14} aria-hidden="true" />
            Open / download
          </a>
        </div>
        {isPdf ? (
          <iframe
            src={signedUrl}
            title="Document preview"
            style={{
              width: '100%',
              height: '70vh',
              minHeight: 480,
              border: '1px solid var(--color-ink-tint)',
              borderRadius: 8,
              background: 'var(--color-paper-tint)',
            }}
          />
        ) : (
          <p className="bb-form-help" style={{ margin: 0 }}>
            This file isn&rsquo;t a PDF — use the open / download button above to view.
          </p>
        )}
      </div>
    </div>
  )
}
