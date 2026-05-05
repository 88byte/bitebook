-- v27.6.0.2 — Revert v27.6.0's role flip. Admin determination
-- moves to email-match only via ADMIN_EMAILS in requireAdmin(),
-- which means a guide can ALSO be admin without losing /app
-- access. The v27.6.0 migration set Flavio's role='admin', but
-- requireGuide() rejects role!=='guide' on every /app page, so
-- admin role meant Flavio couldn't load his guide dashboard.
--
-- Idempotent — only flips a row currently set to 'admin' AND
-- belonging to the admin email, so re-running won't clobber any
-- intentional non-Flavio admin assignments.
UPDATE public.profiles
SET role = 'guide'
WHERE id = (
  SELECT id FROM auth.users
  WHERE lower(email) = 'flaviod022@gmail.com'
  LIMIT 1
)
AND role = 'admin';
