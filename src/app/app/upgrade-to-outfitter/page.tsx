import { redirect } from 'next/navigation'
import { requireUser } from '../_lib/auth'
import OutfitterUpgradeWizard from './OutfitterUpgradeWizard'

// v28.1.0b — Outfitter upgrade wizard. Gated to guide-tier users.
// Existing outfitter members redirect back to /app to avoid creating
// a duplicate org. Hunter-tier users redirect to /app/h.
export default async function UpgradeToOutfitterPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>
}) {
  const { profile, user } = await requireUser()
  if (profile.account_tier === 'outfitter_owner' || profile.account_tier === 'outfitter_admin') {
    redirect('/app')
  }
  if (profile.role !== 'guide') {
    // Hunters can't upgrade. Bounce them home.
    redirect(profile.role === 'admin' ? '/admin' : '/app/h')
  }
  const sp = await searchParams
  const canceled = sp.canceled === 'true'

  return (
    <main className="bb-app-main">
      <OutfitterUpgradeWizard
        userEmail={user.email ?? null}
        canceled={canceled}
      />
    </main>
  )
}
