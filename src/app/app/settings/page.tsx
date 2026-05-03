import Link from 'next/link'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const { user } = await requireGuide()

  // requireGuide() returns a slim guide projection; pull both rows here so
  // the form can edit every column. Run in parallel — they're independent.
  const supabase = await createClient()
  const [profileRes, guideRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, phone, address_street, address_street2, address_city, address_state, address_zip')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('guide_profiles')
      .select('business_name, max_party_size, specialties, bio')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const p = profileRes.data
  const g = guideRes.data

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Account</p>
        <h1 className="bb-page-title">Settings</h1>
        <p className="bb-page-sub">Your guide profile is what hunters and wardens see when you share a trip.</p>
      </header>

      <div className="bb-form-narrow">
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
                email: user.email ?? '',
              }}
            />
          </div>
        </section>

        {/* v25.9: 1-tap support link for mobile users (sidebar is hidden <1024px). */}
        <p className="mt-4" style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', textAlign: 'center' }}>
          Need a hand? <Link href="/app/support" className="bb-text-action bb-text-action-copper" style={{ display: 'inline', padding: 0 }}>Help</Link>
        </p>
      </div>
    </main>
  )
}
