// v27.4.1 — invoice list. Server component renders the most recent
// 10 invoices for the guide's customer, pulled live from Stripe via
// loadGuideInvoices(). PDFs link to Stripe-hosted invoice_pdf so we
// don't have to mirror anything storage-side.

import { Download, ExternalLink } from 'lucide-react'
import type { InvoiceSummary } from '../_lib/billing-queries'

function fmtDate(unixSec: number): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(cents: number, currency: string): string {
  const dollars = cents / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase() || 'USD',
    }).format(dollars)
  } catch {
    return `$${dollars.toFixed(2)}`
  }
}

function statusPill(status: InvoiceSummary['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    flexShrink: 0,
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '0.18rem 0.45rem',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }
  if (status === 'paid') return { ...base, background: 'rgba(63, 107, 58, 0.14)', color: '#2F5A2A' }
  if (status === 'open') return { ...base, background: 'rgba(168, 92, 50, 0.16)', color: 'var(--color-copper)' }
  if (status === 'void' || status === 'uncollectible') return { ...base, background: 'var(--color-card-divider)', color: 'var(--color-ink-muted)' }
  // draft
  return { ...base, background: 'var(--color-paper-tint)', color: 'var(--color-ink-soft)' }
}

export default function InvoicesList({ invoices }: { invoices: InvoiceSummary[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
      <h3
        className="bb-form-section-head"
        style={{
          marginTop: 0,
          marginBottom: 0,
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-ink-soft)',
        }}
      >
        Invoices
      </h3>

      {invoices.length === 0 ? (
        <p className="bb-form-help" style={{ margin: 0 }}>
          No invoices yet. Your first one lands when your trial converts to a paid
          subscription.
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--color-card-divider)',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#FFFFFF',
          }}
        >
          {invoices.map((inv, i) => {
            const amount = inv.amount_paid_cents > 0 ? inv.amount_paid_cents : inv.amount_due_cents
            return (
              <div
                key={inv.id || `inv-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.65rem 0.85rem',
                  borderBottom:
                    i < invoices.length - 1 ? '1px solid var(--color-card-divider)' : 'none',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
                    {fmtDate(inv.created)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>
                    {inv.number ? `${inv.number} · ` : ''}
                    {fmtMoney(amount, inv.currency)}
                  </div>
                </div>
                <span style={statusPill(inv.status)}>{inv.status}</span>
                {inv.invoice_pdf ? (
                  <a
                    href={inv.invoice_pdf}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bb-btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    aria-label="Download invoice PDF"
                  >
                    <Download size={14} aria-hidden="true" />
                    PDF
                  </a>
                ) : inv.hosted_invoice_url ? (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="bb-btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    aria-label="View invoice"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    View
                  </a>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
