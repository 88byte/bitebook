// v27.4.0 — guide default-signature loader.
//
// Server-side helper used by trip pages + harvest log pages to
// hydrate the guide's saved default signature into a base64 data URL.
// Sign modals (SignModal, SignAsGuideModal) accept the data URL and
// pass it to SignaturePad as `initialDataURL` so the canvas pre-fills
// with the signature image — guides accept-with-one-click or tap
// "Re-draw" to override per-event.
//
// Returns null when:
//   - guide has no saved default
//   - storage download fails (logged, non-fatal)
//
// Uses the admin client to bypass RLS on the storage read. The path
// is keyed by the verified user id and resolved inside the action,
// so a guide can never load another user's signature even though the
// admin client itself is service-role.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function loadGuideDefaultSignatureDataUrl(userId: string): Promise<string | null> {
  // Read the path via the user-scoped client first — this confirms
  // the row belongs to the caller (defense-in-depth) and respects
  // RLS without an extra admin call when the guide has no default.
  const supabase = await createClient()
  const { data: g } = await supabase
    .from('guide_profiles')
    .select('default_signature_path')
    .eq('user_id', userId)
    .maybeSingle()
  const path = g?.default_signature_path ?? null
  if (!path) return null

  try {
    const admin = createAdminClient()
    const { data: blob } = await admin.storage.from('bb-private').download(path)
    if (!blob) return null
    const buf = Buffer.from(await blob.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch (e) {
    console.warn('[loadGuideDefaultSignatureDataUrl] download failed', e)
    return null
  }
}
