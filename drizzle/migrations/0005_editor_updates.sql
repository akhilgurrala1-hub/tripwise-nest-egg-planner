-- Group travel, phase 2: invited EDITORS can change a trip's itinerary, and only that.
-- See docs/design/group-travel.md. Editors never see or change money, bookings, spending or
-- members. What they send is checked and rebuilt on the server:
--   * the number of days and each day's date and the trip's tips and source stay as they are;
--   * only whitelisted item fields are kept, with length limits and known values;
--   * prices are NOT editable: an item that already existed keeps its stored prices, and a new
--     item starts with no price (0, source "unknown"), so editing can never change the budget
--     data a member was never shown;
--   * a save based on an old revision is refused ("revision_conflict"), never merged silently.

CREATE OR REPLACE FUNCTION public.create_trip_invite(p_trip_id uuid, p_role text DEFAULT 'viewer')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); token text; n int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  IF p_role NOT IN ('viewer', 'editor') THEN RAISE EXCEPTION 'role_not_available'; END IF;
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

-- The shared plan now also carries the revision an editor must send back when saving.
CREATE OR REPLACE FUNCTION public.get_shared_trip(p_trip_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT t.id, t.name, t.data, t.updated_at, t.revision, m.role INTO r
    FROM trips t JOIN trip_members m ON m.trip_id = t.id AND m.user_id = uid
    WHERE t.id = p_trip_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_a_member'; END IF;
  RETURN jsonb_build_object('id', r.id, 'name', r.name, 'role', r.role, 'revision', r.revision,
                            'updated_at', r.updated_at, 'plan', strip_private_trip(r.data));
END $$;

-- One item, rebuilt from only what an editor may set. `old_item` is the stored item with the same
-- id (null for a new one): its prices are carried over, never taken from the editor.
CREATE OR REPLACE FUNCTION public.clean_editor_item(item jsonb, old_item jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE out jsonb;
BEGIN
  IF jsonb_typeof(item) <> 'object' THEN RAISE EXCEPTION 'bad_itinerary'; END IF;
  IF jsonb_typeof(item -> 'id') <> 'string' OR length(item ->> 'id') NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  IF (item ->> 'time') NOT IN ('Morning', 'Lunch', 'Afternoon', 'Dinner', 'Evening') THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  IF (item ->> 'kind') NOT IN ('sight', 'restaurant', 'stop') THEN RAISE EXCEPTION 'bad_itinerary'; END IF;
  IF jsonb_typeof(item -> 'name') <> 'string' OR length(btrim(item ->> 'name')) = 0 THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  out := jsonb_build_object(
    'id', item ->> 'id', 'time', item ->> 'time', 'kind', item ->> 'kind',
    'name', left(item ->> 'name', 200),
    'area', left(coalesce(item ->> 'area', ''), 200),
    'note', left(coalesce(item ->> 'note', ''), 500));
  -- Optional facts about a real place: kept only when they have the expected type.
  IF jsonb_typeof(item -> 'placeId') = 'string' THEN out := out || jsonb_build_object('placeId', left(item ->> 'placeId', 120)); END IF;
  IF jsonb_typeof(item -> 'mapsUrl') = 'string' AND (item ->> 'mapsUrl') ~ '^https?://' THEN
    out := out || jsonb_build_object('mapsUrl', left(item ->> 'mapsUrl', 500));
  END IF;
  IF jsonb_typeof(item -> 'hours') = 'string' THEN out := out || jsonb_build_object('hours', left(item ->> 'hours', 120)); END IF;
  IF (item ->> 'source') IN ('wikivoyage', 'wikipedia', 'osm', 'google') THEN out := out || jsonb_build_object('source', item ->> 'source'); END IF;
  IF jsonb_typeof(item -> 'custom') = 'boolean' THEN out := out || jsonb_build_object('custom', item -> 'custom'); END IF;
  IF jsonb_typeof(item -> 'lat') = 'number' AND jsonb_typeof(item -> 'lon') = 'number'
     AND (item ->> 'lat')::numeric BETWEEN -90 AND 90 AND (item ->> 'lon')::numeric BETWEEN -180 AND 180 THEN
    out := out || jsonb_build_object('lat', item -> 'lat', 'lon', item -> 'lon');
  END IF;
  -- Prices: from the stored item, or none for a new one.
  IF old_item IS NOT NULL THEN
    out := out || jsonb_strip_nulls(jsonb_build_object(
      'costPerPerson', old_item -> 'costPerPerson', 'priceText', old_item -> 'priceText',
      'costSource', old_item -> 'costSource'));
  ELSE
    out := out || jsonb_build_object('costPerPerson', 0, 'costSource', 'unknown');
  END IF;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.update_shared_trip(p_trip_id uuid, p_expected_revision int, p_itinerary jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); t trips%ROWTYPE; old_it jsonb; old_items jsonb; new_days jsonb; n int;
  total int := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;
  SELECT t2.* INTO t FROM trips t2
    JOIN trip_members m ON m.trip_id = t2.id AND m.user_id = uid AND m.role = 'editor'
    WHERE t2.id = p_trip_id AND t2.deleted_at IS NULL
    FOR UPDATE OF t2;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_an_editor'; END IF;
  IF t.revision <> p_expected_revision THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  IF p_itinerary IS NULL OR jsonb_typeof(p_itinerary) <> 'object' OR octet_length(p_itinerary::text) > 400000 THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  old_it := t.data -> 'itinerary';
  IF jsonb_typeof(old_it -> 'days') <> 'array' OR jsonb_typeof(p_itinerary -> 'days') <> 'array' THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  -- Same number of days: editors change the plan inside the trip, not the trip itself.
  IF jsonb_array_length(old_it -> 'days') <> jsonb_array_length(p_itinerary -> 'days') THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  -- Every stored item by id, for carrying prices over.
  SELECT COALESCE(jsonb_object_agg(i ->> 'id', i), '{}'::jsonb) INTO old_items
    FROM jsonb_array_elements(old_it -> 'days') d, jsonb_array_elements(COALESCE(d -> 'items', '[]'::jsonb)) i
   WHERE jsonb_typeof(i) = 'object' AND i ? 'id';
  SELECT jsonb_agg(
           jsonb_build_object(
             'day', od -> 'day', 'date', od -> 'date',
             'title', CASE WHEN jsonb_typeof(nd -> 'title') = 'string' AND length(btrim(nd ->> 'title')) > 0
                           THEN to_jsonb(left(nd ->> 'title', 200)) ELSE od -> 'title' END,
             'items', COALESCE((
               SELECT jsonb_agg(public.clean_editor_item(it, old_items -> (it ->> 'id')) ORDER BY ord)
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(nd -> 'items') = 'array' THEN nd -> 'items' ELSE '[]'::jsonb END)
                      WITH ORDINALITY AS x(it, ord)
             ), '[]'::jsonb))
           ORDER BY o.ord)
    INTO new_days
    FROM jsonb_array_elements(old_it -> 'days') WITH ORDINALITY AS o(od, ord)
    JOIN jsonb_array_elements(p_itinerary -> 'days') WITH ORDINALITY AS nw(nd, nord) ON nord = o.ord;
  SELECT COALESCE(sum(jsonb_array_length(d -> 'items')), 0) INTO total FROM jsonb_array_elements(new_days) d;
  IF total > 600 THEN RAISE EXCEPTION 'bad_itinerary'; END IF;
  -- Item ids must stay unique across the plan.
  IF (SELECT count(DISTINCT i ->> 'id') FROM jsonb_array_elements(new_days) d, jsonb_array_elements(d -> 'items') i) <> total THEN
    RAISE EXCEPTION 'bad_itinerary';
  END IF;
  UPDATE trips SET data = jsonb_set(data, '{itinerary}',
      jsonb_build_object('source', old_it -> 'source', 'tips', COALESCE(old_it -> 'tips', '[]'::jsonb), 'days', new_days))
   WHERE id = t.id
   RETURNING revision INTO n;
  RETURN jsonb_build_object('revision', n);
END $$;

REVOKE ALL ON FUNCTION public.create_trip_invite(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_shared_trip(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clean_editor_item(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_shared_trip(uuid, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_invite(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shared_trip(uuid, int, jsonb) TO authenticated;
