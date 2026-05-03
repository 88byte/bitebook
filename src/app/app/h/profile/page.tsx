import Link from 'next/link'
import { requireHunter } from '../../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import HunterProfileForm from './HunterProfileForm'

// v26.0 Batch A: pulls expanded profile fields (first/last name, address)
// for the profile form. requireHunter() returns only the thin set needed
// for routing — we hit profiles directly here for the fields the form binds.
//
// v27.1.1.0.3e.4: license_doc_id no longer surfaced. Hunter licenses live
// in the wallet (trip_wallet_items → wallet_items) and the harvest-log
// fill engine reads them from there exclusively.
export default async function HunterProfilePage() {
  const { user, profile } = await requireHunter()

  const supabase = await createClient()
  const { data: extended } = await supabase
    .from('profiles')
    .select(
      'first_name, last_name, address_street, address_street2, address_city, address_state, address_zip'
    )
    .eq('id', user.id)
    .maybeSingle()

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Account</p>
        <h1 className="bb-page-title">Profile</h1>
        <p className="bb-page-sub">
          Your name and address help your guide pre-fill state hunter logs.
        </p>
      </header>

      <div className="bb-form-narrow">
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <HunterProfileForm
              initial={{
                display_name: profile.display_name ?? '',
                first_name: extended?.first_name ?? '',
                last_name: extended?.last_name ?? '',
                phone: profile.phone ?? '',
                address_street: extended?.address_street ?? '',
                address_street2: extended?.address_street2 ?? '',
                address_city: extended?.address_city ?? '',
                address_state: extended?.address_state ?? '',
                address_zip: extended?.address_zip ?? '',
                avatar_url: profile.avatar_url ?? null,
              }}
            />
          </div>
        </section>

        {/* v25.9: 1-tap support link for mobile users (sidebar is hidden <1024px). */}
        <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
          Need a hand? <Link href="/app/h/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>Help</Link>
        </p>
      </div>
    </main>
  )
}
