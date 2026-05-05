import Link from 'next/link'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SettingsForm from './SettingsForm'
import SignatureDefaultsForm from './SignatureDefaultsForm'
import BillingPanel from './BillingPanel'

// v27.4.0 — Settings page reorganized into Profile + Billing tabs.
// Server-rendered tabs driven by ?tab=profile|billing (default profile).
// Profile fetches everything below in parallel; Billing pulls subscription
// state from outfitter_subscriptions.

type SearchParams = Promise<{ tab?: string; billing_error?: string }>

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { user } = await requireGuide()
  const sp = await searchParams
  const tab: 'profile' | 'billing' = sp.tab === 'billing' ? 'billing' : 'profile'
  const billingError = typeof sp.billing_error === 'string' ? sp.billing_error : null

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Account</p>
        <h1 className="bb-page-title">Settings</h1>
        <p className="bb-page-sub">
          Your guide profile, defaults, and billing.
        </p>
      </header>

      {/* v27.4.0 — tab switcher. Sticky-ish at the top of the page so it
          stays visible as the user scrolls a long Profile tab. */}
      <nav
        aria-label="Settings sections"
        style={{
          marginTop: '1rem',
          display: 'flex',
          gap: '0.4rem',
          borderBottom: '1px solid var(--color-card-divider)',
        }}
      >
        <SettingsTab href="/app/settings?tab=profile" label="Profile" active={tab === 'profile'} />
        <SettingsTab href="/app/settings?tab=billing" label="Billing" active={tab === 'billing'} />
      </nav>

      <div className="bb-form-narrow">
        {tab === 'profile' ? (
          <ProfileTab userId={user.id} email={user.email ?? ''} />
        ) : (
          <BillingPanel guideId={user.id} billingError={billingError} />
        )}

        {/* v25.9: 1-tap support link for mobile users (sidebar is hidden <1024px). */}
        <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
          Need a hand?{' '}
          <Link href="/app/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>
            Help
          </Link>
        </p>
      </div>
    </main>
  )
}

function SettingsTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '0.6rem 1rem',
        fontWeight: 600,
        fontSize: '0.95rem',
        borderBottom: active ? '2px solid var(--color-copper)' : '2px solid transparent',
        marginBottom: -1,
        color: active ? 'var(--color-copper)' : 'var(--color-ink-soft)',
        textDecoration: 'none',
      }}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}

async function ProfileTab({ userId, email }: { userId: string; email: string }) {
  // Pull every Profile-tab data source in parallel.
  const supabase = await createClient()
  const [profileRes, guideRes, logDocsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, phone, address_street, address_street2, address_city, address_state, address_zip')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select(
        'business_name, max_party_size, specialties, bio, state, license_number, guide_license_expires_at, default_log_doc_id, default_signature_path'
      )
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('docs')
      .select('id, label, state')
      .eq('guide_id', userId)
      .eq('kind', 'log')
      .is('archived_at', null)
      .order('label', { ascending: true }),
  ])

  const p = profileRes.data
  const g = guideRes.data
  const logDocs = (logDocsRes.data ?? []).map((d) => ({
    id: d.id,
    label: d.label,
    state: d.state,
  }))

  // v27.4.0 — load the saved default signature as a base64 data URL.
  // Uses the admin client so the signed-URL roundtrip is avoided —
  // the binary lands inline in the rendered HTML (~30-80 KB typical).
  // Storage RLS still gates the write path; this read uses service-
  // role to bypass RLS but the path is keyed by the verified user
  // id so a guide can only ever load their own signature.
  let signatureDataUrl: string | null = null
  if (g?.default_signature_path) {
    try {
      const admin = createAdminClient()
      const { data: blob } = await admin.storage.from('bb-private').download(g.default_signature_path)
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer())
        signatureDataUrl = `data:image/png;base64,${buf.toString('base64')}`
      }
    } catch (e) {
      console.warn('[settings] default-signature load failed', e)
    }
  }

  return (
    <>
      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <SettingsForm
            initial={{
              first_name: p?.first_name ?? '',
              last_name: p?.last_name ?? '',
              phone: p?.phone ?? '',
              address_street: p?.address_street ?? '',
              address_street2: p?.address_street2 ?? '',
              address_city: p?.address_city ?? '',
              address_state: p?.address_state ?? '',
              address_zip: p?.address_zip ?? '',
              business_name: g?.business_name ?? '',
              max_party_size: g?.max_party_size ?? 6,
              specialties: g?.specialties ?? [],
              bio: g?.bio ?? '',
              license_state: g?.state ?? '',
              license_number: g?.license_number ?? '',
              license_expires_at: g?.guide_license_expires_at ?? '',
              default_log_doc_id: g?.default_log_doc_id ?? '',
              email,
            }}
            logDocs={logDocs}
          />
        </div>
      </section>

      {/* v27.4.0 — Signature defaults. Lives outside the SettingsForm
          submit because it has its own action (binary upload) and
          its own immediate-save UX — drawing + tapping Save default
          shouldn't require submitting the rest of the profile. */}
      <section className="bb-tile mt-4">
        <div className="bb-tile-body">
          <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>Signature defaults</h2>
          <SignatureDefaultsForm
            initialDataURL={signatureDataUrl}
            hasSaved={!!g?.default_signature_path}
          />
        </div>
      </section>
    </>
  )
}
