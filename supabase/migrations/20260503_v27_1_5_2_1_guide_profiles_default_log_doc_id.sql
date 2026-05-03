-- v27.1.5.2.1: guide_profiles.default_log_doc_id -- remembers which Bite
-- Book template (or owned doc) the guide picked at onboarding Step 3 as
-- their go-to state harvest log. Used as the default selection in the
-- "Generate filled PDFs" picker on trip log pages, so guides don't have
-- to re-pick the same template every trip.
--
-- Nullable + ON DELETE SET NULL: a deleted doc shouldn't break the guide
-- profile, just clear the default. RLS on docs already gates whether the
-- guide can see the row; this column is just a pointer.
ALTER TABLE public.guide_profiles
  ADD COLUMN IF NOT EXISTS default_log_doc_id uuid NULL
    REFERENCES public.docs(id) ON DELETE SET NULL;
