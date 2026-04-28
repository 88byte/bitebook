import Link from 'next/link'
import { requireGuide } from '../_lib/auth'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const { user } = await requireGuide()

  // requireGuide() returns a slim guide projection; pull the full row here so
  // the form can edit every column.
  const supabase = await createClient()
  const { data: full } = await supabase
    .from('guide_profiles')
    .select('business_name, state, license_number, max_party_size, specialties, bio')
    .eq('user_id', user.id)
    .maybeSingle()

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
                business_name: full?.business_name ?? '',
                state: full?.state ?? '',
                license_number: full?.license_number ?? '',
                max_party_size: full?.max_party_size ?? 6,
                specialties: full?.specialties ?? [],
                bio: full?.bio ?? '',
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
