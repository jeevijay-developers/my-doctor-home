# Subscription Plan-Based Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real, server-side-enforced feature gating between Basic (`plan_tier` in `free`/`pro`) and Premium (`plan_tier = 'premium'`) doctors — a 500/month appointment cap, blocked Online Consultation/Zoom, and gated Billing/Invoices + AI Blog Writer — plus a matching doctor-dashboard UI and automated trial expiry.

**Architecture:** A single SQL function `doctor_has_premium_access()` is the one source of truth for "is this doctor entitled to Premium features," reused by every Postgres trigger, RLS policy, edge function, and the frontend (via RPC) — no independent re-derivation anywhere. Enforcement lives in the database (triggers/RLS), not the frontend, so it can't be bypassed by a direct API call; the frontend adds a `usePlanAccess()` hook and a reusable `<LockedFeatureCard>` purely for UX (locked-state pages, near-cap warnings), with real errors from the DB surfaced as toasts when the UI-level gate is somehow bypassed.

**Tech Stack:** Postgres (Supabase, project `atmelijhxsjzjixhdfcu`, applied via `mcp__supabase__apply_migration`/`execute_sql` MCP tools — Supabase CLI is not installed in this dev environment), `pg_cron`, Deno edge functions, React + TypeScript, Vitest + Testing Library.

## Global Constraints

- "Basic" = `plan_tier` values `free` and `pro` (both get identical limits) — displayed as "Basic" in the UI, but the DB column keeps its existing `free`/`pro`/`premium` values and check constraint unchanged. No schema rename.
- `plan_status = 'trial'` always grants full Premium access, regardless of `plan_tier`, for the trial's duration.
- Appointment cap = 500/month, read from `platform_settings` (key `basic_appointment_cap`), counted by the appointment's scheduled `date` (calendar month), not `created_at`. Falls back to 500 if the settings row is ever missing.
- **Revised during execution (Task 1 blocked):** Supabase development branching requires a
  Pro-plan-or-above org; `jeevijay-developers's Org` is on the Free plan. The user explicitly
  chose to waive the isolated-branch requirement rather than upgrade. Tasks 2–6 apply their
  migrations **directly to production** (`atmelijhxsjzjixhdfcu`). Task 1 and Task 7
  (branch create/merge) are skipped. Compensating safety: every verification step that would
  otherwise INSERT/UPDATE real rows is wrapped in `BEGIN ... ROLLBACK` so nothing persists
  regardless of outcome — this is strictly safer than the original plan's "insert test rows, then
  manually clean up" approach, since a rollback undoes trigger side effects too and can't be
  skipped by a forgotten cleanup step.
- No new npm dependencies.
- Every new/modified DB write path must call `doctor_has_premium_access()` — never re-implement the boolean logic in a second place (SQL or TypeScript).

---

### Task 1: Create an isolated Supabase development branch — SKIPPED

**Attempted and blocked:** `mcp__supabase__create_branch` failed with `PaymentRequiredException:
Branching is supported only on the Pro plan or above` — `jeevijay-developers's Org`
(`clkkmzxdrptlwpiqvoxq`) is on the Free plan. `mcp__supabase__confirm_cost` succeeded first
(cost: $0.01344/hour), so this is a real plan-tier gate, not a transient error.

**User decision:** waive the isolated-branch requirement rather than upgrade the org. Tasks 2–6
apply directly to production `atmelijhxsjzjixhdfcu` instead of a branch project_id, with
`BEGIN...ROLLBACK`-wrapped verification (see the revised Global Constraints entry above). Task 7
(merge branch to production) is likewise skipped — there is nothing to merge.

No further action for this task.

No commit for this task — it's a remote infrastructure action, not a code change.

---

### Task 2: Core plan-access SQL functions

**Files:**
- Create (as a migration, applied via MCP, not a local file the repo tracks in the usual sense — Supabase migrations pulled from `apply_migration` land in `supabase/migrations/` in this repo's convention; after applying on the branch, also write the equivalent `.sql` file into `supabase/migrations/` in the working tree so it's captured in git): `supabase/migrations/<timestamp>_plan_gating_core.sql`

**Interfaces:**
- Produces: `public.doctor_has_premium_access(_doctor_id uuid) returns boolean` — `true` if `plan_status = 'trial'` OR `plan_tier = 'premium'` for that doctor. `public.get_appointment_cap_usage(_doctor_id uuid) returns table(is_premium boolean, appointments_used int, appointments_cap int)`. `platform_settings` row `key='basic_appointment_cap'`. Tasks 3–9 and the frontend hook (Task 11) all consume `doctor_has_premium_access`; Task 11 also consumes `get_appointment_cap_usage`.

- [ ] **Step 1: Write and apply the migration on production**

Call `mcp__supabase__apply_migration` with `project_id: "atmelijhxsjzjixhdfcu"`, `name: "plan_gating_core"`, and this SQL:

```sql
-- Single source of truth for "does this doctor have Premium-level access."
-- Mirrors the existing has_role() pattern (SQL language, STABLE, SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.doctor_has_premium_access(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _doctor_id
      AND (plan_status = 'trial' OR plan_tier = 'premium')
  )
$$;

-- Seed the configurable cap (idempotent - safe to re-run).
INSERT INTO public.platform_settings (key, value)
VALUES ('basic_appointment_cap', '500'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Read-only usage summary for the frontend. Not itself an enforcement point -
-- enforce_monthly_appointment_cap() (Task 3) is the actual authority; this
-- function mirrors its exact counting logic so displayed numbers never drift
-- from what's enforced.
CREATE OR REPLACE FUNCTION public.get_appointment_cap_usage(_doctor_id uuid)
RETURNS TABLE(is_premium boolean, appointments_used int, appointments_cap int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  premium boolean;
  cap_val int;
  used_val int;
BEGIN
  premium := public.doctor_has_premium_access(_doctor_id);

  IF premium THEN
    RETURN QUERY SELECT true, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO cap_val
  FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  IF cap_val IS NULL THEN cap_val := 500; END IF;

  SELECT COUNT(*)::int INTO used_val
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND status <> 'cancelled'
    AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE);

  RETURN QUERY SELECT false, used_val, cap_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_has_premium_access(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_appointment_cap_usage(uuid) TO authenticated;
```

- [ ] **Step 2: Verify on production**

All read-only (no ROLLBACK needed). Call `mcp__supabase__execute_sql` on `atmelijhxsjzjixhdfcu`:

```sql
select key, value from platform_settings where key = 'basic_appointment_cap';
```
Expected: one row, `value = 500`.

```sql
select proname from pg_proc where proname in ('doctor_has_premium_access', 'get_appointment_cap_usage');
```
Expected: both function names returned.

```sql
-- Sanity check against a real profile row (any existing doctor id) - read-only.
select id, plan_status, plan_tier from profiles limit 1;
-- then, using that id:
select * from get_appointment_cap_usage('<id-from-above>');
```
Expected: a single row with sane `is_premium`/`appointments_used`/`appointments_cap` values consistent with that profile's `plan_status`/`plan_tier`.

- [ ] **Step 3: Save the migration file to the repo and commit**

Write the exact SQL from Step 1 to `supabase/migrations/<YYYYMMDDHHMMSS>_plan_gating_core.sql` (use the current UTC timestamp as the prefix, matching this repo's existing migration filename convention).

```bash
git add supabase/migrations/<timestamp>_plan_gating_core.sql
git commit -m "feat: add doctor_has_premium_access and get_appointment_cap_usage functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Monthly appointment cap trigger

**Files:**
- Create: `supabase/migrations/<timestamp>_appointment_cap_trigger.sql`

**Interfaces:**
- Consumes: `public.doctor_has_premium_access(uuid)` (Task 2).
- Produces: trigger `enforce_appointment_cap` on `public.appointments`, function `public.enforce_monthly_appointment_cap()`. No other task depends on this function's name directly, but Task 12 (AppointmentsPage warning banner) and the manual QA checklist rely on its raised-exception message text below.

- [ ] **Step 1: Write and apply the migration on production**

```sql
CREATE OR REPLACE FUNCTION public.enforce_monthly_appointment_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
BEGIN
  -- Unlike enforce_slot_capacity(), this does NOT exempt doctor-originated
  -- inserts - the cap blocks both the doctor's own manual creation and
  -- public/patient booking, by design.
  IF public.doctor_has_premium_access(NEW.doctor_id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value)::int, 500) INTO cap
  FROM public.platform_settings WHERE key = 'basic_appointment_cap';
  IF cap IS NULL THEN cap := 500; END IF;

  SELECT COUNT(*) INTO taken
  FROM public.appointments
  WHERE doctor_id = NEW.doctor_id
    AND status <> 'cancelled'
    AND date_trunc('month', date) = date_trunc('month', NEW.date);

  IF taken >= cap THEN
    RAISE EXCEPTION 'MONTHLY_APPOINTMENT_CAP_REACHED: Basic plan is limited to % appointments per month', cap
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_appointment_cap ON public.appointments;
CREATE TRIGGER enforce_appointment_cap
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_monthly_appointment_cap();
```

Apply via `mcp__supabase__apply_migration` on `atmelijhxsjzjixhdfcu`, `name: "appointment_cap_trigger"`.

- [ ] **Step 2: Verify on production, wrapped in BEGIN...ROLLBACK so nothing persists**

Single `mcp__supabase__execute_sql` call on `atmelijhxsjzjixhdfcu` — uses a real existing profile
row (picked dynamically, no hardcoded id needed), covers all three scenarios (cap blocks Basic,
Premium is unaffected, scheduled-month window), and rolls back every mutation at the end
regardless of outcome:

```sql
BEGIN;

DO $$
DECLARE
  test_doctor_id uuid;
BEGIN
  SELECT id INTO test_doctor_id FROM profiles LIMIT 1;

  -- Scenario 1: Basic doctor blocked once the (temporarily lowered) cap is reached.
  UPDATE profiles SET plan_tier = 'pro', plan_status = 'active' WHERE id = test_doctor_id;
  UPDATE platform_settings SET value = '2'::jsonb WHERE key = 'basic_appointment_cap';

  INSERT INTO appointments (doctor_id, patient_name, patient_phone, service_name, date, time_slot, amount)
  VALUES (test_doctor_id, 'Test A', '9999999901', 'Consultation', '2026-09-10', '10:00', 500);
  INSERT INTO appointments (doctor_id, patient_name, patient_phone, service_name, date, time_slot, amount)
  VALUES (test_doctor_id, 'Test B', '9999999902', 'Consultation', '2026-09-10', '10:30', 500);

  BEGIN
    INSERT INTO appointments (doctor_id, patient_name, patient_phone, service_name, date, time_slot, amount)
    VALUES (test_doctor_id, 'Test C', '9999999903', 'Consultation', '2026-09-10', '11:00', 500);
    RAISE EXCEPTION 'TEST FAILED: third insert should have been blocked by the cap but succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'MONTHLY_APPOINTMENT_CAP_REACHED%' THEN
      RAISE NOTICE 'PASS: third insert correctly blocked - %', SQLERRM;
    ELSE
      RAISE EXCEPTION 'TEST FAILED: unexpected error - %', SQLERRM;
    END IF;
  END;

  -- Scenario 2: Premium doctor unaffected by the same lowered cap.
  UPDATE profiles SET plan_tier = 'premium' WHERE id = test_doctor_id;
  INSERT INTO appointments (doctor_id, patient_name, patient_phone, service_name, date, time_slot, amount)
  VALUES (test_doctor_id, 'Test D', '9999999904', 'Consultation', '2026-09-10', '11:30', 500);
  RAISE NOTICE 'PASS: premium doctor 3rd appointment succeeded past the cap';

  -- Scenario 3: scheduled-month window, not creation-month - a future-dated appointment
  -- isn't counted against the current month's usage.
  UPDATE profiles SET plan_tier = 'pro' WHERE id = test_doctor_id;
  INSERT INTO appointments (doctor_id, patient_name, patient_phone, service_name, date, time_slot, amount)
  VALUES (test_doctor_id, 'Future Booking', '9999999905', 'Consultation', '2027-01-15', '09:00', 500);
  RAISE NOTICE 'PASS: future-month booking succeeded independent of current-month count';
END $$;

ROLLBACK;
```

Expected: three `PASS:` notices in the output, no `TEST FAILED` exception. Because the whole
thing is one transaction ending in `ROLLBACK`, the real profile's `plan_tier`/`plan_status`, the
`platform_settings` cap value, and all five fake appointment rows are gone the instant this call
returns — confirm with a fresh read-only `select count(*) from appointments where patient_phone
like '99999999%'` (expect `0`) and `select value from platform_settings where key =
'basic_appointment_cap'` (expect `500`, untouched).

- [ ] **Step 3: Save the migration file to the repo and commit**

```bash
git add supabase/migrations/<timestamp>_appointment_cap_trigger.sql
git commit -m "feat: enforce monthly appointment cap for Basic-tier doctors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Online Consultation gating triggers

**Files:**
- Create: `supabase/migrations/<timestamp>_online_consultation_gating.sql`

**Interfaces:**
- Consumes: `public.doctor_has_premium_access(uuid)` (Task 2).
- Produces: trigger `gate_online_consultation` on `public.website_settings` (function `public.enforce_online_consultation_gate()`), trigger `disable_online_consultation_on_downgrade` on `public.profiles` (function `public.auto_disable_online_consultation_on_downgrade()`).

- [ ] **Step 1: Write and apply the migration on production**

```sql
CREATE OR REPLACE FUNCTION public.enforce_online_consultation_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.show_online_consultation = true
     AND (OLD.show_online_consultation IS DISTINCT FROM true)
     AND NOT public.doctor_has_premium_access(NEW.doctor_id) THEN
    RAISE EXCEPTION 'ONLINE_CONSULTATION_REQUIRES_PREMIUM: Online Consultation is a Premium-only feature'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_online_consultation ON public.website_settings;
CREATE TRIGGER gate_online_consultation
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_online_consultation_gate();

CREATE OR REPLACE FUNCTION public.auto_disable_online_consultation_on_downgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_premium boolean;
  is_premium boolean;
BEGIN
  was_premium := (OLD.plan_status = 'trial' OR OLD.plan_tier = 'premium');
  is_premium := (NEW.plan_status = 'trial' OR NEW.plan_tier = 'premium');

  IF was_premium AND NOT is_premium THEN
    UPDATE public.website_settings
    SET show_online_consultation = false
    WHERE doctor_id = NEW.id AND show_online_consultation = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS disable_online_consultation_on_downgrade ON public.profiles;
CREATE TRIGGER disable_online_consultation_on_downgrade
  AFTER UPDATE OF plan_tier, plan_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_disable_online_consultation_on_downgrade();
```

Apply via `mcp__supabase__apply_migration` on `atmelijhxsjzjixhdfcu`, `name: "online_consultation_gating"`.

- [ ] **Step 2: Verify on production, wrapped in BEGIN...ROLLBACK so nothing persists**

Single `mcp__supabase__execute_sql` call on `atmelijhxsjzjixhdfcu`, using a real doctor row that
already has a `website_settings` record (guaranteed 1:1 via `doctor_id`):

```sql
BEGIN;

DO $$
DECLARE
  test_doctor_id uuid;
BEGIN
  SELECT doctor_id INTO test_doctor_id FROM website_settings LIMIT 1;

  -- Scenario 1: Basic doctor blocked from enabling.
  UPDATE profiles SET plan_tier = 'pro', plan_status = 'active' WHERE id = test_doctor_id;
  UPDATE website_settings SET show_online_consultation = false WHERE doctor_id = test_doctor_id;

  BEGIN
    UPDATE website_settings SET show_online_consultation = true WHERE doctor_id = test_doctor_id;
    RAISE EXCEPTION 'TEST FAILED: enabling should have been blocked for a Basic doctor but succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ONLINE_CONSULTATION_REQUIRES_PREMIUM%' THEN
      RAISE NOTICE 'PASS: Basic doctor blocked from enabling - %', SQLERRM;
    ELSE
      RAISE EXCEPTION 'TEST FAILED: unexpected error - %', SQLERRM;
    END IF;
  END;

  -- Scenario 2: turning it off is always allowed (no-op, already false here).
  UPDATE website_settings SET show_online_consultation = false WHERE doctor_id = test_doctor_id;
  RAISE NOTICE 'PASS: disabling never raises';

  -- Scenario 3: Premium doctor can enable, then auto-disables on downgrade.
  UPDATE profiles SET plan_tier = 'premium' WHERE id = test_doctor_id;
  UPDATE website_settings SET show_online_consultation = true WHERE doctor_id = test_doctor_id;
  IF NOT (SELECT show_online_consultation FROM website_settings WHERE doctor_id = test_doctor_id) THEN
    RAISE EXCEPTION 'TEST FAILED: premium doctor could not enable online consultation';
  END IF;
  RAISE NOTICE 'PASS: premium doctor enabled online consultation';

  UPDATE profiles SET plan_tier = 'pro' WHERE id = test_doctor_id;
  IF (SELECT show_online_consultation FROM website_settings WHERE doctor_id = test_doctor_id) THEN
    RAISE EXCEPTION 'TEST FAILED: downgrade did not auto-disable online consultation';
  END IF;
  RAISE NOTICE 'PASS: downgrade auto-disabled online consultation';
END $$;

ROLLBACK;
```

Expected: four `PASS:` notices, no `TEST FAILED` exception. The `ROLLBACK` undoes every
`profiles`/`website_settings` mutation — confirm with a fresh read-only re-check of that same
doctor's `plan_tier` and `show_online_consultation` values matching whatever they were before
this step ran.

- [ ] **Step 3: Save the migration file to the repo and commit**

```bash
git add supabase/migrations/<timestamp>_online_consultation_gating.sql
git commit -m "feat: gate Online Consultation toggle behind Premium, auto-disable on downgrade

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Invoices RLS gate

**Files:**
- Create: `supabase/migrations/<timestamp>_invoices_premium_rls.sql`

**Interfaces:**
- Consumes: `public.doctor_has_premium_access(uuid)` (Task 2).
- Produces: RLS policy `invoices_require_premium_insert` on `public.invoices`.

- [ ] **Step 1: Check the existing INSERT policy on `invoices` before adding a new one**

Run (read-only) on `atmelijhxsjzjixhdfcu`: `select policyname, cmd, qual, with_check from pg_policies where tablename = 'invoices';`
Note the existing INSERT policy's `with_check` expression (record it — Step 2 must AND onto it, not replace it, so doctor-ownership checks aren't lost).

- [ ] **Step 2: Write and apply the migration on production**

Using whatever the existing INSERT policy's `with_check` condition was found to be in Step 1 (referred to below as `<existing_with_check>` — substitute the real expression), replace that single policy so it also requires premium access:

```sql
DROP POLICY IF EXISTS "<existing_policy_name_from_step_1>" ON public.invoices;
CREATE POLICY "<existing_policy_name_from_step_1>"
  ON public.invoices FOR INSERT
  WITH CHECK (
    (<existing_with_check>)
    AND public.doctor_has_premium_access(doctor_id)
  );
```

Apply via `mcp__supabase__apply_migration` on `atmelijhxsjzjixhdfcu`, `name: "invoices_premium_rls"`.

- [ ] **Step 3: Verify the policy's condition — read-only, no mutation needed**

`execute_sql` runs as the service role, which bypasses RLS entirely, so a real end-to-end "this
insert gets rejected" test isn't possible from this connection — and isn't needed to confirm the
policy logic is correct, since `doctor_has_premium_access()` is already fully verified in Task 2.
Just confirm the policy references it correctly, read-only:

```sql
select policyname, with_check from pg_policies where tablename = 'invoices' and cmd = 'INSERT';
```
Expected: the `with_check` text includes `doctor_has_premium_access(doctor_id)`.

Full end-to-end RLS verification (a real Basic-tier doctor's own session attempting an insert
through the actual app, expected to be rejected) happens in Task 15's Manual QA checklist, using
the app itself rather than a raw SQL connection.

- [ ] **Step 4: Save the migration file to the repo and commit**

```bash
git add supabase/migrations/<timestamp>_invoices_premium_rls.sql
git commit -m "feat: require premium access to insert invoices via RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Trial auto-expiry via pg_cron

**Files:**
- Create: `supabase/migrations/<timestamp>_trial_auto_expiry_cron.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks directly, but its UPDATE fires Task 4's `disable_online_consultation_on_downgrade` trigger.
- Produces: a scheduled `pg_cron` job named `expire-trials`.

- [ ] **Step 1: Write and apply the migration on production**

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'expire-trials',
  '0 2 * * *',
  $$UPDATE public.profiles SET plan_status = 'expired' WHERE plan_status = 'trial' AND trial_end < now()$$
);
```

Apply via `mcp__supabase__apply_migration` on `atmelijhxsjzjixhdfcu`, `name: "trial_auto_expiry_cron"`.

- [ ] **Step 2: Verify the job is registered (read-only)**

```sql
select jobname, schedule, command from cron.job where jobname = 'expire-trials';
```
Expected: one row with the schedule `0 2 * * *` and the UPDATE command above.

- [ ] **Step 3: Verify the UPDATE's logic directly, wrapped in BEGIN...ROLLBACK so no real doctor's status actually changes**

```sql
BEGIN;

DO $$
DECLARE
  test_doctor_id uuid;
  resulting_status public.plan_status;
BEGIN
  SELECT id INTO test_doctor_id FROM profiles LIMIT 1;

  UPDATE profiles SET plan_status = 'trial', trial_end = now() - interval '1 day' WHERE id = test_doctor_id;
  UPDATE public.profiles SET plan_status = 'expired' WHERE plan_status = 'trial' AND trial_end < now();

  SELECT plan_status INTO resulting_status FROM profiles WHERE id = test_doctor_id;
  IF resulting_status <> 'expired' THEN
    RAISE EXCEPTION 'TEST FAILED: expected plan_status=expired, got %', resulting_status;
  END IF;
  RAISE NOTICE 'PASS: lapsed trial correctly flipped to expired';

  -- Cascading effect: if this doctor had show_online_consultation on (and isn't premium),
  -- Task 4's downgrade trigger should have just disabled it via this same UPDATE.
  IF EXISTS (
    SELECT 1 FROM website_settings
    WHERE doctor_id = test_doctor_id AND show_online_consultation = true
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: show_online_consultation should have been auto-disabled';
  END IF;
  RAISE NOTICE 'PASS: cascading auto-disable confirmed (or was already off)';
END $$;

ROLLBACK;
```
Expected: two `PASS:` notices, no `TEST FAILED` exception, and the real doctor's `plan_status`
unchanged after the `ROLLBACK` (confirm with a read-only re-select if you want extra certainty).

- [ ] **Step 4: Save the migration file to the repo and commit**

```bash
git add supabase/migrations/<timestamp>_trial_auto_expiry_cron.sql
git commit -m "feat: automatically expire lapsed trials via daily pg_cron job

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Final DB verification — SKIPPED (merge/delete branch), reduced to a consolidated check

**Files:** None.

**Interfaces:** None — checkpoint task.

Steps 2 (merge) and 4 (delete branch) from the original plan no longer apply — there is no branch
(Task 1 was skipped; Tasks 2–6 already applied directly to production). Kept as a consolidated
post-Tasks-2–6 sanity check:

- [ ] **Step 1: Security advisory check**

Run `mcp__supabase__get_advisors` (type: `security`) on `atmelijhxsjzjixhdfcu` and confirm no new
advisories were introduced by Tasks 2–6 beyond whatever already existed before this plan started
(the pre-existing `SECURITY DEFINER`/leaked-password-protection advisories from earlier in this
project are expected and unrelated).

- [ ] **Step 2: Confirm all 5 functions/objects exist on production**

```sql
select proname from pg_proc where proname in ('doctor_has_premium_access', 'get_appointment_cap_usage', 'enforce_monthly_appointment_cap', 'enforce_online_consultation_gate', 'auto_disable_online_consultation_on_downgrade');
```
Run via `mcp__supabase__execute_sql` on `atmelijhxsjzjixhdfcu`. Expected: all 5 function names present.

No git commit — this task doesn't change the working tree (Tasks 2–6 already committed their migration files).

---

### Task 8: `create-zoom-meeting` premium check

**Files:**
- Modify: `supabase/functions/create-zoom-meeting/index.ts`

**Interfaces:**
- Consumes: `doctor_has_premium_access` RPC (now live in production after Task 7).
- Produces: no new exports — same HTTP contract, with a new 403 case.

- [ ] **Step 1: Add the check**

In `supabase/functions/create-zoom-meeting/index.ts`, find the `action === "create"` block (currently starts with `if (action === "create") {`). Immediately after the existing authorization block (after the `if (!role) return json(403, ...)` and `if (role === "patient" && action !== "get") ...` checks, before the `if (appt.appointment_type !== "online")` check), add:

```ts
    if (action === "create") {
      const { data: isPremium } = await admin.rpc("doctor_has_premium_access", { _doctor_id: appt.doctor_id });
      if (!isPremium) {
        return json(403, { error: "Online Consultation is a Premium-only feature" });
      }
    }
```

Place this as a new top-level `if` block right after the existing `if (appt.appointment_type !== "online") { return json(400, ...); }` check (so it only runs for `create`, not `get`/`update`/`delete`, matching the design's decision that `action:"get"` stays ungated).

- [ ] **Step 2: Deploy and verify**

Deploy via `mcp__supabase__deploy_edge_function` with `project_id: "atmelijhxsjzjixhdfcu"`, `name: "create-zoom-meeting"`, reading the full current file content (after Step 1's edit) as the `files` payload, `verify_jwt: false` (unchanged from current config).

Verify with a Basic-tier doctor's real appointment (set one test doctor to `plan_tier = 'pro'` on production, or use `execute_sql` to temporarily flip an existing test doctor), then call the function with that doctor's session JWT and `action: "create"` for one of their online appointments — expect a 403 with the message above. Restore the doctor's original `plan_tier` afterward if this was a real production profile.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-zoom-meeting/index.ts
git commit -m "feat: block Zoom meeting creation for non-Premium doctors

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `ai-blog-writer` auth + premium check, and fix its caller

**Files:**
- Modify: `supabase/functions/ai-blog-writer/index.ts`
- Modify: `src/components/admin/BlogPage.tsx`
- Test: `src/components/admin/BlogPage.test.tsx` (new — this file currently has no tests; adding one focused test for the auth-call fix)

**Interfaces:**
- Consumes: `doctor_has_premium_access` RPC.
- Produces: no new exports. `ai-blog-writer` now requires a real user session (not the anon key) and returns 403 for non-Premium doctors.

- [ ] **Step 1: Add Supabase client + auth check to the edge function**

In `supabase/functions/ai-blog-writer/index.ts`, replace the top of the file:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, doctorName, specialization } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
```

with:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const doctorId = userData?.user?.id;
    if (!doctorId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isPremium } = await admin.rpc("doctor_has_premium_access", { _doctor_id: doctorId });
    if (!isPremium) {
      return new Response(JSON.stringify({ error: "AI Blog Writer is a Premium-only feature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, doctorName, specialization } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
```

The rest of the file (the `fetch` call to the AI gateway and everything after) stays exactly as-is — no other changes needed.

- [ ] **Step 2: Fix `BlogPage.tsx`'s caller to send the doctor's real session token**

Find in `src/components/admin/BlogPage.tsx` (the `generateWithAI` function):

```ts
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-blog-writer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ topic: aiTopic, doctorName: profile?.full_name, specialization: profile?.specialization }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          toast({ title: "Rate limit exceeded", description: "Please try again in a moment.", variant: "destructive" });
        } else if (res.status === 402) {
          toast({ title: "AI credits exhausted", description: "Please add credits to continue.", variant: "destructive" });
        } else {
```

Replace with:

```ts
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-blog-writer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ topic: aiTopic, doctorName: profile?.full_name, specialization: profile?.specialization }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          toast({ title: "Rate limit exceeded", description: "Please try again in a moment.", variant: "destructive" });
        } else if (res.status === 402) {
          toast({ title: "AI credits exhausted", description: "Please add credits to continue.", variant: "destructive" });
        } else if (res.status === 403) {
          toast({ title: "Premium feature", description: errData.error || "Upgrade to Premium to use AI Blog Writer.", variant: "destructive" });
        } else {
```

(Kept the raw `fetch` pattern rather than switching to `supabase.functions.invoke` here, since the function's response on success is a plain article JSON object consumed directly by existing code below this block — changing the call style is a larger diff than fixing just the auth header. `supabase.auth.getSession()` reads the already-cached local session, no network round-trip.)

- [ ] **Step 3: Write a regression test for the auth-header fix**

Create `src/components/admin/BlogPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BlogPage from "./BlogPage";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", specialization: "Cardiology" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "real-doctor-jwt" } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }),
  },
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ title: "T", excerpt: "E", content: "C", category: "General Health" }),
});

describe("BlogPage - AI writer auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the doctor's real session access_token as the bearer, not the anon key", async () => {
    render(<BlogPage />);
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Heart health" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer real-doctor-jwt");
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/admin/BlogPage.test.tsx`
Expected: PASS. (If the "New Blog Post" button's accessible name or the topic input's placeholder text differs slightly from what's guessed above, adjust the selector to match `BlogPage.tsx`'s actual JSX — read the file's dialog-trigger button and topic `Input` before finalizing this test if the first run fails on `findByRole`/`getByPlaceholderText`.)

- [ ] **Step 5: Deploy the edge function and verify**

Deploy via `mcp__supabase__deploy_edge_function`, `name: "ai-blog-writer"`, `verify_jwt: true` (unchanged — it was already the default). Verify: call it with a Basic-tier doctor's real session JWT → expect 403 "AI Blog Writer is a Premium-only feature." Call with a Premium/trial doctor's JWT → expect a normal article response.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ai-blog-writer/index.ts src/components/admin/BlogPage.tsx src/components/admin/BlogPage.test.tsx
git commit -m "fix: authenticate ai-blog-writer with the doctor's session, gate to Premium

BlogPage.tsx was sending the anon key as its bearer token, not the
doctor's own session - the new server-side premium check would have
rejected every doctor, not just Basic ones, without this fix.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: `usePlanAccess()` hook

**Files:**
- Create: `src/hooks/usePlanAccess.ts`
- Test: `src/hooks/usePlanAccess.test.ts`

**Interfaces:**
- Consumes: `useProfile()` (`src/hooks/useProfile.ts`, existing — returns `{ profile, loading }` where `profile.id` is the doctor's id); `get_appointment_cap_usage` RPC (Task 2, live in production after Task 7).
- Produces: `export function usePlanAccess(): { isPremium: boolean; appointmentsUsed: number; appointmentsCap: number; nearCap: boolean; loading: boolean }`, exported from `src/hooks/usePlanAccess.ts`. Tasks 13–15 import and use this.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/usePlanAccess.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePlanAccess } from "./usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1" }, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";

describe("usePlanAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns isPremium=true and no cap numbers for a premium doctor", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: true, appointments_used: 0, appointments_cap: 0 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPremium).toBe(true);
    expect(result.current.nearCap).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith("get_appointment_cap_usage", { _doctor_id: "doctor-1" });
  });

  it("computes nearCap at >= 90% usage for a basic doctor", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 460, appointments_cap: 500 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPremium).toBe(false);
    expect(result.current.appointmentsUsed).toBe(460);
    expect(result.current.appointmentsCap).toBe(500);
    expect(result.current.nearCap).toBe(true);
  });

  it("nearCap is false comfortably under the threshold", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 100, appointments_cap: 500 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.nearCap).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/usePlanAccess.test.ts`
Expected: FAIL — `Cannot find module './usePlanAccess'`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/usePlanAccess.ts`:

```ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";

export interface PlanAccess {
  isPremium: boolean;
  appointmentsUsed: number;
  appointmentsCap: number;
  nearCap: boolean;
  loading: boolean;
}

const NEAR_CAP_THRESHOLD = 0.9;

export function usePlanAccess(): PlanAccess {
  const { profile } = useProfile();
  const [state, setState] = useState<Omit<PlanAccess, "loading">>({
    isPremium: false,
    appointmentsUsed: 0,
    appointmentsCap: 0,
    nearCap: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    supabase.rpc("get_appointment_cap_usage", { _doctor_id: profile.id }).then(({ data }) => {
      if (cancelled) return;
      const row = data?.[0];
      const isPremium = row?.is_premium ?? false;
      const appointmentsUsed = row?.appointments_used ?? 0;
      const appointmentsCap = row?.appointments_cap ?? 0;
      const nearCap = !isPremium && appointmentsCap > 0 && appointmentsUsed / appointmentsCap >= NEAR_CAP_THRESHOLD;
      setState({ isPremium, appointmentsUsed, appointmentsCap, nearCap });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return { ...state, loading };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/usePlanAccess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `defaultSubject` support to `ContactSupportDialog`**

In `src/components/admin/ContactSupportDialog.tsx`, change:

```tsx
const ContactSupportDialog = ({ trigger }: { trigger?: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
```

to:

```tsx
const ContactSupportDialog = ({ trigger, defaultSubject }: { trigger?: React.ReactNode; defaultSubject?: string }) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject ?? "");
```

And change the reset-on-close line inside `submit`:
```ts
    setSubject(""); setDescription(""); setPriority("normal"); setOpen(false);
```
to:
```ts
    setSubject(defaultSubject ?? ""); setDescription(""); setPriority("normal"); setOpen(false);
```
so a locked-feature card's dialog resets back to its own pre-filled subject, not a blank one, if reopened.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePlanAccess.ts src/hooks/usePlanAccess.test.ts src/components/admin/ContactSupportDialog.tsx
git commit -m "feat: add usePlanAccess hook and defaultSubject support to ContactSupportDialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: `<LockedFeatureCard>` component

**Files:**
- Create: `src/components/admin/LockedFeatureCard.tsx`
- Test: `src/components/admin/LockedFeatureCard.test.tsx`

**Interfaces:**
- Consumes: `ContactSupportDialog` (Task 10's `defaultSubject` prop).
- Produces: `export default function LockedFeatureCard(props: { featureName: string; description: string }): JSX.Element`, exported from `src/components/admin/LockedFeatureCard.tsx`. Tasks 12–14 import this.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/LockedFeatureCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LockedFeatureCard from "./LockedFeatureCard";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  },
}));

describe("LockedFeatureCard", () => {
  it("renders the feature name and description, and opens the support dialog pre-filled on click", () => {
    render(<LockedFeatureCard featureName="Billing & Invoices" description="Track revenue and generate GST invoices." />);

    expect(screen.getByText("Billing & Invoices")).toBeInTheDocument();
    expect(screen.getByText(/track revenue and generate gst invoices/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /request upgrade/i }));
    expect(screen.getByDisplayValue("Upgrade to Premium")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/admin/LockedFeatureCard.test.tsx`
Expected: FAIL — `Cannot find module './LockedFeatureCard'`.

- [ ] **Step 3: Implement the component**

Create `src/components/admin/LockedFeatureCard.tsx`:

```tsx
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ContactSupportDialog from "./ContactSupportDialog";

interface Props {
  featureName: string;
  description: string;
}

export default function LockedFeatureCard({ featureName, description }: Props) {
  return (
    <Card className="border-dashed border-2 border-border">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-royal/10 flex items-center justify-center text-royal">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="font-heading font-bold text-xl text-primary">{featureName}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <ContactSupportDialog
          defaultSubject="Upgrade to Premium"
          trigger={
            <Button className="bg-royal hover:bg-royal/90 mt-2">Request Upgrade</Button>
          }
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/admin/LockedFeatureCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LockedFeatureCard.tsx src/components/admin/LockedFeatureCard.test.tsx
git commit -m "feat: add LockedFeatureCard for gated dashboard sections

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Gate Billing, AI Blog Writer, and Online Consultation

**Files:**
- Modify: `src/components/admin/BillingPage.tsx`
- Modify: `src/components/admin/BlogPage.tsx`
- Modify: `src/components/admin/MyWebsite.tsx`
- Test: `src/components/admin/BillingPage.test.tsx` (new)
- Test: `src/components/admin/MyWebsite.test.tsx` (new)
- Test: `src/components/admin/BlogPage.test.tsx` (modify — this file was created in Task 9; this
  task both adds new gating tests to it AND updates Task 9's original test, which will otherwise
  break the moment this task wires `usePlanAccess` into `BlogPage.tsx` — see Step 6)

**Interfaces:**
- Consumes: `usePlanAccess()` (Task 10), `LockedFeatureCard` (Task 11).

- [ ] **Step 1: Gate `BillingPage.tsx`**

Add the import and hook call, and wrap the return:

```tsx
import { usePlanAccess } from "@/hooks/usePlanAccess";
import LockedFeatureCard from "./LockedFeatureCard";
```

Inside the component, right after `const { profile } = useProfile();`:
```tsx
  const { isPremium, loading: planLoading } = usePlanAccess();
```

Change the component's `return` statement — wrap the existing JSX so it only renders once premium is confirmed, otherwise render the locked card:

```tsx
  if (!planLoading && !isPremium) {
    return (
      <div className="max-w-6xl mx-auto">
        <LockedFeatureCard
          featureName="Billing & Invoices"
          description="Track revenue, auto-generate GST invoices, and export transactions. Available on Premium."
        />
      </div>
    );
  }

  return (
```
(keep the existing `<div className="max-w-6xl mx-auto space-y-6">...` JSX unchanged below this — just note this `return (` replaces the original bare `return (` at the top of the render).

- [ ] **Step 2: Gate the AI Blog Writer section in `BlogPage.tsx`**

Add the same import/hook. In the dialog's JSX, wrap the existing "AI Writer" block:

```tsx
{/* AI Writer */}
<div className="p-4 rounded-xl bg-ai-purple/5 border border-ai-purple/20 space-y-3">
```

becomes conditional — replace it with:

```tsx
{/* AI Writer */}
{isPremium ? (
  <div className="p-4 rounded-xl bg-ai-purple/5 border border-ai-purple/20 space-y-3">
```

and find that block's closing `</div>` (the one that matches this opening div, right before whatever comes after the AI Writer section in the dialog) and change it to:

```tsx
  </div>
) : (
  <LockedFeatureCard
    featureName="AI Blog Writer"
    description="Generate patient-friendly health articles with AI in seconds. Available on Premium."
  />
)}
```

(The exact closing tag to target: locate the AI Writer `<div>` block's matching close by counting nested divs from the opening tag shown above — it's the div containing the topic `Input` and `Generate` `Button`.)

- [ ] **Step 3: Gate the Online Consultation section in `MyWebsite.tsx`**

Add the same import/hook call. Change:

```tsx
{/* Online Consultation */}
<AccordionItem value="online" className="border rounded-xl px-4">
  <AccordionTrigger className="text-sm font-semibold text-primary">
    <div className="flex items-center justify-between w-full pr-2">
      Online Consultation
      <Switch checked={settings.show_online_consultation ?? false} onCheckedChange={(v) => updateSetting("show_online_consultation", v)} onClick={(e) => e.stopPropagation()} />
    </div>
  </AccordionTrigger>
  <AccordionContent className="space-y-3 pb-4">
```

to:

```tsx
{/* Online Consultation */}
{isPremium ? (
<AccordionItem value="online" className="border rounded-xl px-4">
  <AccordionTrigger className="text-sm font-semibold text-primary">
    <div className="flex items-center justify-between w-full pr-2">
      Online Consultation
      <Switch checked={settings.show_online_consultation ?? false} onCheckedChange={(v) => updateSetting("show_online_consultation", v)} onClick={(e) => e.stopPropagation()} />
    </div>
  </AccordionTrigger>
  <AccordionContent className="space-y-3 pb-4">
```

Find this `AccordionItem`'s matching closing `</AccordionItem>` (immediately follows the Video Provider `Select` block and any fields after it, before the next `{/* ... */}` section comment) and change it to:

```tsx
</AccordionItem>
) : (
  <div className="border rounded-xl px-4 py-3">
    <LockedFeatureCard
      featureName="Online Consultation"
      description="Video consultations via Zoom, with fee and duration settings. Available on Premium."
    />
  </div>
)}
```

Also add basic error surfacing to the existing settings save call, since it currently silently swallows errors — find:
```ts
    await supabase.from("website_settings").update(settingsData as any).eq("doctor_id", profile.id);
```
and change to:
```ts
    const { error: settingsError } = await supabase.from("website_settings").update(settingsData as any).eq("doctor_id", profile.id);
    if (settingsError) toast({ title: "Save failed", description: settingsError.message, variant: "destructive" });
```
(`toast` is already imported in this file from `@/hooks/use-toast`.)

- [ ] **Step 4: Write and run `BillingPage.test.tsx`**

Create `src/components/admin/BillingPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BillingPage from "./BillingPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test" }, loading: false }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));

vi.mock("@/lib/invoicePdf", () => ({ generateInvoicePDF: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    eq: () => chain(resolved),
    order: () => Promise.resolve(resolved),
  });
  return {
    supabase: {
      from: vi.fn(() => chain({ data: [] })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

describe("BillingPage - plan gating", () => {
  it("shows LockedFeatureCard instead of billing content for a Basic-tier doctor", () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(<BillingPage />);
    expect(screen.getByRole("button", { name: /request upgrade/i })).toBeInTheDocument();
    expect(screen.queryByText(/billing & revenue/i)).not.toBeInTheDocument();
  });

  it("shows real billing content for a Premium doctor", () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(<BillingPage />);
    expect(screen.getByText(/billing & revenue/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request upgrade/i })).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/admin/BillingPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write and run `MyWebsite.test.tsx`**

Create `src/components/admin/MyWebsite.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { usePlanAccess } from "@/hooks/usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", slug: "dr-test" }, loading: false }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    eq: () => chain(resolved),
    order: () => Promise.resolve(resolved),
    single: () => Promise.resolve(resolved),
  });
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "website_settings") {
          return chain({ data: { id: "ws-1", doctor_id: "doctor-1", show_online_consultation: false } });
        }
        return chain({ data: [] });
      }),
    },
  };
});

function renderMyWebsite() {
  return render(
    <MemoryRouter>
      <MyWebsite />
    </MemoryRouter>
  );
}

describe("MyWebsite - Online Consultation gating", () => {
  it("shows LockedFeatureCard instead of the toggle for a Basic-tier doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    renderMyWebsite();
    expect(await screen.findByRole("button", { name: /request upgrade/i })).toBeInTheDocument();
  });

  it("shows the real Online Consultation toggle for a Premium doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    renderMyWebsite();
    await screen.findByText(/online consultation/i);
    expect(screen.queryByRole("button", { name: /request upgrade/i })).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/admin/MyWebsite.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Update Task 9's `BlogPage.test.tsx` and add new gating tests**

This task wires `usePlanAccess()` into `BlogPage.tsx` (Step 2 above), which the original test written in
Task 9 doesn't mock — it will break (`usePlanAccess()` returning `undefined`, crashing on
destructure) unless fixed here.

In `src/components/admin/BlogPage.test.tsx`, add near the top (alongside the existing `vi.mock`
calls from Task 9):

```tsx
vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));
```

and add the import:
```tsx
import { usePlanAccess } from "@/hooks/usePlanAccess";
```

In Task 9's existing `describe("BlogPage - AI writer auth", ...)` block, add a `beforeEach` (or
the first line of its existing test) setting a default so that test keeps exercising the Premium
path it was written for:
```tsx
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
  });
```
(If Task 9's file didn't already have a `beforeEach` in that block, add one; if it did, merge this
into it rather than adding a second.)

Then append a new describe block to the same file:

```tsx
describe("BlogPage - AI Blog Writer gating", () => {
  it("shows LockedFeatureCard instead of the AI writer inputs for a Basic-tier doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(<BlogPage />);
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByRole("button", { name: /request upgrade/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/top 10 tips/i)).not.toBeInTheDocument();
  });

  it("shows the real AI writer inputs for a Premium doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(<BlogPage />);
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByPlaceholderText(/top 10 tips/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request upgrade/i })).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/components/admin/BlogPage.test.tsx`
Expected: PASS — Task 9's original test still passes (now explicitly Premium), plus the 2 new
gating tests.

- [ ] **Step 7: Full build check**

Run: `npm run build` — confirms no TypeScript/JSX errors across all three modified page files.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/BillingPage.tsx src/components/admin/BlogPage.tsx src/components/admin/MyWebsite.tsx src/components/admin/BillingPage.test.tsx src/components/admin/MyWebsite.test.tsx
git commit -m "feat: show LockedFeatureCard for Billing, AI Blog Writer, Online Consultation on Basic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Appointment cap warning banner + friendly error on cap-hit

**Files:**
- Modify: `src/components/admin/DashboardHome.tsx`
- Modify: `src/components/admin/AppointmentsPage.tsx`

**Interfaces:**
- Consumes: `usePlanAccess()` (Task 10).

- [ ] **Step 1: Add the warning banner to `DashboardHome.tsx`**

Add the import and hook call (`import { usePlanAccess } from "@/hooks/usePlanAccess";`, then `const { nearCap, appointmentsUsed, appointmentsCap } = usePlanAccess();` near the component's other hooks). In the JSX, right after the existing trial-banner block (the `{profile?.plan_status === "trial" && (...)}` block found near the top of the returned JSX), add:

```tsx
{nearCap && (
  <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
    <p className="text-sm text-foreground">
      You've used <strong>{appointmentsUsed}/{appointmentsCap}</strong> appointments this month — upgrade to Premium for unlimited.
    </p>
  </div>
)}
```

- [ ] **Step 2: Add the same banner and friendly cap-hit error to `AppointmentsPage.tsx`**

Add the same import/hook call. Add the identical banner JSX (copy verbatim from Step 1) near the top of `AppointmentsPage.tsx`'s returned JSX, above the appointments list.

Then find the appointment-creation submit handler (`const { error } = await supabase.from("appointments").insert({...});` around where `newAppt`/`token` are built) and its existing error handling immediately after. Add a specific case for the cap trigger's error message:

```ts
    const { error } = await supabase.from("appointments").insert({
      doctor_id: profile.id, ...rest, service_name: serviceName,
      appointment_type: "clinic",
      patient_phone: normalizedPhone,
      token_number: token, status: status as any, payment_status: "pending" as any,
    });
    if (error) {
      if (error.message.includes("MONTHLY_APPOINTMENT_CAP_REACHED")) {
        toast.error("You've reached your plan's monthly appointment limit. Upgrade to Premium for unlimited appointments.");
      } else {
        toast.error(error.message);
      }
      return;
    }
```

(Match this against whatever error-handling already exists immediately after that `insert` call in the actual file — merge rather than duplicate if there's already an `if (error)` block there; the goal is just to special-case the cap message.)

- [ ] **Step 3: Manual verification**

Run: `npm run build`. Then with a Basic-tier test doctor at/near their cap (use the same `platform_settings` temporary-lower-the-cap trick from Task 3's verification, applied to production via `execute_sql` temporarily, then restored to 500 immediately after), confirm the banner appears in both pages, and confirm attempting to create one more appointment past the cap shows the friendly toast rather than a raw Postgres error string.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DashboardHome.tsx src/components/admin/AppointmentsPage.tsx
git commit -m "feat: show approaching-cap warning banner and friendly cap-hit error

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Wire the dead "Upgrade Plan" button, fix marketing copy

**Files:**
- Modify: `src/components/admin/SettingsPage.tsx`
- Modify: `src/components/landing/PricingSection.tsx`

**Interfaces:** None new.

- [ ] **Step 1: Wire the button in `SettingsPage.tsx`**

Add the import: `import ContactSupportDialog from "./ContactSupportDialog";` (note: `Crown` icon is already imported in this file per its existing imports).

Change:
```tsx
                  <Button className="bg-royal hover:bg-royal/90">Upgrade Plan</Button>
```
to:
```tsx
                  <ContactSupportDialog
                    defaultSubject="Upgrade to Premium"
                    trigger={<Button className="bg-royal hover:bg-royal/90">Upgrade Plan</Button>}
                  />
```

- [ ] **Step 2: Fix the marketing copy in `PricingSection.tsx`**

Change:
```ts
      "Up to 100 appointments/month",
```
to:
```ts
      "Up to 500 appointments/month",
```
(in the `plans` array's `"Starter"` entry's `features` list).

Also update the comparison table's matching row:
```ts
  { name: "Appointments/month", starter: "100", professional: "Unlimited", premium: "Unlimited" },
```
to:
```ts
  { name: "Appointments/month", starter: "500", professional: "Unlimited", premium: "Unlimited" },
```

- [ ] **Step 3: Verify**

Run: `npm run build`. Visually confirm on the landing page (`npm run dev`, navigate to `/#pricing`) that the Starter card and comparison table both show 500.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/SettingsPage.tsx src/components/landing/PricingSection.tsx
git commit -m "fix: wire dead Upgrade Plan button, correct marketing copy to 500/month cap

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Full regression pass

**Files:** None (verification only).

- [ ] **Step 1: Full automated suite**

Run: `npm test` — expect all tests (pre-existing + every new test from Tasks 9, 10, 11, and 12) to pass.
Run: `npx tsc --noEmit -p tsconfig.app.json` — expect clean.
Run: `npm run build` — expect success.

- [ ] **Step 2: Manual QA checklist (requires production DB access — use a real or disposable test doctor account, not a real customer)**

- [ ] Basic-tier doctor: create appointments up to 500 for the current month → 501st blocked with friendly error, both from the doctor's own "New Appointment" and (separately) via a simulated public booking insert.
- [ ] Basic-tier doctor: attempt to enable Online Consultation in `MyWebsite.tsx` → sees `LockedFeatureCard` instead of the toggle at all.
- [ ] Basic-tier doctor: visit Billing and Blog's AI writer → both show `LockedFeatureCard`.
- [ ] Premium-tier doctor: all three features fully functional, no appointment cap.
- [ ] Trial-status doctor (`plan_status='trial'`, any `plan_tier`): full Premium access across all three gates and no appointment cap, confirmed via `usePlanAccess()`'s `isPremium`.
- [ ] Superadmin downgrades a Premium doctor (with Online Consultation already on) to Basic via `SASubscriptions.tsx` → Online Consultation auto-disables (confirm in `website_settings` directly, and confirm the doctor's `MyWebsite.tsx` now shows the locked card).
- [ ] Set a test doctor's `trial_end` to yesterday, manually run the `expire-trials` cron UPDATE via `execute_sql` (don't wait for the real 2am schedule) → `plan_status` becomes `expired`, Online Consultation auto-disables if it was on.
- [ ] Click "Upgrade Plan" (`SettingsPage.tsx`) and each `LockedFeatureCard`'s "Request Upgrade" → `ContactSupportDialog` opens pre-filled with "Upgrade to Premium," and submitting creates a real row in `support_tickets`.
- [ ] Near-cap warning banner appears on `DashboardHome.tsx` and `AppointmentsPage.tsx` once a Basic doctor crosses 450/500 for the month, and disappears once they're Premium.

No commit for this task — verification only, no code changes expected. If any check fails, return to the relevant earlier task, fix, and re-verify before considering this plan complete.
