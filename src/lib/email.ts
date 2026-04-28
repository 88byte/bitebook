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

// v26.2.1: branded HTML email shell. Used by all branded transactional
// emails (existing-hunter added, future review prompts, future chat
// notifications, etc.). Built as table-based layout with inline styles only
// because Gmail strips <style> tags in <head> and Outlook needs the table
// scaffolding to lay out reliably. Web-safe font fallback (no Barlow webfont
// — most email clients strip @font-face anyway).
//
// Caller supplies the inner content (eyebrow + headline + paragraphs + CTA).
// The shell wraps it in: dark page wrapper → centered logo → paper card →
// footer with support email.
export function wrapBitebookEmailHTML(opts: {
  origin: string                // e.g. https://bitebook.lastbite.pro — used for absolute logo URL
  preheader?: string            // hidden preview snippet shown by email clients next to subject
  eyebrow?: string              // small uppercase tracked label above the headline
  headline: string              // main bolded headline inside the card
  paragraphs: string[]          // body paragraphs, rendered in order
  ctaLabel?: string             // copper CTA button label
  ctaUrl?: string               // CTA href (typically loginUrl or accept-invite URL)
}): string {
  const {
    origin,
    preheader,
    eyebrow,
    headline,
    paragraphs,
    ctaLabel,
    ctaUrl,
  } = opts

  // v26.2.2: use the canonical transparent-skull mark that the live site
  // uses (AppHeader, Hero, Sidebar all reference this). The earlier
  // icon-512x512.png is the PWA maskable, which carries a rounded-square
  // wrapper that doesn't match the brand treatment in-app.
  const logoUrl = `${origin}/bb-logo-mark.png`

  // Hidden preheader snippet for the email-client preview line.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0B0806;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : ''

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 12px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;font-size:12px;color:#5C5247;text-align:center;">${escapeHtml(eyebrow)}</p>`
    : ''

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#1A1815;">${escapeHtml(p)}</p>`,
    )
    .join('\n')

  const ctaHtml = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px auto;">
            <tr>
              <td bgcolor="#B06C3C" style="border-radius:10px;">
                <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;font-size:14px;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(ctaLabel)}</a>
              </td>
            </tr>
          </table>`
    : ''

  // v26.3.1: dark band BEHIND the logo lives inside the inner content card,
  // not on the body/outer-table background. Gmail (web + iOS) and Outlook
  // sandbox the email into their own centered container with their own
  // (often white) wrapper, which strips the page-level background-color and
  // makes the white-skull bb-logo-mark.png invisible. Keeping the dark
  // band as a top row of the inner card guarantees the logo sits on
  // #0B0806 in every client.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>Bite Book</title>
</head>
<body style="margin:0;padding:0;background:#0B0806;font-family:'Helvetica Neue',Arial,sans-serif;color:#1A1815;">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0806;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;border-collapse:separate;">
          <tr>
            <td align="center" bgcolor="#0B0806" style="background:#0B0806;background-color:#0B0806;padding:36px 16px 28px 16px;border-radius:14px 14px 0 0;">
              <img src="${logoUrl}" alt="Bite Book" width="96" height="96" style="display:block;border:0;outline:none;text-decoration:none;width:96px;height:96px;">
            </td>
          </tr>
          <tr>
            <td bgcolor="#FAF7F2" style="background:#FAF7F2;background-color:#FAF7F2;padding:28px 24px;border-radius:0 0 14px 14px;">
              ${eyebrowHtml}
              <h1 style="margin:0 0 16px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#1A1815;text-align:center;">${escapeHtml(headline)}</h1>
              ${paragraphsHtml}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 12px 8px 12px;">
              <p style="margin:0 0 4px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#6E665B;">© 2026 Bite Book · Field-tested for guides and hunters</p>
              <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#6E665B;">Questions? <a href="mailto:support@lastbite.pro" style="color:#C9C2B8;text-decoration:underline;">support@lastbite.pro</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Tiny HTML-escape for user-supplied strings injected into the template
// (guide name, business name, etc.). Keeps the email body safe even if a
// guide's display_name contains markup-ish characters.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Body builder for the v25.7 "existing hunter added" email — used when a
// guide invites someone whose email already belongs to a Bite Book hunter
// account. We skip token-based registration entirely and just point them at
// /login. Kept as a constant so future actions (e.g. party invites that hit
// the same path) can reuse it.
//
// v26.2.1: now returns both `text` (plaintext fallback for older clients +
// spam scoring) AND `html` (branded body using wrapBitebookEmailHTML). Caller
// passes `origin` so the logo URL is absolute and the CTA link is correct.
// Also accepts optional businessName so the body can read "{guide} from
// {business} added you" when the guide has a business set.
export function buildExistingHunterAddedEmail(opts: {
  guideLabel: string
  businessName?: string | null
  loginUrl: string
  origin: string
}): { subject: string; text: string; html: string } {
  const { guideLabel, businessName, loginUrl, origin } = opts
  const guideHeader = businessName?.trim()
    ? `${guideLabel} from ${businessName.trim()}`
    : guideLabel

  const subject = `${guideLabel} added you to Bite Book`
  const text = [
    'Hi there,',
    '',
    `${guideHeader} added you to their Bite Book network. You don't need to do anything to join — they'll add you to upcoming trips and you'll see them in your app.`,
    '',
    `Sign in to see your trips and connect: ${loginUrl}`,
    '',
    '— Bite Book',
    'Questions? support@lastbite.pro',
  ].join('\n')

  const html = wrapBitebookEmailHTML({
    origin,
    preheader: `${guideHeader} added you to their Bite Book network. Sign in to see your trips.`,
    eyebrow: "You're connected",
    headline: `${guideHeader} added you to their network`,
    paragraphs: [
      `${guideHeader} added you to their Bite Book network. You don't need to do anything to join — they'll add you to upcoming trips and you'll see them in your app.`,
      'Sign in to see your trips and connect.',
    ],
    ctaLabel: 'Open Bite Book',
    ctaUrl: loginUrl,
  })

  return { subject, text, html }
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
