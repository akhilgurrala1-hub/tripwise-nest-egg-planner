CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  data jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 3,
  revision integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their trips" ON public.trips
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners can create their trips" ON public.trips
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update their trips" ON public.trips
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete their trips" ON public.trips
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX trips_user_updated_idx ON public.trips (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.trips_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.data IS DISTINCT FROM OLD.data THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trips_touch_before_update
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.trips_touch();