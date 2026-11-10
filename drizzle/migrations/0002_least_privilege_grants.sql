-- Least privilege. Supabase's default grants give `anon` and `authenticated` every
-- table privilege, including TRUNCATE, which row-level security does not cover.
-- Signed-out visitors need no table access at all; signed-in travelers only need
-- the four row operations their owner-only policies already allow.

REVOKE ALL ON public.trips, public.traveler_preferences, public.bookings FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.trips, public.traveler_preferences, public.bookings
  FROM authenticated;

-- Tables created later in public start with no access for anon, and without
-- TRUNCATE / TRIGGER / REFERENCES for authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;
