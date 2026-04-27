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
    </main>
  )
}
