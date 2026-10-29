-- Appointments, patient sync and live-queue regression checks.
--   npx supabase db query --linked -f supabase/tests/appointments_queue.sql
-- Runs in one transaction that is rolled back; any failed check raises an exception.
BEGIN;

DO $$
DECLARE
  d uuid;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a1 uuid; a2 uuid; a3 uuid; anon_id uuid;
  r jsonb;
  rec public.appointments%ROWTYPE;
  pat public.patients%ROWTYPE;
  n int;
  q1 int;
  st text;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE onboarding_completed = true LIMIT 1;
  IF d IS NULL THEN SELECT id INTO d FROM public.profiles LIMIT 1; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'no doctor profile to test with'; END IF;

  -- Make sure the doctor has a trial/active plan so the monthly cap never interferes.
  UPDATE public.profiles SET plan_status = 'trial', trial_end = now() + interval '5 days' WHERE id = d;
  DELETE FROM public.appointments WHERE doctor_id = d AND date = today;

  -- ---- 1. A public (anon) booking cannot choose its own status or payment -------------
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date,
                                   amount, token_number, status, payment_status, payment_gateway, gateway_order_id,
                                   reschedule_count)
  VALUES (d, 'Anon Booker', '9000000001', 'Visit', 'clinic', today, 500, 'T111', 'completed', 'paid', 'razorpay', 'order_x', -50)
  RETURNING id INTO anon_id;
  SELECT * INTO rec FROM public.appointments WHERE id = anon_id;
  IF rec.status::text <> 'pending' THEN RAISE EXCEPTION 'anon status not forced: %', rec.status; END IF;
  IF rec.payment_status::text <> 'pay_at_clinic' THEN RAISE EXCEPTION 'anon payment not forced: %', rec.payment_status; END IF;
  IF rec.payment_gateway IS NOT NULL OR rec.gateway_order_id IS NOT NULL THEN RAISE EXCEPTION 'anon gateway fields kept'; END IF;
  IF rec.reschedule_count <> 0 THEN RAISE EXCEPTION 'anon reschedule_count kept'; END IF;
  IF rec.patient_id IS NOT NULL THEN RAISE EXCEPTION 'public booking must not create a patient'; END IF;
  IF rec.queue_number IS NULL THEN RAISE EXCEPTION 'queue number not assigned'; END IF;
  q1 := rec.queue_number;

  -- ---- 2. Doctor books walk-ins: counter payment, patient created, sequential numbers --
  PERFORM set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  -- take the public booking out of the line so the order below is deterministic
  UPDATE public.appointments SET status = 'cancelled' WHERE id = anon_id;
  -- everything in one transaction shares now(), so space the arrivals out explicitly
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date,
                                   amount, token_number, payment_status, created_at)
  VALUES (d, 'Walk In One', '9000000002', 'Visit', 'clinic', today, 300, 'T222', 'paid', now() + interval '1 second')
  RETURNING id INTO a1;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date,
                                   amount, token_number, payment_status, created_at)
  VALUES (d, 'Walk In Two', '', 'Visit', 'clinic', today, 300, 'T333', 'pending', now() + interval '2 seconds')
  RETURNING id INTO a2;
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date,
                                   amount, token_number, payment_status, created_at)
  VALUES (d, 'Walk In Three', '', 'Visit', 'clinic', today, 300, 'T444', 'pending', now() + interval '3 seconds')
  RETURNING id INTO a3;

  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.queue_number <> q1 + 1 THEN RAISE EXCEPTION 'queue numbers not sequential: % then %', q1, rec.queue_number; END IF;
  IF rec.payment_method IS DISTINCT FROM 'cash' OR rec.paid_at IS NULL THEN RAISE EXCEPTION 'counter payment not recorded'; END IF;
  IF rec.patient_id IS NULL THEN RAISE EXCEPTION 'staff booking did not create the patient'; END IF;

  -- two phoneless walk-ins with different names are two different patients
  SELECT count(DISTINCT patient_id) INTO n FROM public.appointments WHERE id IN (a2, a3);
  IF n <> 2 THEN RAISE EXCEPTION 'phoneless walk-ins were merged into one patient'; END IF;

  -- ---- 3. Nobody on the client may fake a gateway payment or a refund ---------------
  BEGIN
    UPDATE public.appointments SET gateway_order_id = 'order_fake' WHERE id = a1;
    RAISE EXCEPTION 'gateway field update was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.appointments SET payment_status = 'refunded' WHERE id = a2;
    RAISE EXCEPTION 'client refund was allowed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ---- 4. Live queue: call, auto-complete previous, one visit counted, invoice -------
  r := public.queue_action('call_next');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'call_next failed: %', r; END IF;
  SELECT * INTO rec FROM public.appointments WHERE id = (r->>'serving')::uuid;
  IF rec.id <> a1 THEN RAISE EXCEPTION 'wrong patient called first (expected the earliest walk-in)'; END IF;
  IF rec.serving_started_at IS NULL THEN RAISE EXCEPTION 'serving_started_at not set'; END IF;

  -- priority needs a reason, and jumps the line
  r := public.queue_action('set_priority', a3);
  IF (r->>'ok')::boolean OR r->>'error' <> 'REASON_REQUIRED' THEN RAISE EXCEPTION 'priority without reason accepted: %', r; END IF;
  r := public.queue_action('set_priority', a3, 'Chest pain');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'set_priority failed: %', r; END IF;

  r := public.queue_action('call_next');   -- finishes a1, calls a3 (priority) before a2
  IF (r->>'completed')::uuid <> a1 THEN RAISE EXCEPTION 'previous patient not completed: %', r; END IF;
  IF (r->>'serving')::uuid <> a3 THEN RAISE EXCEPTION 'priority patient not called next: %', r; END IF;

  SELECT * INTO rec FROM public.appointments WHERE id = a1;
  IF rec.status::text <> 'completed' OR rec.completed_at IS NULL THEN RAISE EXCEPTION 'a1 not completed'; END IF;
  IF NOT rec.visit_counted THEN RAISE EXCEPTION 'visit not counted'; END IF;
  SELECT * INTO pat FROM public.patients WHERE id = rec.patient_id;
  IF pat.total_visits <> 1 THEN RAISE EXCEPTION 'total_visits should be 1, got %', pat.total_visits; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = a1) THEN
    RAISE EXCEPTION 'paid completed visit has no invoice';
  END IF;

  -- flipping the status back and forth never counts the visit twice
  UPDATE public.appointments SET status = 'pending' WHERE id = a1;
  UPDATE public.appointments SET status = 'completed' WHERE id = a1;
  SELECT total_visits INTO n FROM public.patients WHERE id = pat.id;
  IF n <> 1 THEN RAISE EXCEPTION 'visit counted twice after reopen: %', n; END IF;

  -- ---- 5. Skip / recall / mark paid ------------------------------------------------------
  r := public.queue_action('skip', a3);
  r := public.queue_action('recall', a3);
  SELECT * INTO rec FROM public.appointments WHERE id = a3;
  IF rec.skipped_at IS NOT NULL OR rec.serving_started_at IS NOT NULL THEN RAISE EXCEPTION 'skip/recall left stale queue state'; END IF;

  r := public.queue_action('mark_paid', a2, NULL, 'upi');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'mark_paid failed: %', r; END IF;
  r := public.queue_action('mark_paid', a2, NULL, 'upi');
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'paying twice was accepted'; END IF;

  -- ---- 6. Public screens expose numbers only ---------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_public_queue(d);
  IF NOT (r ? 'waiting' AND r ? 'now_serving' AND r ? 'next_up') THEN RAISE EXCEPTION 'public queue shape wrong: %', r; END IF;
  IF r::text ~* 'Walk In|9000000' THEN RAISE EXCEPTION 'public queue leaks patient data: %', r; END IF;
  r := public.get_my_queue_status(d, 'T222', '');
  IF (r->>'found')::boolean THEN RAISE EXCEPTION 'empty phone must never match'; END IF;

  -- ---- 7. Nightly cleanup: yesterday's leftovers -----------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.appointments (doctor_id, patient_name, patient_phone, service_name, appointment_type, date,
                                   amount, token_number, status, serving_started_at)
  VALUES (d, 'Old Never Called', '9000000003', 'Visit', 'clinic', today - 1, 100, 'T555', 'pending', NULL),
         (d, 'Old Was Called',   '9000000004', 'Visit', 'clinic', today - 1, 100, 'T666', 'pending', now() - interval '1 day');
  PERFORM public.expire_overdue_appointments();
  SELECT status::text INTO st FROM public.appointments WHERE patient_name = 'Old Never Called' AND doctor_id = d;
  IF st <> 'no_show' THEN RAISE EXCEPTION 'never-called past visit should be no_show, got %', st; END IF;
  SELECT status::text INTO st FROM public.appointments WHERE patient_name = 'Old Was Called' AND doctor_id = d;
  IF st <> 'completed' THEN RAISE EXCEPTION 'called-but-unclosed past visit should be completed, got %', st; END IF;
  -- today's waiting patients are never touched by the nightly job
  SELECT status::text INTO st FROM public.appointments WHERE id = a2;
  IF st NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'today''s waiting patient was closed: %', st; END IF;

  RAISE NOTICE 'appointments_queue checks passed';
END $$;

ROLLBACK;
