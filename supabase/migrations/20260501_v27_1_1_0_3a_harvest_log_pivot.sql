-- v27.1.1.0.3a — harvest log architectural pivot.
-- Drops the harvests table entirely (no backward compat — product not live)
-- and replaces it with a normalized log/entry/species model rooted on the
-- TRIP rather than per-kill rows.

DROP FUNCTION IF EXISTS public._on_harvest_consume_tag() CASCADE;
DROP TABLE IF EXISTS public.harvests CASCADE;

CREATE TABLE public.harvest_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  log_date     date,
  total_hours  numeric(6,2),
  trip_purpose jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_harvest_logs_trip ON public.harvest_logs(trip_id);
ALTER TABLE public.harvest_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_logs_guide_all ON public.harvest_logs
  FOR ALL TO authenticated
  USING (public._is_trip_owner(trip_id, auth.uid()))
  WITH CHECK (public._is_trip_owner(trip_id, auth.uid()));
CREATE POLICY harvest_logs_hunter_select ON public.harvest_logs
  FOR SELECT TO authenticated
  USING (public._is_trip_participant(trip_id, auth.uid()));

CREATE TABLE public.harvest_log_entries (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id                   uuid NOT NULL REFERENCES public.harvest_logs(id) ON DELETE CASCADE,
  hunter_id                uuid REFERENCES public.profiles(id),
  guest_name               text,
  license_wallet_item_id   uuid REFERENCES public.wallet_items(id) ON DELETE SET NULL,
  tag_wallet_item_id       uuid REFERENCES public.wallet_items(id) ON DELETE SET NULL,
  qty_harvested            int  NOT NULL DEFAULT 0 CHECK (qty_harvested >= 0),
  qty_kept                 int  NOT NULL DEFAULT 0 CHECK (qty_kept >= 0),
  qty_released             int  NOT NULL DEFAULT 0 CHECK (qty_released >= 0),
  notes                    text,
  include_in_report        boolean NOT NULL DEFAULT true,
  hunter_phone_snapshot    text,
  hunter_address_snapshot  jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hle_log    ON public.harvest_log_entries(log_id);
CREATE INDEX idx_hle_hunter ON public.harvest_log_entries(hunter_id);
CREATE INDEX idx_hle_tag    ON public.harvest_log_entries(tag_wallet_item_id);
ALTER TABLE public.harvest_log_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY hle_guide_all ON public.harvest_log_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.harvest_logs hl
            WHERE hl.id = harvest_log_entries.log_id
              AND public._is_trip_owner(hl.trip_id, auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.harvest_logs hl
            WHERE hl.id = harvest_log_entries.log_id
              AND public._is_trip_owner(hl.trip_id, auth.uid())));
CREATE POLICY hle_hunter_self_select ON public.harvest_log_entries
  FOR SELECT TO authenticated USING (hunter_id = auth.uid());

CREATE TABLE public.harvest_log_entry_species (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      uuid NOT NULL REFERENCES public.harvest_log_entries(id) ON DELETE CASCADE,
  species       text,
  qty_harvested int NOT NULL DEFAULT 0 CHECK (qty_harvested >= 0),
  qty_kept      int NOT NULL DEFAULT 0 CHECK (qty_kept >= 0),
  qty_released  int NOT NULL DEFAULT 0 CHECK (qty_released >= 0),
  position      smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hles_entry ON public.harvest_log_entry_species(entry_id);
ALTER TABLE public.harvest_log_entry_species ENABLE ROW LEVEL SECURITY;
CREATE POLICY hles_guide_all ON public.harvest_log_entry_species
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.harvest_log_entries hle
            JOIN public.harvest_logs hl ON hl.id = hle.log_id
            WHERE hle.id = harvest_log_entry_species.entry_id
              AND public._is_trip_owner(hl.trip_id, auth.uid())))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.harvest_log_entries hle
            JOIN public.harvest_logs hl ON hl.id = hle.log_id
            WHERE hle.id = harvest_log_entry_species.entry_id
              AND public._is_trip_owner(hl.trip_id, auth.uid())));
CREATE POLICY hles_hunter_self_select ON public.harvest_log_entry_species
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.harvest_log_entries hle
            WHERE hle.id = harvest_log_entry_species.entry_id
              AND hle.hunter_id = auth.uid()));

CREATE OR REPLACE FUNCTION public._harvest_log_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_hl_updated_at  BEFORE UPDATE ON public.harvest_logs
  FOR EACH ROW EXECUTE FUNCTION public._harvest_log_set_updated_at();
CREATE TRIGGER trg_hle_updated_at BEFORE UPDATE ON public.harvest_log_entries
  FOR EACH ROW EXECUTE FUNCTION public._harvest_log_set_updated_at();
CREATE TRIGGER trg_hles_updated_at BEFORE UPDATE ON public.harvest_log_entry_species
  FOR EACH ROW EXECUTE FUNCTION public._harvest_log_set_updated_at();

CREATE OR REPLACE FUNCTION public._on_harvest_log_entry_consume_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_single_use boolean;
  v_old_tag    uuid;
BEGIN
  v_old_tag := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.tag_wallet_item_id ELSE NULL END;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.tag_wallet_item_id IS NOT NULL THEN
    SELECT single_use INTO v_single_use FROM public.wallet_items WHERE id = NEW.tag_wallet_item_id;
    IF v_single_use IS TRUE THEN
      UPDATE public.wallet_items
      SET tagged_out_at = COALESCE(tagged_out_at, now())
      WHERE id = NEW.tag_wallet_item_id;
    END IF;
  END IF;
  IF v_old_tag IS NOT NULL
     AND (TG_OP = 'DELETE' OR v_old_tag IS DISTINCT FROM NEW.tag_wallet_item_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.harvest_log_entries
      WHERE tag_wallet_item_id = v_old_tag
        AND id <> COALESCE(OLD.id, NEW.id)
    ) THEN
      UPDATE public.wallet_items SET tagged_out_at = NULL WHERE id = v_old_tag;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_hle_consume_tag
  AFTER INSERT OR UPDATE OR DELETE ON public.harvest_log_entries
  FOR EACH ROW EXECUTE FUNCTION public._on_harvest_log_entry_consume_tag();
