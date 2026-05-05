'use client'

import { useState } from 'react'
import { CreditCard, Plus } from 'lucide-react'
import UpdateCardModal from './UpdateCardModal'
import type { PaymentMethodSummary } from '../_lib/billing-queries'

// v27.4.1 — current card display + Replace CTA. Wraps the
// UpdateCardModal so the open/close state lives client-side and the
// outer BillingPanel can stay a server component.

const BRAND_LABEL: Record<PaymentMethodSummary['brand'], string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  unknown: 'Card',
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export default function PaymentMethodCard({
  paymentMethod,
}: {
  paymentMethod: PaymentMethodSummary | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        marginTop: '0.75rem',
      }}
    >
      <h3 className="bb-form-section-head" style={{ marginTop: 0, marginBottom: 0, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-ink-soft)' }}>
        Payment method
      </h3>
      {paymentMethod ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.65rem 0.85rem',
            border: '1px solid var(--color-card-divider)',
            borderRadius: 10,
            background: '#FFFFFF',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              background: 'var(--color-paper-tint)',
              color: 'var(--color-ink-soft)',
            }}
          >
            <CreditCard size={18} />
          </span>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--color-ink)' }}>
              {BRAND_LABEL[paymentMethod.brand] || 'Card'} ending in {paymentMethod.last4}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-soft)' }}>
              Expires {pad2(paymentMethod.exp_month)}/{paymentMethod.exp_year}
            </div>
          </div>
          <button
            type="button"
            className="bb-btn-secondary"
            onClick={() => setOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <CreditCard size={14} aria-hidden="true" />
            Replace
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.65rem 0.85rem',
            border: '1px dashed var(--color-card-divider)',
            borderRadius: 10,
            background: 'var(--color-paper-tint)',
          }}
        >
          <span style={{ flex: '1 1 auto', color: 'var(--color-ink-soft)', fontSize: '0.9rem' }}>
            No card on file.
          </span>
          <button
            type="button"
            className="bb-cta-sm"
            onClick={() => setOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Plus size={14} aria-hidden="true" />
            Add card
          </button>
        </div>
      )}

      <UpdateCardModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
