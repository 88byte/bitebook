-- v27.2.0.1: signed/{auth.uid()}/... storage RLS. Mirrors the
-- logs_owner_all policy from v27.1.1.0.3e.1.
CREATE POLICY signed_owner_all
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'signed'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'bb-private'
    AND (storage.foldername(name))[1] = 'signed'
    AND (storage.foldername(name))[2] = (auth.uid())::text
  );
