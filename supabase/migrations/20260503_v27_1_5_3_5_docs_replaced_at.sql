-- v27.1.5.3.5: docs.replaced_at -- audit timestamp for the "Replace PDF"
-- action. NULL = doc has never been replaced (still on its original
-- upload). Non-null = guide or admin replaced the underlying PDF on this
-- doc, preserving its id / label / mappings / default-pointer references.
ALTER TABLE public.docs
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz NULL;
