import { execSync } from "child_process";

export interface TestDoctorConfig {
  email: string;
  password: string;
  fullName: string;
  slug: string;
  planTier: "free" | "pro" | "premium";
  planStatus?: "active" | "trial" | "cancelled" | "expired";
  showOnlineConsultation?: boolean;
}

export function runSqlQuery(sql: string): any {
  const singleLine = sql.replace(/\s+/g, " ").trim();
  const escapedSql = singleLine.replace(/"/g, '\\"');
  const command = `npx supabase db query --linked "${escapedSql}"`;
  try {
    const raw = execSync(command, { encoding: "utf8", cwd: process.cwd() });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return raw;
  } catch (err: any) {
    console.error("SQL Execution failed:", err.message);
    throw err;
  }
}

export function createDisposableDoctor(config: TestDoctorConfig): { id: string } {
  const planStatus = config.planStatus || "active";
  const showOnline = config.showOnlineConsultation ?? (config.planTier === "premium" || planStatus === "trial");
  const tempUuid = `00000000-0000-4000-a000-${Math.floor(Math.random() * 1000000000000).toString().padStart(12, "0")}`;

  const sql = `
  WITH new_user AS (
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_current, email_change_token_new,
      email_change, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '${tempUuid}',
      'authenticated',
      'authenticated',
      '${config.email}',
      crypt('${config.password}', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('sub', '${tempUuid}', 'email', '${config.email}', 'full_name', '${config.fullName}', 'email_verified', true, 'phone_verified', false),
      now(),
      now(),
      '', '', '', '', '', ''
    )
    RETURNING id
  ),
  new_identity AS (
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      '${tempUuid}',
      jsonb_build_object('sub', '${tempUuid}', 'email', '${config.email}', 'full_name', '${config.fullName}', 'email_verified', true),
      'email',
      '${tempUuid}',
      now(),
      now(),
      now()
    )
    RETURNING id
  )
  INSERT INTO public.profiles (
    id, full_name, slug, onboarding_completed, plan_tier, plan_status, phone, specialization, clinic_name
  )
  SELECT
    id,
    '${config.fullName}',
    '${config.slug}',
    true,
    '${config.planTier}',
    '${planStatus}',
    '+919876543210',
    'General Medicine',
    'E2E Test Clinic'
  FROM new_user
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    slug = EXCLUDED.slug,
    onboarding_completed = true,
    plan_tier = EXCLUDED.plan_tier,
    plan_status = EXCLUDED.plan_status,
    phone = EXCLUDED.phone,
    specialization = EXCLUDED.specialization,
    clinic_name = EXCLUDED.clinic_name;

  INSERT INTO public.website_settings (
    doctor_id, show_online_consultation, online_fee, auto_confirm, max_per_slot
  ) VALUES (
    '${tempUuid}',
    ${showOnline ? "true" : "false"},
    500,
    true,
    10
  )
  ON CONFLICT (doctor_id) DO UPDATE SET
    show_online_consultation = EXCLUDED.show_online_consultation;

  INSERT INTO public.services (
    doctor_id, name, description, price, type, duration, active, sort_order
  ) VALUES (
    '${tempUuid}',
    'General Consultation',
    'Routine checkup',
    500,
    'clinic',
    15,
    true,
    1
  );
  `;

  runSqlQuery(sql);
  return { id: tempUuid };
}

export function seedAppointmentsForMonth(doctorId: string, count: number, offset: number = 0) {
  if (count <= 0) return;

  const sql = `
  INSERT INTO public.appointments (
    doctor_id, patient_name, patient_phone, service_name, appointment_type,
    date, time_slot, status, payment_status, amount, token_number
  )
  SELECT
    '${doctorId}',
    'Patient ' || g,
    '+919876543210',
    'General Consultation',
    'clinic',
    (CURRENT_DATE + 1 + (g / 23))::date,
    (time '00:00:00' + (g % 23) * interval '1 hour')::time,
    'completed',
    'paid',
    500,
    'T' || floor(random() * 8999999 + 1000000)::text
  FROM generate_series(${offset}, ${offset + count - 1}) AS g;
  `;

  runSqlQuery(sql);
}

export function updateDoctorPlan(doctorId: string, planTier: "free" | "pro" | "premium", planStatus: "active" | "trial" = "active") {
  const sql = `
  UPDATE public.profiles
  SET plan_tier = '${planTier}', plan_status = '${planStatus}', updated_at = now()
  WHERE id = '${doctorId}';
  `;
  runSqlQuery(sql);
}

export function cleanupDisposableDoctor(doctorId: string) {
  const sql = `
  BEGIN;
  DELETE FROM public.payments WHERE doctor_id = '${doctorId}';
  DELETE FROM public.invoices WHERE doctor_id = '${doctorId}';
  DELETE FROM public.support_tickets WHERE doctor_id = '${doctorId}';
  DELETE FROM public.appointments WHERE doctor_id = '${doctorId}';
  DELETE FROM public.services WHERE doctor_id = '${doctorId}';
  DELETE FROM public.website_settings WHERE doctor_id = '${doctorId}';
  DELETE FROM public.profiles WHERE id = '${doctorId}';
  DELETE FROM auth.identities WHERE user_id = '${doctorId}';
  DELETE FROM auth.users WHERE id = '${doctorId}';
  COMMIT;
  `;
  try {
    runSqlQuery(sql);
  } catch (err: any) {
    console.warn("Cleanup warning:", err.message);
  }
}
