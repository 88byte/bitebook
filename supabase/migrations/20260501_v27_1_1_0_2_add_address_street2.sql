-- v27.1.1.0.2 — add optional address_street2 to profiles for state forms
-- that ask for apartment / suite / unit lines. The existing single-line
-- address_street covers most cases; street2 is purely additive and stays
-- nullable so v25.9.1+ data continues to satisfy profile_set.

ALTER TABLE public.profiles
ADD COLUMN address_street2 text;

COMMENT ON COLUMN public.profiles.address_street2 IS
  'Optional second address line (apt / suite / unit). v27.1.1.0.2.';
