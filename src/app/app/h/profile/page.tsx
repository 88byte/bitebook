import { requireHunter } from '../../_lib/auth'
import HunterProfileForm from './HunterProfileForm'

export default async function HunterProfilePage() {
  const { profile } = await requireHunter()

  return (
    <main className="bb-app-main">
      <header>
        <p className="bb-page-eyebrow">Account</p>
        <h1 className="bb-page-title">Profile</h1>
        <p className="bb-page-sub">
          Your name and phone are what your guide sees on shared trips.
        </p>
      </header>

      <div className="bb-form-narrow">
        <section className="bb-tile mt-4">
          <div className="bb-tile-body">
            <HunterProfileForm
              initial={{
                display_name: profile.display_name ?? '',
                phone: profile.phone ?? '',
                avatar_url: profile.avatar_url ?? null,
              }}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
