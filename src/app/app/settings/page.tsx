import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SettingsForm from './SettingsForm'
import SignatureDefaultsForm from './SignatureDefaultsForm'
import BillingPanel from './BillingPanel'
import OutfitterLogoUploader from './OutfitterLogoUploader'
import OutfitterDefaultLogPicker from './OutfitterDefaultLogPicker'
import OutfitterAdminTeam from './OutfitterAdminTeam'
import { fetchOutfitterTeamSnapshot } from './team-actions'

// v27.4.0 — Settings page reorganized into Profile + Billing tabs.
// Server-rendered tabs driven by ?tab=profile|billing (default profile).
// Profile fetches everything below in parallel; Billing pulls subscription
// state from outfitter_subscriptions.
//
// v28.1.0b — Profile tab now also surfaces a tier-aware Account card at
// the top: solo guides see an Upgrade-to-Outfitter CTA; outfitter owners
// see org info (name, state, license, address, logo) + a manage-billing
// link. Outfitter admins (joining members) see a read-only org info
// snapshot. Downgrade lands in v28.1.0d.

type SearchParams = Promise<{ tab?: string; billing_error?: string }>

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { user, profile } = await requireGuide()
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
          <ProfileTab
            userId={user.id}
            email={user.email ?? ''}
            accountTier={profile.account_tier}
            currentOrgId={profile.current_outfitter_org_id}
          />
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

async function ProfileTab({
  userId,
  email,
  accountTier,
  currentOrgId,
}: {
  userId: string
  email: string
  accountTier: string | null
  currentOrgId: string | null
}) {
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

  // v28.1.0b — tier-aware Account card. Lands at the top of the
  // Profile tab so it's the first thing the guide sees.
  // - Guide (no tier set or 'guide'): Upgrade-to-Outfitter CTA
  // - outfitter_owner: org snapshot + Manage billing link
  // - outfitter_admin: read-only org snapshot
  const isSoloGuide = accountTier === null || accountTier === 'guide'
  const isOutfitterOwner = accountTier === 'outfitter_owner'
  const isOutfitterAdmin = accountTier === 'outfitter_admin'

  let orgSnapshot: {
    name: string
    state: string | null
    outfitter_license_number: string | null
    business_address: string | null
    logo_url: string | null
    subscription_status: string | null
    default_log_doc_id: string | null
  } | null = null
  if ((isOutfitterOwner || isOutfitterAdmin) && currentOrgId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('outfitter_orgs')
      .select('name, state, outfitter_license_number, business_address, logo_url, subscription_status, default_log_doc_id')
      .eq('id', currentOrgId)
      .maybeSingle()
    orgSnapshot = data ?? null
  }

  // v28.1.0c — Team snapshot for the Admin team section. Null when
  // the user isn't on an outfitter org.
  const teamSnapshot = (isOutfitterOwner || isOutfitterAdmin)
    ? await fetchOutfitterTeamSnapshot()
    : null

  return (
    <>
      {isSoloGuide && (
        <Link
          href="/app/upgrade-to-outfitter"
          className="bb-tile mt-4"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            padding: '1rem 1.1rem',
            textDecoration: 'none',
            background: 'linear-gradient(135deg, rgba(168, 92, 50, 0.12), rgba(168, 92, 50, 0.03))',
            borderColor: 'var(--color-copper)',
            color: 'var(--color-ink)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 8,
              background: 'var(--color-copper)',
              color: '#FFFFFF',
            }}
          >
            <Building2 size={20} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: '0.98rem' }}>
              Upgrade to Outfitter
            </strong>
            <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-ink-soft)' }}>
              Run an org with up to 3 admins, a shared guide network, and
              org-wide hunters &amp; calendar. 7-day free trial.
            </span>
          </span>
          <ArrowRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-copper)' }} />
        </Link>
      )}

      {(isOutfitterOwner || isOutfitterAdmin) && orgSnapshot && (
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <h2 className="bb-form-section-head" style={{ marginTop: 0 }}>
              {isOutfitterOwner ? 'Your outfitter org' : 'Outfitter org'}
            </h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flexShrink: 0 }}>
                {orgSnapshot.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={orgSnapshot.logo_url}
                    alt={`${orgSnapshot.name} logo`}
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
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-ink)' }}>
                  {orgSnapshot.name}
                </div>
                <dl
                  style={{
                    marginTop: '0.5rem',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: '0.75rem',
                    rowGap: '0.25rem',
                    fontSize: '0.88rem',
                  }}
                >
                  <dt style={{ color: 'var(--color-ink-muted)' }}>State</dt>
                  <dd style={{ margin: 0, color: 'var(--color-ink)' }}>{orgSnapshot.state || 'Not set'}</dd>
                  <dt style={{ color: 'var(--color-ink-muted)' }}>License</dt>
                  <dd style={{ margin: 0, color: 'var(--color-ink)' }}>{orgSnapshot.outfitter_license_number || 'Not set'}</dd>
                  <dt style={{ color: 'var(--color-ink-muted)' }}>Address</dt>
                  <dd style={{ margin: 0, color: 'var(--color-ink)' }}>{orgSnapshot.business_address || 'Not set'}</dd>
                  <dt style={{ color: 'var(--color-ink-muted)' }}>Subscription</dt>
                  <dd style={{ margin: 0, color: 'var(--color-ink)', textTransform: 'capitalize' }}>
                    {orgSnapshot.subscription_status || 'unknown'}
                  </dd>
                </dl>
                {isOutfitterOwner && (
                  <p className="bb-form-help" style={{ marginTop: '0.6rem' }}>
                    Inline edit + Stripe billing portal land in v28.1.0c. For now,
                    email{' '}
                    <a
                      href="mailto:support@lastbite.pro"
                      className="bb-text-action bb-text-action-copper"
                      style={{ display: 'inline', padding: 0 }}
                    >
                      support@lastbite.pro
                    </a>{' '}
                    to change org details or billing. Downgrade is coming soon.
                  </p>
                )}
                {isOutfitterAdmin && (
                  <p className="bb-form-help" style={{ marginTop: '0.6rem' }}>
                    You&rsquo;re an admin on this org. Contact the owner to update org details.
                  </p>
                )}
              </div>
            </div>
            {/* v28.1.0b.3 — Self-serve logo upload for outfitter owners.
                Lets an owner fix or replace their org logo after the
                wizard (handy when the wizard upload didn't land or for
                rebranding). Hidden from admins — owner-only. */}
            {isOutfitterOwner && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-card-divider)' }}>
                <h3 className="bb-section-title" style={{ margin: '0 0 0.5rem' }}>Org logo</h3>
                <OutfitterLogoUploader currentLogoUrl={orgSnapshot.logo_url} />
              </div>
            )}

            {/* v28.1.0b.6 — Org-wide default state hunt log. Moved out
                of SettingsForm "Account & defaults" to live alongside
                org-level metadata (per Flavio: org → logo → default
                log → admin team). Save-on-change, no submit button. */}
            {isOutfitterOwner && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-card-divider)' }}>
                <h3 className="bb-section-title" style={{ margin: '0 0 0.5rem' }}>Default hunt log</h3>
                <OutfitterDefaultLogPicker
                  orgState={orgSnapshot.state}
                  currentDocId={orgSnapshot.default_log_doc_id}
                />
              </div>
            )}

            {/* v28.1.0c — Admin team section. Visible to owners +
                admins. Mutations (invite, resend, revoke, remove)
                are owner-only and the server actions enforce that
                again — the team-actions module raises if a non-owner
                tries to invoke them. */}
            {teamSnapshot && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-card-divider)' }}>
                <h3 className="bb-section-title" style={{ margin: '0 0 0.5rem' }}>Admin team</h3>
                <OutfitterAdminTeam snapshot={teamSnapshot} />
              </div>
            )}
          </div>
        </section>
      )}

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
