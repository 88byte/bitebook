-- v27.1.1.0.3a.1 — total_hours moves from harvest_logs (trip-level) to
-- harvest_log_entries (per-hunter). Different hunters can have different
-- hours on the same trip. Forms that need a single trip-level total can
-- consume a derived sum source via the mapping engine.

ALTER TABLE public.harvest_logs DROP COLUMN total_hours;
ALTER TABLE public.harvest_log_entries
  ADD COLUMN total_hours numeric(6,2);
COMMENT ON COLUMN public.harvest_log_entries.total_hours IS
  'Total hours this hunter spent on the trip. v27.1.1.0.3a.1 (was on harvest_logs).';
