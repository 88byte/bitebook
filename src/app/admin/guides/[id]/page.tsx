import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { fetchAdminAccountDetail } from '../../_lib/admin-queries'
import AdminGuideActions from './AdminGuideActions'

// v27.6.0 — Account detail. Read panel on top (profile + live Stripe
// state + invoices), action panel underneath (flip status, comp,
// force reactivate, open Stripe customer).

type Params = Promise<{ id: string }>

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtUnix(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export default async function AdminGuideDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const detail = await fetchAdminAccountDetail(id)
  if (!detail) notFound()

  const stripeCustomerUrl = detail.subscription?.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${detail.subscription.stripe_customer_id}`
    : null

  const fullName = `${detail.first_name} ${detail.last_name}`.trim() || detail.display_name

  return (
    <main className="bb-app-main">
      <Link href="/admin" className="bb-text-action bb-text-action-copper" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
        <ArrowLeft size={14} aria-hidden="true" />
        All accounts
      </Link>

      <header className="mt-2">
        <p className="bb-page-eyebrow">Mission Control</p>
        <h1 className="bb-page-title">{fullName || '—'}</h1>
        <p className="bb-page-sub">{detail.email || '—'}{detail.business_name ? ` · ${detail.business_name}` : ''}</p>
      </header>

      <div className="bb-admin-grid mt-4">
        <section className="bb-tile">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Profile</h2>
            <DL>
              <DT label="Name" value={fullName || '—'} />
              <DT label="Email" value={detail.email || '—'} />
              <DT label="Phone" value={detail.phone || '—'} />
              <DT label="Business" value={detail.business_name || '—'} />
              <DT label="License state" value={detail.state || '—'} />
              <DT label="License #" value={detail.license_number || '—'} />
              <DT label="License expires" value={fmtDate(detail.guide_license_expires_at)} />
              <DT label="Address" value={[detail.address_street, detail.address_city, detail.address_state, detail.address_zip].filter(Boolean).join(', ') || '—'} />
              <DT label="Signed up" value={fmtDate(detail.signup_date)} />
              <DT label="Last activity" value={fmtDateTime(detail.last_activity_at)} />
            </DL>
          </div>
        </section>

        <section className="bb-tile">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Subscription</h2>
            <DL>
              <DT label="Tier" value={detail.tier === 'read_only' ? 'Read-only' : detail.tier[0].toUpperCase() + detail.tier.slice(1)} />
              <DT
                label="Plan"
                value={
                  detail.plan === 'monthly' ? '$9 / month'
                  : detail.plan === 'annual' ? '$90 / year'
                  : detail.plan === 'comp' ? `Comp until ${fmtDate(detail.subscription?.comp_until)}`
                  : '—'
                }
              />
              <DT label="DB status" value={detail.subscription?.status === 'incomplete' ? 'Setup incomplete' : detail.subscription?.status ?? '—'} />
              <DT label="Live Stripe status" value={detail.stripe_subscription?.status === 'incomplete' ? 'Setup incomplete' : detail.stripe_subscription?.status ?? '—'} />
              <DT label="Cancel at period end" value={detail.stripe_subscription?.cancel_at_period_end ? 'Yes' : 'No'} />
              <DT label="Trial ends" value={fmtDate(detail.subscription?.trial_end)} />
              <DT label="Period ends" value={detail.stripe_subscription?.current_period_end ? fmtUnix(detail.stripe_subscription.current_period_end) : fmtDate(detail.subscription?.current_period_end)} />
              <DT label="Default payment method" value={detail.stripe_subscription?.has_default_payment_method ? 'On file' : 'Missing'} />
              <DT label="Stripe customer" value={detail.subscription?.stripe_customer_id ?? '—'} />
              <DT label="Stripe subscription" value={detail.subscription?.stripe_subscription_id ?? '—'} />
            </DL>
            {detail.subscription?.status === 'incomplete' || detail.stripe_subscription?.status === 'incomplete' ? (
              <p className="bb-form-help" style={{ marginTop: '0.65rem' }}>
                <strong>Setup incomplete</strong> = signup started but payment was never confirmed
                (no card attached, abandoned checkout, etc.). The customer should restart checkout.
              </p>
            ) : null}
            {stripeCustomerUrl ? (
              <a
                href={stripeCustomerUrl}
                target="_blank"
                rel="noreferrer"
                className="bb-btn-secondary mt-3 inline-flex"
                style={{ alignItems: 'center', gap: 6 }}
              >
                <ExternalLink size={14} aria-hidden="true" />
                Open in Stripe
              </a>
            ) : null}
          </div>
        </section>
      </div>

      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Admin actions</h2>
          <p className="bb-form-help">
            Flip status is a DB-only override — Stripe stays unchanged. Comp this account writes
            comp_until and clears any Stripe subscription link from our row (the Stripe sub
            itself is left intact). Force reactivate creates a new Stripe subscription on the
            existing customer at the last-known interval.
          </p>
          <AdminGuideActions
            guideId={detail.guide_id}
            guideEmail={detail.email || ''}
            currentStatus={detail.subscription?.status ?? 'incomplete'}
            currentCompUntil={detail.subscription?.comp_until ?? null}
            hasStripeCustomer={!!detail.subscription?.stripe_customer_id}
          />
        </div>
      </section>

      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Invoices</h2>
          {detail.invoices.length === 0 ? (
            <p className="bb-form-help">No Stripe invoices yet.</p>
          ) : (
            <div className="bb-admin-table-wrap">
              <table className="bb-admin-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.number ?? inv.id.slice(0, 12)}</td>
                      <td>{fmtUnix(inv.created_unix)}</td>
                      <td>{inv.status}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(inv.amount_paid_cents, inv.currency)}</td>
                      <td>
                        {inv.hosted_invoice_url ? (
                          <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer" className="bb-text-action bb-text-action-copper" style={{ padding: 0 }}>
                            Open
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function DL({ children }: { children: React.ReactNode }) {
  return <dl className="bb-admin-dl">{children}</dl>
}
function DT({ label, value }: { label: string; value: string }) {
  return (
    <div className="bb-admin-dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
