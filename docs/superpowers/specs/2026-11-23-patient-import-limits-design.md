# Patient import limits and approval: design

Date: 2026-11-23
Status: approved in conversation, awaiting spec review

## Problem

The patient CSV import (`PatientImportDialog`, `patientImport.ts`) limits a file to 1,000 rows and 2 MB, but only in the browser. The database accepts any number of `patients` rows from a signed-in doctor, because the policy is "own rows, all operations", and staff with `patients.add` inherit the same right. Someone can skip the dialog and call the API in a loop, or import repeatedly, and grow the table without bound. That slows the clinic's own pages (list, search, export) and costs storage.

Hiding or approving the Import button alone does not fix this, because the button is not the only way in. The limits have to be enforced by the database.

## Decisions (from the brainstorming conversation)

1. **Plan gate.** Import is available only on a paid Pro or Premium plan. Free, trial, expired and cancelled clinics get no import.
2. **Per-tier cap with approval.** Pro and Premium have a cap on how many patients a clinic may hold when an import runs. A clinic that needs more requests a higher limit, and superadmin approves or declines it.
3. **Enforcement in the database**, through one import function, plus a guard on direct inserts.

## Goals and non-goals

Goals:
- A clinic that is not eligible cannot add patients in bulk by any route.
- An eligible clinic cannot grow the table past its cap, or faster than the daily limits, by importing.
- Superadmin can raise, block or grant import per clinic, with a record of who decided.
- Real bookings and normal manual adds are never blocked by these limits.

Non-goals:
- No retroactive deletion or blocking of existing patients.
- No cap on documents, visits or other tables (separate problem).
- No "undo last import" (possible later: the import log would need a batch id on `patients`).
- No new superadmin permission keys (reuse `plan_requests.view` / `plan_requests.manage`).

## Rules

| Rule | Value | Where it lives |
|---|---|---|
| Eligible | An active superadmin override (`allowed` / `blocked`) decides first; otherwise `plan_tier IN ('pro','premium')` and `plan_status = 'active'` | `patient_import_eligible()` |
| Tier cap | Pro 2,000; Premium 10,000 patients held in total at import time | `platform_settings` keys |
| Approved cap | The larger of the tier cap and the latest approved request's cap | `patient_import_cap()` |
| Rows per import | 1,000 | `platform_settings` |
| Imports per rolling 24 h | 5 | `platform_settings` |
| Rows imported per rolling 24 h | 2,000 | `platform_settings` |
| Direct (non-import) inserts per hour | 100 per clinic | `platform_settings` |
| Request ceiling | 100,000 | `platform_settings` |
| Wait after a declined request | 7 days | function constant |

All numbers are defaults seeded into `platform_settings` and can be changed without a deploy. The cap applies only when an import runs. Bookings and single manual adds never count against it.

## Data model (one migration)

`platform_settings` keys: `patient_import_cap_pro` (2000), `patient_import_cap_premium` (10000), `patient_import_max_rows` (1000), `patient_import_max_per_day` (5), `patient_import_max_rows_per_day` (2000), `patient_import_cap_ceiling` (100000), `patient_direct_insert_per_hour` (100).

`patient_import_overrides`: `doctor_id` (primary key), `mode` (`allowed` / `blocked`), `until` (nullable timestamp; after it the override no longer applies), `reason`, `set_by`, `set_at`. Read-only for superadmin with `plan_requests.view`; written only by `set_patient_import_override`. It is a separate table on purpose: the existing `features` system also feeds the public feature flags and the custom-plan feature picker, and a column on `profiles` could be edited by the doctor themself.

`patient_imports` (audit log, counts only, no patient data): `id`, `doctor_id`, `user_id`, `file_name` (max 200 chars), `rows_received`, `rows_inserted`, `rows_duplicate`, `rows_rejected`, `created_at`. Index on `(doctor_id, created_at)`. Read-only for the clinic (own rows) and superadmin; written only by `import_patients`.

`patient_import_requests`: `id`, `doctor_id`, `requested_cap` (integer, 1 to the ceiling), `doctor_note`, `status` (`pending` / `approved` / `rejected`), `approved_cap`, `reviewer_id`, `reviewer_note`, `decided_at`, `created_at`. Unique partial index on `(doctor_id)` where `status = 'pending'` (one open request per clinic). Read-only for the clinic (own rows) and for superadmin with `plan_requests.view`; written only by the functions below.

`patient_insert_counters`: `doctor_id`, `window_start`, `n`. Used only by the direct-insert guard. No client access.

Supporting index: `patients (doctor_id)` already serves counts; no new index on `patients` is needed.

## Functions

All are `SECURITY DEFINER` with `search_path = public`, execute granted to `authenticated` only (none to `anon`).

- `patient_import_eligible(_doctor_id)`: an unexpired `patient_import_overrides` row wins (`allowed` true, `blocked` false), otherwise the plan rule above.
- `set_patient_import_override(_doctor_id, _mode, _until, _reason)`: requires `plan_requests.manage`. `_mode` is `allowed`, `blocked` or `clear` (deletes the row). A reason is required for `allowed` and `blocked`. Writes `admin_audit_log`.
- `patient_import_cap(_doctor_id)`: tier cap, raised by the latest approved request.
- `get_patient_import_access()`: for the caller's clinic returns `eligible`, `reason` (`ok`, `plan`, `blocked`, `no_permission`), `cap`, `patient_count`, `remaining`, `imports_today`, `rows_today`, `pending_request` and `cooldown_until`. Used by the UI. Not itself an enforcement point.
- `import_patients(_rows jsonb, _file_name text)`: the only bulk path (details below).
- `request_patient_import_limit(_requested integer, _note text)`: creates the request. Refuses when the clinic is not eligible, a request is already pending, the cooldown after a decline has not passed, or the number is not above the current cap or is over the ceiling.
- `review_patient_import_request(_request_id, _decision, _approved_cap, _note)`: requires `sa_has_permission(auth.uid(), 'plan_requests.manage')`. A decline needs a note. An approval needs a cap between the requested number's floor (the current cap) and the ceiling. Writes `admin_audit_log` and a `notifications` row (reusing source type `plan_request`) for the doctor.
- `guard_patient_direct_inserts()` (BEFORE INSERT trigger on `patients`): see below.

### `import_patients` behaviour

1. Resolve the clinic from `auth.uid()`: the doctor themself, or an active staff member whose permissions include `patients.add` (via `staff_doctor_id`). Nothing about the clinic is taken from the payload.
2. Refuse with `NOT_ALLOWED` if neither applies.
3. Return `{ok:false, error:'NOT_ELIGIBLE'}` when `patient_import_eligible` is false.
4. Reject the payload (`{ok:false, error:'PAYLOAD_INVALID'}`) when it is not a JSON array, has more than `patient_import_max_rows` items or is larger than 2 MB as text.
5. Take `pg_advisory_xact_lock(hashtext('patient_import:' || clinic))` so two imports for one clinic run one after the other.
6. Check the daily limits against `patient_imports` (last 24 hours). Return `{ok:false, error:'DAILY_LIMIT', ...}` if exceeded.
7. Validate each row in SQL with the same rules as `patientIntake.ts` and `patientCsv.ts` (name, phone, age, gender, optional weight and email, notes length, history dates real, not in the future and in order, total visits 0 to 10,000). Failing rows go to a `rejected` list with an index and a code. The browser validates first for a good message, but the server never trusts it.
8. Work out which valid rows are new: not already held under the `uq_patients_doctor_phone_name` key and not repeated earlier in the payload.
9. If `current patient count + new rows > cap`, return `{ok:false, error:'CAP_EXCEEDED', cap, current, incoming}` and write nothing.
10. Otherwise set the transaction-local flag `app.patient_import = 'on'`, insert the new rows (`ON CONFLICT DO NOTHING` as a backstop), write one `patient_imports` row, and return `{ok:true, inserted, duplicates, rejected:[...]}`. The call is a single transaction, so it is all or nothing.

### The direct-insert guard

A BEFORE INSERT trigger on `patients`. It does nothing (allows the row) when any of these is true:
- `pg_trigger_depth() > 1`, meaning the insert came from another trigger (the booking triggers `sync_appointment_patient` and the lifecycle trigger);
- `current_setting('app.patient_import', true) = 'on'`, meaning it came from `import_patients` (only that function sets it, and a client cannot set it);
- `auth.uid()` is null, meaning service role, cron or a migration (same trust rule the repo already uses).

Otherwise it increments the clinic's counter in `patient_insert_counters` for the current hour and raises `PATIENT_RATE_LIMIT` when it passes `patient_direct_insert_per_hour`. This keeps single adds working at normal clinic speed and stops a scripted loop.

## Client changes

- `src/hooks/usePatientImportAccess.ts`: calls `get_patient_import_access`, refreshes when the Patients page opens and after an import or request.
- `PatientsPage`: the Import button stays visible to anyone with `patients.add`. It opens the dialog in one of these states, driven by the hook:
  - **Not eligible:** a message "Importing patients is available on Pro and Premium" with a button to the existing plan/upgrade page. Reason `blocked` shows "Import is turned off for your clinic. Contact support." Reason `no_permission` is unchanged (button hidden).
  - **Eligible:** the existing choose-file, preview and import flow, plus the line "You can import up to N more patients (cap C)".
  - **File over the remaining room:** the preview shows "This file adds Y patients but your limit allows X more" and a **Request a higher limit** form (number and reason). When a request is pending it shows its status instead. During the 7-day wait it says when the clinic can ask again.
- `patientImport.ts` (`importPatients`): sends the validated rows to `import_patients` in one call and maps the answer to the existing `ImportResult` shape, with the new errors (`CAP_EXCEEDED`, `DAILY_LIMIT`, `NOT_ELIGIBLE`) turned into plain messages. The client-side chunking and row-by-row retry are removed, because the server now does the work in one transaction.
- `src/components/superadmin/SAImportRequests.tsx`: a second tab on the existing Plan Requests page (`SAPlanRequests`), gated by `plan_requests.view` and `plan_requests.manage`. It lists pending requests (clinic, plan, current patients, requested number, reason), Approve (cap field, prefilled with the request, limited to the ceiling) and Decline (note required). It also shows recent decisions.
- Superadmin override: a small "Patient import" card on the existing doctor detail page (`SADoctorDetail`) shows the clinic's effective access and lets an authorised superadmin set Allowed or Blocked (reason required, optional end date) or clear it.

## Edge cases

| Case | Behaviour |
|---|---|
| Plan lapses or is downgraded after approval | Eligibility is rechecked on every import. Existing patients stay. The approved cap is kept and applies again on renewal. |
| Trial turns into a paid plan | Import works at once, since the server decides and the UI re-reads on open. |
| Two imports at once (two tabs, doctor plus staff) | The per-clinic lock runs them one after the other; the second sees the updated count. |
| Duplicates | Do not count toward the cap and are reported as skipped. |
| Clinic already larger than the cap | Nothing is deleted. New imports are refused until the cap is raised. Bookings and manual adds continue. |
| Oversized or malformed payload, over-long fields | The whole call is rejected with a clear code; nothing is written. |
| Staff with a leaked login | Bound by the same limits and by `patients.add`. The clinic comes from the logged-in user. |
| Calling the API directly in a loop | Single inserts hit the hourly guard; bulk goes through `import_patients` and its limits. |
| Request spam | One open request per clinic, a wait after a decline, and a requested number that must be above the current cap and under the ceiling. |
| Superadmin approves an absurd number | Server refuses anything above the ceiling. |
| Doctor with a superadmin override set to blocked | Refused on every import even on Premium. An override with an end date returns to the plan rule when it ends. A doctor cannot change their own override, because the table has no client write access. |
| Request approved, then the clinic downgrades to free | Not eligible until a paid plan returns. |
| Demo and existing tests | The dialog tests are updated for the new function call; the CSV parsing tests do not change. |

## Testing

- Unit tests (Vitest): `usePatientImportAccess`, the new `importPatients` mapping and error messages, the dialog states (not eligible, eligible, over the room, request pending, cooldown), the request form validation, and `SAImportRequests` (list, approve, decline needs a note, permission gating).
- Database behaviour is checked after applying the migration with a small set of scripted calls against a throw-away test clinic: not eligible, cap exceeded, daily limit, duplicates not counted, payload too large, staff without `patients.add`, direct-insert guard trips at the limit while bookings and imports do not, approval raises the cap, decline cooldown, one pending request. The repository has no local database test harness (the `tests/db` folder mentioned in CLAUDE.md is absent), so these are run by hand and written up in the pull request.
- Manual: import `demo-patients-import.csv` on a Pro clinic (works), on a trial clinic (blocked), and a file larger than the cap (request form).

## Rollout

Phase 1 (database limits and plan gate): migrations for all tables and settings, `import_patients`, the guard and the access function; client switch to the new function with not-eligible and cap messages. After this the abuse path is closed.
Phase 2 (request, approval and override): the request and review functions and the override function, the request form in the dialog, the superadmin tab and the override card, notifications.

Phase 1 alone is safe to release: a clinic over the cap sees the limit message with a "contact support" line until Phase 2 adds the request form. Each phase has its own migration, applied in order.

## Documentation

Update the CLAUDE.md patient import bullet with: Pro/Premium only, the cap and daily limits, `import_patients` as the only bulk path, the direct-insert guard, and the request/approval flow.
