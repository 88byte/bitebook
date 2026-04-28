-- v26.0 Batch A: profiles.license_doc_id.
-- Hunter onboarding now collects the state hunter license number on
-- /app/h/profile so guides can pre-fill state hunter logs (Batch C).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS license_doc_id text;
