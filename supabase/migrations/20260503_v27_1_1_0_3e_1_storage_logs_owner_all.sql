-- v27.1.1.0.3e.1 — bb-private storage RLS for the `logs/` prefix.
-- Generated harvest-log PDFs land at `logs/{guide_id}/{trip_id}/<file>.pdf`
-- in harvest-log-fill.ts. The bucket already has owner policies for
-- `wallet/` and `docs/` prefixes but never had one for `logs/`, so the
-- engine's upload was hitting "new row violates row-level security
-- policy" on every Generate filled PDFs run.
--
-- Mirrors the docs_owner_* pattern: bucket gate + foldername[1]='logs'
-- + foldername[2]=auth.uid(). Single ALL policy covering INSERT/UPDATE/
-- DELETE/SELECT — guides only ever see/touch their own log outputs.

CREATE POLICY logs_owner_all
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'logs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'logs'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
