// Catalog-level audit of the local database (pg_class / pg_proc / pg_policies) plus static checks of the
// migration files. Snapshot-style tests pin today's surface so any NEW anon-executable function, new
// permissive write policy, or table without RLS shows up as a failing test that must be reviewed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql, sqlCol, sqlRows } from "./helpers";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const migrations = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

describe("row level security", () => {
  it("every table in public has RLS enabled", () => {
    expect(sqlCol(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`)).toEqual([]);
  });

  it("tables with RLS but no policy at all (deny-all, service role only) are exactly the internal ones", () => {
    expect(sqlCol(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not exists
        (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname) order by 1`))
      .toEqual(["rate_limit_buckets", "token_lookup_attempts"]);
  });

  it("no two policies are identical duplicates (same table, command, roles, USING and CHECK)", () => {
    expect(sqlRows(`select tablename, cmd, count(*) from pg_policies where schemaname='public'
      group by tablename, cmd, roles, qual, with_check having count(*) > 1`)).toEqual([]);
  });

  it("the only unconditional write policies are the two public contact forms", () => {
    expect(sqlCol(`select tablename||':'||cmd||':'||policyname from pg_policies where schemaname='public'
      and cmd<>'SELECT' and (with_check='true' or (qual='true' and with_check is null)) order by 1`))
      .toEqual(["enquiries:INSERT:Public can submit enquiries", "patient_queries:INSERT:Public can create patient queries"]);
  });

  it("the tables readable by everyone (USING true) are exactly the public-site ones", () => {
    expect(sqlCol(`select tablename from pg_policies where schemaname='public' and cmd='SELECT' and qual='true' order by 1`))
      .toEqual(["features", "gallery_photos", "platform_settings", "slug_history", "website_settings", "working_hours"]);
  });

  it("every write policy that anon can reach is limited to a valid (onboarded) doctor", () => {
    const rows = sqlRows(`select tablename, policyname, regexp_replace(coalesce(with_check,''), '[[:space:]]+', ' ', 'g') from pg_policies where schemaname='public'
      and cmd='INSERT' and roles='{public}' and with_check not like '%staff_doctor_id%' and with_check not like '%has_role%'
      and with_check not like '%sa_has%' and with_check not like '%is_active_team_member%' and with_check not like '%auth.uid()%' order by 1`);
    const open = rows.map((r) => r[0]).sort();
    expect(open).toEqual(["appointments", "enquiries", "patient_queries", "patients", "reviews"]);
    for (const [table, , check] of rows.filter((r) => ["appointments", "patients", "reviews"].includes(r[0]))) {
      expect(check, table).toMatch(/onboarding_completed = true/);
    }
  });
});

describe("function execute privileges", () => {
  const FUNCS = `select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype`;
  const anonFns = () => sqlCol(`${FUNCS} and has_function_privilege('anon',p.oid,'execute') order by 1`);

  // Current surface for anon, reviewed one by one:
  const INTENDED_ANON = [
    "blog_facets()", "cancel_appointment_by_token(uuid,text,text)", "directory_facets(text)", "directory_slugify(text)",
    "get_appointment_by_token(uuid,text,text)", "get_my_queue_status(uuid,text,text)", "get_public_feature_flags(uuid)",
    "get_public_queue(uuid)", "get_shared_prescription(text,text)", "get_queue_position(uuid)", "get_slot_counts(uuid,date,text)",
    "reschedule_appointment_by_token(uuid,text,text,date,text)", "search_blog_posts(text,text,integer,integer)",
    "search_doctors(text,text,text,integer,integer)",
  ];
  const SELF_CHECKING_BUT_NOT_NEEDED = [ // anon-executable, authorise internally or only answer yes/no for a known uuid
    "cancel_custom_plan(uuid)", "doctor_has_feature(uuid,text)", "doctor_has_premium_access(uuid)",
    "get_doctor_feature_access(uuid)", "get_doctor_plan_status(uuid)", "has_role(uuid,app_role)", "is_active_team_member(uuid)",
    "sa_has_any_permission(uuid,text[])", "sa_has_permission(uuid,text)", "staff_doctor_id(uuid)", "staff_has_permission(uuid,text)",
    "update_custom_plan_terms(uuid,numeric,timestamp with time zone)", "withdraw_plan_request(uuid)",
  ];
  const DANGEROUS = ["get_or_create_dev_user(text,text,boolean)", "get_upcoming_checkup(uuid,text)"];

  it("snapshot: anon-executable non-trigger functions are exactly the reviewed list", () => {
    expect(anonFns()).toEqual([...INTENDED_ANON, ...SELF_CHECKING_BUT_NOT_NEEDED, ...DANGEROUS].sort());
  });

  // BUG (see devUserFunction / tokenLookup tests): get_or_create_dev_user (writes auth.users, returns a password)
  // and get_upcoming_checkup (patient lookup by phone) are anon-executable. Also the SELF_CHECKING list should be
  // revoked from anon/PUBLIC (default PUBLIC EXECUTE was never revoked): least privilege.
  it.fails("BUG: anon can execute only the intended public functions", () => {
    expect(anonFns()).toEqual([...INTENDED_ANON].sort());
  });
  it.fails("BUG: anon cannot execute the dangerous ones", () => {
    expect(anonFns().filter((f) => DANGEROUS.includes(f))).toEqual([]);
  });

  it("snapshot: functions executable by signed-in users but not anon", () => {
    expect(sqlCol(`${FUNCS} and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') order by 1`)).toEqual([
      "get_appointment_cap_usage(uuid)", "get_doctor_plan_details(uuid)", "queue_action(text,uuid,text,text,text,text)",
      "rebase_custom_plan(uuid)",
      "review_plan_request(uuid,text,text[],numeric,timestamp with time zone,timestamp with time zone,text,integer)",
      "set_custom_plan_appointments_limit(uuid,integer)", "submit_plan_request(text[],text[],text,integer)",
      "touch_staff_login()", "touch_team_login()",
    ].sort());
  });

  it("internal helpers are NOT executable by anon or authenticated (admin_verify_password, admin_delete_auth_user, ...)", () => {
    const internal = sqlCol(`${FUNCS} and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') order by 1`);
    for (const f of [
      "admin_verify_password(uuid,text)", "admin_delete_auth_user(uuid)", "revoke_user_sessions(uuid)", "apply_plan_upgrade_payment(uuid,text,text)",
      "ensure_invoice_for_appointment(uuid)", "release_provisional_patient(uuid)", "uncount_patient_visit(uuid,uuid)", "public_booking_price(uuid,text,text)",
      "consume_rate_limit(text,integer,integer)", "token_lookup_ok(uuid,text)", "token_lookup_failed(uuid,text)", "token_lookup_blocked(uuid,text)",
      "expire_overdue_appointments()", "expire_trials()", "expire_paid_plans()", "activate_scheduled_plans()",
      "send_plan_expiry_notifications()", "send_trial_warning_notifications()", "doctor_monthly_appointment_limit(uuid)",
    ]) expect(internal, f).toContain(f);
  });

  it("every SECURITY DEFINER function in public pins search_path (except the dev-user function, flagged below)", () => {
    const bad = sqlCol(`select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.prokind='f' and not exists
      (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') order by 1`);
    expect(bad).toEqual(["get_or_create_dev_user(text,text,boolean)"]);
  });
  it.fails("BUG: no SECURITY DEFINER function in public lacks a pinned search_path", () => {
    expect(sqlCol(`select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.prokind='f' and not exists
      (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).toEqual([]);
  });

  it("direct table privileges: anon holds the Supabase default grants, so RLS is the only barrier (informational)", () => {
    const n = sql(`select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type='DELETE'`);
    expect(Number(n)).toBeGreaterThan(0);
  });
});

describe("migrations replay (static checks; a fresh `supabase db reset` fails today)", () => {
  const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8");

  // BUG (replay blocker): 20260725081015 creates "Admins can view all patients" (loop over a table list that
  // includes patients, DROP IF EXISTS + CREATE) and 20260810010001 creates it AGAIN with a bare CREATE POLICY
  // -> `policy ... already exists` on a fresh database. Needs DROP POLICY IF EXISTS before the CREATE.
  it.fails("BUG: 20260810010001 re-creating 'Admins can view all patients' is idempotent", () => {
    const earlier = migrations().filter((f) => f < "20260810010001").some((f) => /FOREACH t IN ARRAY ARRAY\[[^\]]*'patients'/.test(read(f)) && /Admins can view all %1\$s/.test(read(f)));
    expect(earlier).toBe(true); // precondition: the first creation really exists
    const file = read(migrations().find((f) => f.startsWith("20260810010001"))!);
    expect(file).toMatch(/DROP POLICY IF EXISTS "Admins can view all patients" ON public\.patients/);
  });

  // BUG (replay blocker): 20261029150000 re-declares get_appointment_by_token as RETURNS TABLE(time_slot text,
  // amount numeric ...) but its RETURN QUERY selects a.time_slot (time) and a.amount (integer) uncast ->
  // "structure of query does not match function result type" the first time it is CALLED (and on db reset
  // validation). tests/seed/localFixes.sql patches the local DB with ::text / ::numeric casts.
  it.fails("BUG: the latest get_appointment_by_token migration casts time_slot::text and amount::numeric", () => {
    const defining = migrations().filter((f) => /FUNCTION public\.get_appointment_by_token\(/i.test(read(f)));
    const last = read(defining[defining.length - 1]);
    const body = last.slice(last.search(/FUNCTION public\.get_appointment_by_token\(/i));
    expect(body).toMatch(/a\.time_slot::text/);
    expect(body).toMatch(/a\.amount::numeric/);
  });

  it("the live local function (after tests/seed/localFixes.sql) really returns the typed columns", async () => {
    const def = sql(`select pg_get_functiondef('public.get_appointment_by_token(uuid,text,text)'::regprocedure)`);
    expect(def).toMatch(/a\.time_slot::text/);
  });

  it("migration file names are unique timestamps in order", () => {
    const stamps = migrations().map((f) => f.split("_")[0]);
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
