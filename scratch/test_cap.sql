DO $$
DECLARE
  doc_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, role, aud,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_current, email_change_token_new, email_change, reauthentication_token
  ) VALUES (
    doc_id, '00000000-0000-0000-0000-000000000000', 'cap-test@example.com', 'pass', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('sub', doc_id, 'email', 'cap-test@example.com', 'email_verified', true),
    false, 'authenticated', 'authenticated', now(), now(), '', '', '', '', '', ''
  );

  UPDATE public.profiles SET plan_tier = 'free', plan_status = 'active' WHERE id = doc_id;

  INSERT INTO public.appointments (
    doctor_id, patient_name, patient_phone, service_name, appointment_type,
    date, time_slot, status, payment_status, amount, token_number
  )
  SELECT
    doc_id, 'Patient ' || g, '+919876543210', 'Consultation', 'clinic',
    (CURRENT_DATE + 1 + (g / 23))::date,
    (time '00:00:00' + (g % 23) * interval '1 hour')::time,
    'completed', 'paid', 500, 'T' || g
  FROM generate_series(0, 499) AS g;

  -- 501st insert
  INSERT INTO public.appointments (
    doctor_id, patient_name, patient_phone, service_name, appointment_type,
    date, time_slot, status, payment_status, amount, token_number
  ) VALUES (
    doc_id, 'Blocked Patient', '+919876543210', 'Consultation', 'clinic',
    CURRENT_DATE, '09:00', 'pending', 'pending', 500, 'T501'
  );
END $$;
