-- Group travel, phase 1: people who can LOOK at a saved trip (viewers). See docs/design/group-travel.md.
-- Members never read `trips` directly (its owner-only policies are unchanged). They use the
-- functions below, which check who is asking, and the plan they get has every private and money
-- field removed on the server. Invite tokens are random, single use, expire in 7 days, and only
-- their SHA-256 hash is stored.

CREATE TABLE public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('viewer', 'editor')),
  nickname text NOT NULL DEFAULT '' CHECK (char_length(nickname) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX trip_members_user_idx ON public.trip_members (user_id);

CREATE TABLE public.trip_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('viewer', 'editor')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX trip_invites_trip_idx ON public.trip_invites (trip_id);

ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

-- Least privilege: nothing by default, then only what is needed. Writes go through functions.
REVOKE ALL ON public.trip_members FROM anon, authenticated;
REVOKE ALL ON public.trip_invites FROM anon, authenticated;
GRANT SELECT, DELETE ON public.trip_members TO authenticated;
GRANT SELECT (id, trip_id, role, expires_at, created_at, accepted_at, revoked_at)
  ON public.trip_invites TO authenticated;
GRANT ALL ON public.trip_members TO service_role;
GRANT ALL ON public.trip_invites TO service_role;

-- A member sees their own row; the trip's owner sees every row of their trip.
CREATE POLICY "Members see themselves, owners see all" ON public.trip_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
  );
-- A member can leave; the owner can remove anyone.
CREATE POLICY "Members leave, owners remove" ON public.trip_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
  );
-- Only the owner sees a trip's invites (never the token hash: column grants above).
CREATE POLICY "Owners see their invites" ON public.trip_invites
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
  );

-- The plan without anything private or about money. Keep this list in step with
-- sharedTripPayload (src/lib/share.ts) and the test for it.
CREATE OR REPLACE FUNCTION public.strip_private_trip(d jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE plan jsonb;
BEGIN
  IF d IS NULL OR jsonb_typeof(d) <> 'object' THEN RETURN '{}'::jsonb; END IF;
  plan := d - 'bookings' - 'spending' - 'live' - 'cloud' - 'id' - 'isSample'
            - 'emergencyFund' - 'appliedSavings' - 'overrides' - 'inputs' - 'roadTrip';
  IF jsonb_typeof(plan -> 'setup') = 'object' THEN
    plan := jsonb_set(plan, '{setup}',
      (plan -> 'setup') - 'totalBudget' - 'emergencyFund' - 'budgetAuto' - 'originPoint' - 'passport');
  END IF;
  IF jsonb_typeof(plan #> '{itinerary,days}') = 'array' THEN
    plan := jsonb_set(plan, '{itinerary,days}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(day -> 'items') = 'array' THEN
          jsonb_set(day, '{items}', COALESCE((
            SELECT jsonb_agg(item - 'costPerPerson' - 'priceText' - 'costSource')
            FROM jsonb_array_elements(day -> 'items') AS item
          ), '[]'::jsonb))
        ELSE day END)
      FROM jsonb_array_elements(plan #> '{itinerary,days}') AS day
    ), '[]'::jsonb));
  END IF;
  RETURN plan;
END $$;

CREATE OR REPLACE FUNCTION public.create_trip_invite(p_trip_id uuid, p_role text DEFAULT 'viewer')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); token text; n int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_role <> 'viewer' THEN RAISE EXCEPTION 'role_not_available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND user_id = uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'not_your_trip';
  END IF;
  SELECT (SELECT count(*) FROM trip_members WHERE trip_id = p_trip_id)
       + (SELECT count(*) FROM trip_invites
            WHERE trip_id = p_trip_id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now())
    INTO n;
  IF n >= 10 THEN RAISE EXCEPTION 'member_limit'; END IF;
  IF (SELECT count(*) FROM trip_invites WHERE trip_id = p_trip_id AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'too_many_invites';
  END IF;
  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO trip_invites (trip_id, token_hash, role, expires_at, created_by)
    VALUES (p_trip_id, encode(sha256(convert_to(token, 'utf8')), 'hex'), p_role, now() + interval '7 days', uid);
  RETURN token;
END $$;

CREATE OR REPLACE FUNCTION public.accept_trip_invite(p_token text, p_nickname text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); inv trip_invites%ROWTYPE; n int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'invalid_invite'; END IF;
  SELECT * INTO inv FROM trip_invites
    WHERE token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_invite'; END IF;
  IF NOT EXISTS (SELECT 1 FROM trips WHERE id = inv.trip_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid_invite';
  END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE id = inv.trip_id AND user_id = uid) THEN
    RAISE EXCEPTION 'own_trip';
  END IF;
  SELECT count(*) INTO n FROM trip_members WHERE trip_id = inv.trip_id;
  IF n >= 10 THEN RAISE EXCEPTION 'member_limit'; END IF;
  INSERT INTO trip_members (trip_id, user_id, role, nickname)
    VALUES (inv.trip_id, uid, inv.role, left(btrim(coalesce(p_nickname, '')), 40))
    ON CONFLICT (trip_id, user_id) DO NOTHING;
  UPDATE trip_invites SET accepted_by = uid, accepted_at = now() WHERE id = inv.id;
  RETURN inv.trip_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_shared_trip(p_trip_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT t.id, t.name, t.data, t.updated_at, m.role INTO r
    FROM trips t JOIN trip_members m ON m.trip_id = t.id AND m.user_id = uid
    WHERE t.id = p_trip_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_a_member'; END IF;
  RETURN jsonb_build_object('id', r.id, 'name', r.name, 'role', r.role,
                            'updated_at', r.updated_at, 'plan', strip_private_trip(r.data));
END $$;

CREATE OR REPLACE FUNCTION public.list_my_shared_trips()
RETURNS TABLE (trip_id uuid, name text, role text, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, m.role, t.updated_at
    FROM trips t JOIN trip_members m ON m.trip_id = t.id
   WHERE m.user_id = auth.uid() AND t.deleted_at IS NULL
   ORDER BY t.updated_at DESC
$$;

CREATE OR REPLACE FUNCTION public.revoke_trip_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE trip_invites i SET revoked_at = now()
   WHERE i.id = p_invite_id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
     AND EXISTS (SELECT 1 FROM trips t WHERE t.id = i.trip_id AND t.user_id = auth.uid());
END $$;

-- Only signed-in users may run these; nobody else, and not anonymous visitors.
REVOKE ALL ON FUNCTION public.create_trip_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_trip_invite(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_shared_trip(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_shared_trips() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_trip_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.strip_private_trip(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trip_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_trip_invite(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_shared_trips() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_trip_invite(uuid) TO authenticated;
