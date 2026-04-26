# Bite Book — Supabase auth email templates

Paste each template into the matching block at:
**https://supabase.com/dashboard/project/bvggfptffblszijaqryc/auth/templates**

For each template:
1. Pick the template (Confirm signup / Magic Link / Reset Password / Invite user)
2. Set the **Subject** to the line at the top of the file
3. Replace the entire **Message body (HTML)** with the body of the file
4. Save

Sender display name: **Bite Book** (set in Project Settings → Auth → "Sender name").
Sender email stays on Supabase default (`noreply@mail.app.supabase.io`) until we set up SMTP from `noreply@bitebook.lastbite.pro` (DNS work pending — separate task).

The templates use the standard Supabase variables:
- `{{ .ConfirmationURL }}` — the link the user clicks
- `{{ .Email }}` — the recipient's address
- `{{ .Token }}` — for OTP codes (not used here, we use ConfirmationURL)

All templates are self-contained inline-CSS HTML so they survive every email client.
