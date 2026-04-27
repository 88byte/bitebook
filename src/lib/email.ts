// Centralized Bite Book transactional email send via Resend's HTTP API.
//
// All product emails (invites, password reset, review prompts, chat
// notifications, party invites, etc.) flow through here so:
//   - The branded From is set in one place (`bitebook.lastbite.pro` is
//     send-only; no inbox listens on it).
//   - The Reply-To is `support@lastbite.pro` (Flavio's monitored inbox) so
//     replies don't disappear into the void.
//   - Future email types automatically inherit both — no need for each new
//     feature to remember.
//
// Best-effort: returns { sent: false, ... } if RESEND_API_KEY is missing or
// the Resend API errors. Callers should not block their own success path on
// email send.
//
// NOTE: Supabase Auth emails (signup confirm, password reset, magic link)
// are separate. Those flow through Supabase's SMTP, not this helper. To
// brand those + route their replies, configure Supabase Custom SMTP to use
// Resend (Authentication → Settings → SMTP) with the same domain — slated
// for v26.

const FROM_DEFAULT = 'Bite Book <invites@bitebook.lastbite.pro>'
const REPLY_TO = 'support@lastbite.pro'

export type EmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: 'no_api_key' | 'send_failed'; error?: string }

export async function sendBitebookEmail(opts: {
  to: string | string[]
  subject: string
  text: string
  html?: string
  /** Override the default From per-email. Default: invites@bitebook.lastbite.pro. */
  from?: string
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set; skipping send', {
      to: opts.to,
      subject: opts.subject,
    })
    return { sent: false, reason: 'no_api_key' }
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to]

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: opts.from ?? FROM_DEFAULT,
        to,
        reply_to: REPLY_TO,
        subject: opts.subject,
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '<unreadable>')
      console.warn('[email] resend non-2xx', {
        status: res.status,
        body: errText,
        to,
        subject: opts.subject,
      })
      return { sent: false, reason: 'send_failed', error: `${res.status}: ${errText}` }
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string }
    return { sent: true, id: json.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[email] resend send failed', { error: msg, to, subject: opts.subject })
    return { sent: false, reason: 'send_failed', error: msg }
  }
}
