-- Rollback-only test for migration 0004 (group travel, phase 1). Run it AFTER the migration text
-- (or paste the migration and this block together in one query): it ends by raising an error
-- that carries the report, so nothing it creates persists. Every line should start with ok.

DO $test$
DECLARE
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  tid uuid; tid2 uuid; tok text; tok2 text; res jsonb; cnt int; out text[] := '{}'; plan jsonb; msg text; inv uuid;
BEGIN
  -- Setup as the database owner: a trip for A with private and money fields.
  INSERT INTO public.trips (user_id, name, data) VALUES (A, 'Test trip', jsonb_build_object(
    'bookings', jsonb_build_object('hotel', jsonb_build_object('confirmation','SECRET123')),
    'spending', jsonb_build_object('expenses', jsonb_build_array(1)),
    'emergencyFund', 200, 'inputs', jsonb_build_object('x', 1), 'overrides', jsonb_build_object(), 'appliedSavings', jsonb_build_object(),
    'roadTrip', jsonb_build_object('stops', jsonb_build_array()),
    'setup', jsonb_build_object('destinationId','rome','totalBudget',1500,'emergencyFund',200,'passport','US','originPoint',jsonb_build_object('lat',1,'lon',2),'startDate','2027-03-01'),
    'itinerary', jsonb_build_object('source','demo','tips',jsonb_build_array('tip'),'days', jsonb_build_array(
      jsonb_build_object('day',1,'title','Arrive','items', jsonb_build_array(jsonb_build_object('id','a','name','Colosseum','costPerPerson',25,'priceText','Adults $25','costSource','listed'))))))
  ) RETURNING id INTO tid;
  INSERT INTO public.trips (user_id, name, data) VALUES (C, 'C trip', '{}'::jsonb) RETURNING id INTO tid2;

  -- 1. A stranger cannot invite to someone else's trip
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', C)::text, true); PERFORM set_config('request.jwt.claim.sub', C::text, true);
  BEGIN PERFORM public.create_trip_invite(tid); out := out || 'FAIL1 stranger created invite'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1 stranger blocked: ' || SQLERRM); END;
  -- anonymous: no execute
  RESET ROLE; SET LOCAL ROLE anon;
  BEGIN PERFORM public.create_trip_invite(tid); out := out || 'FAIL1b anon ran function'; EXCEPTION WHEN OTHERS THEN out := out || ('ok1b anon blocked: ' || SQLERRM); END;

  -- 2. Owner creates an invite; the stored value is a hash, not the token
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  tok := public.create_trip_invite(tid);
  out := out || ('ok2 token length ' || length(tok));
  BEGIN PERFORM token_hash FROM public.trip_invites; out := out || 'FAIL3 owner read token_hash'; EXCEPTION WHEN OTHERS THEN out := out || ('ok3 token_hash unreadable: ' || SQLERRM); END;
  SELECT count(*) INTO cnt FROM public.trip_invites; out := out || ('ok3b owner sees invites: ' || cnt);
  BEGIN PERFORM public.create_trip_invite(tid, 'editor'); out := out || 'FAIL3c editor invite allowed'; EXCEPTION WHEN OTHERS THEN out := out || ('ok3c editor not yet: ' || SQLERRM); END;
  -- 6. owner accepting own invite does not consume it
  BEGIN PERFORM public.accept_trip_invite(tok); out := out || 'FAIL6 owner accepted'; EXCEPTION WHEN OTHERS THEN out := out || ('ok6 owner own link: ' || SQLERRM); END;

  -- 4. B: wrong token fails, right token works once
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', B)::text, true); PERFORM set_config('request.jwt.claim.sub', B::text, true);
  SELECT count(*) INTO cnt FROM public.trip_invites; out := out || ('ok4a non-owner sees invites: ' || cnt);
  BEGIN PERFORM public.accept_trip_invite(repeat('a', 64)); out := out || 'FAIL4b wrong token accepted'; EXCEPTION WHEN OTHERS THEN out := out || ('ok4b wrong token: ' || SQLERRM); END;
  BEGIN PERFORM public.accept_trip_invite('short'); out := out || 'FAIL4c short token'; EXCEPTION WHEN OTHERS THEN out := out || ('ok4c short token: ' || SQLERRM); END;
  res := to_jsonb(public.accept_trip_invite(tok, '  Sam  '));
  out := out || ('ok4d accepted trip ' || (res #>> '{}' = tid::text));
  -- single use
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', C)::text, true); PERFORM set_config('request.jwt.claim.sub', C::text, true);
  BEGIN PERFORM public.accept_trip_invite(tok); out := out || 'FAIL4e reused'; EXCEPTION WHEN OTHERS THEN out := out || ('ok4e reuse blocked: ' || SQLERRM); END;

  -- 7. member view strips private and money fields
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', B)::text, true); PERFORM set_config('request.jwt.claim.sub', B::text, true);
  res := public.get_shared_trip(tid); plan := res -> 'plan';
  out := out || ('ok7a role ' || (res->>'role'));
  out := out || ('ok7b private keys gone: ' || (NOT (plan ? 'bookings' OR plan ? 'spending' OR plan ? 'emergencyFund' OR plan ? 'inputs' OR plan ? 'overrides' OR plan ? 'roadTrip' OR plan ? 'appliedSavings')));
  out := out || ('ok7c setup money gone: ' || (NOT ((plan->'setup') ? 'totalBudget' OR (plan->'setup') ? 'passport' OR (plan->'setup') ? 'originPoint' OR (plan->'setup') ? 'emergencyFund')));
  out := out || ('ok7d setup kept: ' || ((plan->'setup'->>'destinationId') = 'rome'));
  out := out || ('ok7e item kept, prices gone: ' || ((plan#>>'{itinerary,days,0,items,0,name}') = 'Colosseum' AND NOT ((plan#>'{itinerary,days,0,items,0}') ? 'costPerPerson') AND NOT ((plan#>'{itinerary,days,0,items,0}') ? 'priceText')));
  out := out || ('ok7f no secret anywhere: ' || (position('SECRET123' in res::text) = 0));

  -- 9/10/11. member cannot read trips, sees own membership row only, cannot insert
  SELECT count(*) INTO cnt FROM public.trips; out := out || ('ok9 member sees trips rows: ' || cnt);
  SELECT count(*) INTO cnt FROM public.trip_members; out := out || ('ok10 member sees member rows: ' || cnt);
  BEGIN INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (tid2, B, 'viewer'); out := out || 'FAIL11 member inserted'; EXCEPTION WHEN OTHERS THEN out := out || ('ok11 direct insert blocked: ' || SQLERRM); END;
  BEGIN UPDATE public.trips SET name = 'hacked' WHERE id = tid; GET DIAGNOSTICS cnt = ROW_COUNT; out := out || ('ok11b member update rows: ' || cnt); EXCEPTION WHEN OTHERS THEN out := out || ('ok11b ' || SQLERRM); END;
  SELECT count(*) INTO cnt FROM public.list_my_shared_trips(); out := out || ('ok11c list shared: ' || cnt);

  -- 8. stranger cannot get the plan
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', C)::text, true); PERFORM set_config('request.jwt.claim.sub', C::text, true);
  BEGIN PERFORM public.get_shared_trip(tid); out := out || 'FAIL8 stranger got plan'; EXCEPTION WHEN OTHERS THEN out := out || ('ok8 stranger blocked: ' || SQLERRM); END;
  SELECT count(*) INTO cnt FROM public.trip_members; out := out || ('ok8b stranger sees member rows: ' || cnt);

  -- 13. owner sees members and can remove one
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  SELECT count(*) INTO cnt FROM public.trip_members; out := out || ('ok13a owner sees member rows: ' || cnt);
  DELETE FROM public.trip_members WHERE trip_id = tid AND user_id = B; GET DIAGNOSTICS cnt = ROW_COUNT; out := out || ('ok13b owner removed: ' || cnt);
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', B)::text, true); PERFORM set_config('request.jwt.claim.sub', B::text, true);
  BEGIN PERFORM public.get_shared_trip(tid); out := out || 'FAIL13c removed member still sees'; EXCEPTION WHEN OTHERS THEN out := out || ('ok13c removed member blocked: ' || SQLERRM); END;

  -- 5. expired and revoked invites
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  tok := public.create_trip_invite(tid); tok2 := public.create_trip_invite(tid);
  SELECT id INTO inv FROM public.trip_invites WHERE accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC, id LIMIT 1;
  PERFORM public.revoke_trip_invite(inv);
  RESET ROLE; UPDATE public.trip_invites SET expires_at = now() - interval '1 minute' WHERE accepted_at IS NULL AND revoked_at IS NULL;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', B)::text, true); PERFORM set_config('request.jwt.claim.sub', B::text, true);
  BEGIN PERFORM public.accept_trip_invite(tok); out := out || 'FAIL5a expired accepted'; EXCEPTION WHEN OTHERS THEN out := out || ('ok5a expired: ' || SQLERRM); END;
  BEGIN PERFORM public.accept_trip_invite(tok2); out := out || 'FAIL5b revoked/expired accepted'; EXCEPTION WHEN OTHERS THEN out := out || ('ok5b revoked: ' || SQLERRM); END;
  -- someone else cannot revoke A's invite
  RESET ROLE; SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', C)::text, true); PERFORM set_config('request.jwt.claim.sub', C::text, true);
  PERFORM public.revoke_trip_invite(inv);

  -- 14. member limit
  RESET ROLE;
  FOR i IN 1..10 LOOP INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (tid, gen_random_uuid(), 'viewer'); END LOOP;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', A)::text, true); PERFORM set_config('request.jwt.claim.sub', A::text, true);
  BEGIN PERFORM public.create_trip_invite(tid); out := out || 'FAIL14 over limit'; EXCEPTION WHEN OTHERS THEN out := out || ('ok14 limit: ' || SQLERRM); END;

  -- 15. soft-deleted trip hides from members
  RESET ROLE; UPDATE public.trips SET deleted_at = now() WHERE id = tid;
  SELECT user_id INTO msg FROM public.trip_members WHERE trip_id = tid LIMIT 1;
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims', json_build_object('sub', msg)::text, true); PERFORM set_config('request.jwt.claim.sub', msg, true);
  BEGIN PERFORM public.get_shared_trip(tid); out := out || 'FAIL15 deleted trip visible'; EXCEPTION WHEN OTHERS THEN out := out || ('ok15 deleted trip hidden: ' || SQLERRM); END;
  RESET ROLE;
  -- cascade: deleting the trip removes members and invites
  DELETE FROM public.trips WHERE id = tid; SELECT count(*) INTO cnt FROM public.trip_members WHERE trip_id = tid; out := out || ('ok16 members after trip delete: ' || cnt);

  RAISE EXCEPTION E'TEST REPORT (rolled back):\n%', array_to_string(out, E'\n');
END
$test$;
