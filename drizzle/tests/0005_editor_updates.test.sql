-- Rollback-only test for migration 0005 (needs 0004 first). Paste 0004, 0005 and this block
-- together as one query: it ends by raising an error that carries the report, so nothing it
-- creates persists. Every line should start with ok.
DO $test$
DECLARE
  A uuid := '11111111-1111-1111-1111-111111111111';  -- owner
  E uuid := '22222222-2222-2222-2222-222222222222';  -- editor
  V uuid := '33333333-3333-3333-3333-333333333333';  -- viewer
  S uuid := '44444444-4444-4444-4444-444444444444';  -- stranger
  tid uuid; rev int; res jsonb; after jsonb; before jsonb; out text[] := '{}'; tok text; cnt int; big text;
  base jsonb := '{"days":[
     {"day":1,"title":"Arrive","items":[
        {"id":"a1","time":"Morning","kind":"sight","name":"Colosseum","area":"Rome","note":"","costPerPerson":25,"priceText":"Adults $25","costSource":"listed"},
        {"id":"a2","time":"Lunch","kind":"restaurant","name":"Trattoria","area":"","note":"","costPerPerson":18,"costSource":"estimate"}]},
     {"day":2,"title":"Explore","items":[
        {"id":"b1","time":"Morning","kind":"sight","name":"Forum","area":"","note":"","costPerPerson":12}]}]}';
BEGIN
  INSERT INTO public.trips (user_id, name, data) VALUES (A, 'T', jsonb_build_object(
    'bookings', jsonb_build_object('hotel', jsonb_build_object('confirmation','SECRET123')),
    'spending', jsonb_build_object('expenses', jsonb_build_array(1)),
    'setup', jsonb_build_object('destinationId','rome','totalBudget',1500),
    'itinerary', jsonb_build_object('source','demo','tips',jsonb_build_array('tip'),
       'days', jsonb_build_array(
         jsonb_build_object('day',1,'date','2027-03-01','title','Arrive','items', base->'days'->0->'items'),
         jsonb_build_object('day',2,'date','2027-03-02','title','Explore','items', base->'days'->1->'items')))
  )) RETURNING id, revision INTO tid, rev;
  INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (tid, E, 'editor'), (tid, V, 'viewer');
  SELECT data INTO before FROM public.trips WHERE id = tid;

  -- Payload an editor would send: reordered, edited, one removed, one added with injected fields.
  -- (build it once; day 1: new item first, then a2 with a new note; day 2: b1 removed)
  -- viewer / stranger / anon are refused
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', V)::text, true); PERFORM set_config('request.jwt.claim.sub', V::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL1 viewer saved'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1 viewer refused: ' || SQLERRM); END;
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', S)::text, true); PERFORM set_config('request.jwt.claim.sub', S::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL1b stranger saved'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1b stranger refused: ' || SQLERRM); END;
  RESET ROLE; SET LOCAL ROLE anon;
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL1c anon ran'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1c anon refused: ' || SQLERRM); END;
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL1d owner via editor path'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1d owner uses normal path: ' || SQLERRM); END;

  -- editor
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', E)::text, true); PERFORM set_config('request.jwt.claim.sub', E::text, true);
  res := public.get_shared_trip(tid);
  out := out || ('ok2 editor sees role and revision: ' || ((res->>'role') = 'editor' AND (res->>'revision')::int = rev));
  BEGIN PERFORM public.update_shared_trip(tid, rev + 5, base); out := out || 'FAIL3 wrong revision saved'; EXCEPTION WHEN OTHERS THEN out := out || ('ok3 stale revision: ' || SQLERRM); END;

  res := public.update_shared_trip(tid, rev, jsonb_build_object('source','HACKED','tips', jsonb_build_array('evil'),'days', jsonb_build_array(
     jsonb_build_object('day', 9, 'date', '2099-01-01', 'title', 'Slow morning', 'items', jsonb_build_array(
        jsonb_build_object('id','n1','time','Morning','kind','sight','name','Cafe','area','Corner','note','Quiet','costPerPerson',9999,'costSource','listed','evil','x','priceText','free'),
        jsonb_build_object('id','a2','time','Lunch','kind','restaurant','name','Trattoria','area','','note','Edited note','costPerPerson',1,'costSource','listed'))),
     jsonb_build_object('day', 2, 'date', '2000-01-01', 'title', '', 'items', jsonb_build_array()))));
  out := out || ('ok4 saved, revision up: ' || ((res->>'revision')::int > rev));

  RESET ROLE;
  SELECT data INTO after FROM public.trips WHERE id = tid;
  out := out || ('ok5 days kept, dates unchanged: ' || ((after#>>'{itinerary,days,0,date}') = '2027-03-01' AND (after#>>'{itinerary,days,1,date}') = '2027-03-02' AND (after#>>'{itinerary,days,0,day}') = '1'));
  out := out || ('ok5b source and tips unchanged: ' || ((after#>>'{itinerary,source}') = 'demo' AND (after#>>'{itinerary,tips,0}') = 'tip'));
  out := out || ('ok5c titles: ' || ((after#>>'{itinerary,days,0,title}') = 'Slow morning') || ' and blank title kept old: ' || ((after#>>'{itinerary,days,1,title}') = 'Explore'));
  out := out || ('ok5d existing item kept its stored prices: ' || ((after#>>'{itinerary,days,0,items,1,costPerPerson}')::int = 18 AND (after#>>'{itinerary,days,0,items,1,costSource}') = 'estimate' AND (after#>>'{itinerary,days,0,items,1,note}') = 'Edited note'));
  out := out || ('ok5e new item has no price and no injected keys: ' || ((after#>>'{itinerary,days,0,items,0,costPerPerson}')::int = 0 AND (after#>>'{itinerary,days,0,items,0,costSource}') = 'unknown' AND NOT ((after#>'{itinerary,days,0,items,0}') ? 'evil') AND NOT ((after#>'{itinerary,days,0,items,0}') ? 'priceText')));
  out := out || ('ok5f removed item gone: ' || (jsonb_array_length(after#>'{itinerary,days,1,items}') = 0));
  out := out || ('ok6 money, bookings, spending untouched: ' || ((after->'bookings') = (before->'bookings') AND (after->'spending') = (before->'spending') AND (after->'setup') = (before->'setup')));

  -- bad input
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', E)::text, true); PERFORM set_config('request.jwt.claim.sub', E::text, true);
  rev := (public.get_shared_trip(tid)->>'revision')::int;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '{"days":[]}'::jsonb); out := out || 'FAIL7a day count changed'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7a day count: ' || SQLERRM); END;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '{"days":[{"items":[{"id":"z","time":"Midnight","kind":"sight","name":"x"}]},{"items":[]}]}'::jsonb); out := out || 'FAIL7b bad time'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7b bad time: ' || SQLERRM); END;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '{"days":[{"items":[{"id":"z","time":"Morning","kind":"sight","name":"  "}]},{"items":[]}]}'::jsonb); out := out || 'FAIL7c blank name'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7c blank name: ' || SQLERRM); END;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '{"days":[{"items":[{"id":"z","time":"Morning","kind":"sight","name":"a"},{"id":"z","time":"Lunch","kind":"sight","name":"b"}]},{"items":[]}]}'::jsonb); out := out || 'FAIL7d duplicate ids'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7d duplicate ids: ' || SQLERRM); END;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '"text"'::jsonb); out := out || 'FAIL7e not an object'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7e not an object: ' || SQLERRM); END;
  big := repeat('x', 450000);
  BEGIN PERFORM public.update_shared_trip(tid, rev, jsonb_build_object('days', jsonb_build_array(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id','q','time','Morning','kind','sight','name', big))), jsonb_build_object('items', jsonb_build_array())))); out := out || 'FAIL7f huge payload'; EXCEPTION WHEN OTHERS THEN out := out || ('ok7f huge payload: ' || SQLERRM); END;
  BEGIN PERFORM public.update_shared_trip(tid, rev, '{"days":[{"items":[{"id":"z","time":"Morning","kind":"sight","name":"a","mapsUrl":"javascript:alert(1)","lat":999,"lon":0}]},{"items":[]}]}'::jsonb);
        RESET ROLE; SELECT data INTO after FROM public.trips WHERE id = tid;
        out := out || ('ok7g unsafe link and bad coordinates dropped: ' || (NOT ((after#>'{itinerary,days,0,items,0}') ? 'mapsUrl') AND NOT ((after#>'{itinerary,days,0,items,0}') ? 'lat')));
  EXCEPTION WHEN OTHERS THEN out := out || ('7g ' || SQLERRM); END;

  -- an owner change makes the editor's old copy stale
  RESET ROLE; UPDATE public.trips SET data = jsonb_set(data, '{setup,totalBudget}', '1600') WHERE id = tid;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', E)::text, true); PERFORM set_config('request.jwt.claim.sub', E::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL8 stale after owner change'; EXCEPTION WHEN OTHERS THEN out := out || ('ok8 owner change makes old copy stale: ' || SQLERRM); END;

  -- invites: editor allowed, nonsense roles not
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  tok := public.create_trip_invite(tid, 'editor'); out := out || ('ok9 editor invite made: ' || (length(tok) = 64));
  BEGIN PERFORM public.create_trip_invite(tid, 'admin'); out := out || 'FAIL9b admin role'; EXCEPTION WHEN OTHERS THEN out := out || ('ok9b admin refused: ' || SQLERRM); END;
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', S)::text, true); PERFORM set_config('request.jwt.claim.sub', S::text, true);
  PERFORM public.accept_trip_invite(tok, 'Sue');
  RESET ROLE; SELECT role INTO tok FROM public.trip_members WHERE trip_id = tid AND user_id = S; out := out || ('ok9c joined as editor: ' || (tok = 'editor'));

  -- removed editor and soft-deleted trip
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  DELETE FROM public.trip_members WHERE trip_id = tid AND user_id = E;
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', E)::text, true); PERFORM set_config('request.jwt.claim.sub', E::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL10 removed editor saved'; EXCEPTION WHEN OTHERS THEN out := out || ('ok10 removed editor refused: ' || SQLERRM); END;
  RESET ROLE; UPDATE public.trips SET deleted_at = now() WHERE id = tid;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', S)::text, true); PERFORM set_config('request.jwt.claim.sub', S::text, true);
  BEGIN PERFORM public.update_shared_trip(tid, rev, base); out := out || 'FAIL11 deleted trip saved'; EXCEPTION WHEN OTHERS THEN out := out || ('ok11 deleted trip refused: ' || SQLERRM); END;
  RESET ROLE;

  RAISE EXCEPTION E'TEST REPORT (rolled back):\n%', array_to_string(out, E'\n');
END
$test$;
