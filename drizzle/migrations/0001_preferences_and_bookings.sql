CREATE TABLE public.traveler_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  home_city text NOT NULL DEFAULT '' CHECK (char_length(home_city) <= 120),
  home_airport text NOT NULL DEFAULT '' CHECK (home_airport = '' OR home_airport ~ '^[A-Z]{3}$'),
  travel_style text NOT NULL DEFAULT 'comfort' CHECK (travel_style IN ('budget','comfort','luxury')),
  travelers integer NOT NULL DEFAULT 2 CHECK (travelers BETWEEN 1 AND 20),
  transport_mode text NOT NULL DEFAULT 'car' CHECK (char_length(transport_mode) <= 30),
  interests text[] NOT NULL DEFAULT '{}',
  memberships text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traveler_preferences TO authenticated;
GRANT ALL ON public.traveler_preferences TO service_role;

ALTER TABLE public.traveler_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their preferences" ON public.traveler_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create their preferences" ON public.traveler_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their preferences" ON public.traveler_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their preferences" ON public.traveler_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  trip_id uuid,
  kind text NOT NULL CHECK (kind IN ('hotel','flight','car')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  provider text NOT NULL DEFAULT '' CHECK (char_length(provider) <= 120),
  url text NOT NULL DEFAULT '' CHECK (char_length(url) <= 2000),
  start_date date,
  end_date date,
  price numeric(10,2),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','booked','cancelled')),
  confirmation_code text NOT NULL DEFAULT '' CHECK (char_length(confirmation_code) <= 80),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their bookings" ON public.bookings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create their bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their bookings" ON public.bookings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX bookings_user_created_idx ON public.bookings (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_owned_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER traveler_preferences_touch BEFORE UPDATE ON public.traveler_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_owned_row();
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_owned_row();