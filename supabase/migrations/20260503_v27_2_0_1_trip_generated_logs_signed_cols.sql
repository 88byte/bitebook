-- v27.2.0.1: add signing columns to trip_generated_logs.
ALTER TABLE public.trip_generated_logs
  ADD COLUMN IF NOT EXISTS signed_file_path text NULL,
  ADD COLUMN IF NOT EXISTS signed_file_name text NULL,
  ADD COLUMN IF NOT EXISTS signed_at        timestamptz NULL;
