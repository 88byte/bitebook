'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CreditCard, Loader2, X } from 'lucide-react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createSetupIntentAction, replacePaymentMethodAction } from './actions'

// v27.4.1 — native card update via Stripe Elements + SetupIntent.
//
// On open, the modal calls createSetupIntentAction() to get a client
// secret. Once received, it mounts <Elements> with that secret. The
// inner <CardForm> uses stripe.confirmSetup({elements, redirect:'if_required'})
// — the card data goes Stripe-direct via the iframe; we only ever
// see the resulting PaymentMethod ID. Then it posts the PM ID to
// replacePaymentMethodAction() which attaches it + sets it as the
// default on customer + subscription, detaches the old PM.
//
// The Stripe-managed Elements iframe handles 3DS challenges inline —
// no popup or redirect needed in the common path. If the issuer
// requires a full redirect for SCA, confirmSetup returns the URL and
// the user lands on /app/settings?tab=billing on completion.

let _stripePromise: Promise<StripeJs | null> | null = null
function getStripeJs(): Promise<StripeJs | null> {
  if (_stripePromise) return _stripePromise
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!key) {
    _stripePromise = Promise.resolve(null)
    return _stripePromise
  }
  _stripePromise = loadStripe(key)
  return _stripePromise
}

export default function UpdateCardModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState<boolean>(false)
  const stripePromise = getStripeJs()
  const initRef = useRef<boolean>(false)

  // Esc closes when no work is in flight.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset on close so reopening always re-fetches a fresh setup intent.
  useEffect(() => {
    if (!open) {
      setClientSecret(null)
      setBootstrapError(null)
      initRef.current = false
    }
  }, [open])

  // Bootstrap the SetupIntent on first open.
  useEffect(() => {
    if (!open || initRef.current) return
    initRef.current = true
    setBootstrapping(true)
    setBootstrapError(null)
    void (async () => {
      const res = await createSetupIntentAction()
      setBootstrapping(false)
      if ('error' in res) {
        setBootstrapError(res.error)
        return
      }
      setClientSecret(res.client_secret)
    })()
  }, [open])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Update card"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(11, 8, 6, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--color-paper)',
          borderRadius: 14,
          maxWidth: '32rem',
          width: '100%',
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          padding: '1rem 1rem 1.25rem',
          boxShadow: '0 24px 48px rgba(11, 8, 6, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <h2
            className="bb-form-section-head"
            style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <CreditCard size={18} aria-hidden="true" style={{ color: 'var(--color-copper)' }} />
            Update card
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-ink-soft)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {bootstrapping && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--color-ink-soft)',
              padding: '1rem 0',
            }}
          >
            <Loader2
              size={16}
              aria-hidden="true"
              style={{ animation: 'bb-spin 1s linear infinite', color: 'var(--color-copper)' }}
            />
            <span>Loading secure card form…</span>
          </div>
        )}

        {bootstrapError && (
          <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', margin: 0 }}>
            {bootstrapError}
          </p>
        )}

        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary: '#B06C3C',
                  colorBackground: '#FFFFFF',
                  colorText: '#1F2419',
                  colorDanger: '#A33D3D',
                  fontFamily: '"Barlow", system-ui, -apple-system, sans-serif',
                  borderRadius: '8px',
                },
              },
            }}
          >
            <CardForm onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>,
    document.body,
  )
}

function CardForm({ onClose }: { onClose: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    setError(null)
    if (!stripe || !elements) return

    setConfirming(true)
    const { error: stripeErr, setupIntent } = await stripe.confirmSetup({
      elements,
      // We DO have a return_url so SCA challenges that require a full
      // redirect can land back at the billing tab. `redirect: 'if_required'`
      // means the redirect only happens if the issuer demands it.
      confirmParams: {
        return_url:
          (typeof window !== 'undefined'
            ? `${window.location.origin}/app/settings?tab=billing`
            : ''),
      },
      redirect: 'if_required',
    })
    setConfirming(false)

    if (stripeErr) {
      setError(stripeErr.message ?? 'Card setup failed.')
      return
    }
    if (!setupIntent || setupIntent.status !== 'succeeded') {
      setError('Card setup did not complete. Try again.')
      return
    }
    const pmId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id
    if (!pmId) {
      setError('Stripe did not return a payment method. Try again.')
      return
    }

    startTransition(async () => {
      const res = await replacePaymentMethodAction(pmId)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  const busy = confirming || pending

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p className="bb-form-help" role="alert" style={{ color: '#8C3C2A', margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="bb-btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="bb-cta-sm"
          disabled={!stripe || !elements || busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <CreditCard size={14} aria-hidden="true" />
          {busy ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </form>
  )
}
