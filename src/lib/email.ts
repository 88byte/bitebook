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

// Body builder for the v25.7 "existing hunter added" email — used when a
// guide invites someone whose email already belongs to a Bite Book hunter
// account. We skip token-based registration entirely and just point them at
// /login. Kept as a constant so future actions (e.g. party invites that hit
// the same path) can reuse it.
export function buildExistingHunterAddedEmail(opts: {
  guideLabel: string
  loginUrl: string
}): { subject: string; text: string } {
  return {
    subject: `${opts.guideLabel} added you to Bite Book`,
    text: [
      'Hi,',
      '',
      `${opts.guideLabel} added you to their Bite Book network. Sign in to see your trips.`,
      '',
      `Sign in: ${opts.loginUrl}`,
    ].join('\n'),
  }
}

export type EmailResult =
  | { sent: true; id?: string }
  | {
      sent: false
      reason: 'no_api_key' | 'send_failed'
      /** Cleaned-up Resend error message ("Domain not found", "API key is invalid", etc.). */
      error?: string
      /** Resend error name like 'validation_error' / 'not_found' / 'invalid_api_key'. */
      code?: string
      /** HTTP status from Resend (when applicable). */
      status?: number
    }

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
      // Resend errors come back as JSON like:
      //   { name: 'validation_error', message: 'The bitebook.lastbite.pro domain is not verified.', statusCode: 403 }
      // Parse the JSON when possible; fall back to the raw text body.
      const errText = await res.text().catch(() => '<unreadable>')
      let code: string | undefined
      let message: string | undefined
      try {
        const parsed = JSON.parse(errText) as { name?: string; message?: string }
        code = parsed.name
        message = parsed.message
      } catch {
        message = errText
      }
      console.warn('[email] resend non-2xx', {
        status: res.status,
        code,
        message,
        body: errText,
        to,
        subject: opts.subject,
      })
      return {
        sent: false,
        reason: 'send_failed',
        status: res.status,
        code,
        error: message ?? `${res.status}`,
      }
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string }
    return { sent: true, id: json.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[email] resend send failed', { error: msg, to, subject: opts.subject })
    return { sent: false, reason: 'send_failed', error: msg }
  }
}
