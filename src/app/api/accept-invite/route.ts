import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  let body: { token?: string; password?: string; displayName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { token, password, displayName } = body
  if (!token || !password || !displayName) {
    return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const { data: invite } = await admin
    .from('invitations')
    .select('id, email, status, expires_at, guide_id')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
  if (invite.status === 'accepted') return NextResponse.json({ error: 'Invite already used.' }, { status: 409 })
  if (invite.status === 'revoked') return NextResponse.json({ error: 'Invite revoked.' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) {
    await admin.from('invitations').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: 'Invite expired.' }, { status: 410 })
  }

  // Create the auth user with the chosen password, email pre-confirmed (we trust the token).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, invited_by: invite.guide_id },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Could not create account.' }, { status: 500 })
  }

  const userId = created.user.id

  // Profile (role=hunter). If a profile row already exists from a trigger, upsert.
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, display_name: displayName, role: 'hunter' }, { onConflict: 'id' })
  if (profileErr) {
    return NextResponse.json({ error: `Profile creation failed: ${profileErr.message}` }, { status: 500 })
  }

  // Mark invite accepted
  await admin
    .from('invitations')
    .update({ status: 'accepted', accepted_by: userId })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
