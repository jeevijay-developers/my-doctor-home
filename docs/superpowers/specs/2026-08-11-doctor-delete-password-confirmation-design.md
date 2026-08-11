# Doctor Delete — Password Confirmation — Design

## Problem

Deleting a doctor account is destructive and irreversible — it cascades across login, profile, patients, appointments, prescriptions, staff accounts, and billing history (`delete-doctor-account`, see [[2026-08-11-fix-delete-doctor-database-error]] for the recent fix to that flow). Today the only safeguard is a confirmation dialog (`BulkDeleteDoctorsDialog.tsx`), plus a typed-count check for batches of 10+. There's no re-authentication step — anyone with an active superadmin browser session can delete a doctor with a couple of clicks.

## Goal

Require the superadmin's password before any doctor deletion completes, for batches of any size, verified in a way that can't be bypassed by calling the edge function directly (confirmed possible during this session's testing — a valid session token alone is enough to invoke `delete-doctor-account` via a raw HTTP call).

## Non-goals

- No retry-limit/lockout on wrong password — this is an already-authenticated superadmin session, not a public login form; a wrong-password toast and staying on the dialog is enough.
- No change to the existing typed-count confirmation for 10+ batches — the password requirement is additive, not a replacement.
- No new UI pattern — reuses the existing `Input`/`Label` primitives already used for the typed-count field in the same dialog.

## Architecture

**`delete-doctor-account/index.ts`** — request body gains a required `password: string` alongside the existing `doctor_ids: string[]`. After the existing `has_role(admin)` check and before any `profiles`/`auth.users` read for the target doctors, the function:
1. Resolves the caller's own email from the JWT claims already extracted for `callerId` (`claims.claims.email`).
2. Calls `scoped.auth.signInWithPassword({ email, password })` using the anon-key client already created in the function (the same one used for `getClaims`) — this is the same verification GoTrue's normal login uses, run once for the whole request, not per doctor.
3. On failure, returns `401 { error: "Incorrect password" }` immediately — no `profiles`/`auth.users` reads happen, nothing is deleted, the whole batch is rejected together.
4. On success, the existing per-doctor deletion loop runs unchanged (including the `admin_delete_auth_user` fallback and the `admin_audit_log` SET NULL behavior already in place).

Calling `signInWithPassword` server-side creates a new session on GoTrue's side that this function never uses or returns — it's discarded immediately after checking the call succeeded, and has no effect on the caller's actual browser session.

**`BulkDeleteDoctorsDialog.tsx`**:
- New `password` state, bound to a `<Input type="password">`, always rendered (not gated behind the 10+ threshold like the count field).
- `confirmDelete()` includes `password` in the request body sent to `delete-doctor-account`.
- "Delete Selected" stays disabled until `password` is non-empty (and, for 10+ batches, until the typed count still matches — unchanged).
- On a `401` specifically (distinguished from other failures by response status, not by parsing the error string), the dialog: clears the password field, refocuses it, shows a toast reading exactly "Incorrect password" and stays open — no `onClose()`/`onDeleted()` call, so the selection isn't lost and the admin can just retype and retry.
- Any other failure (existing per-doctor `failed` array, network error, etc.) behaves exactly as it does today.

## Data flow

Admin selects doctors → clicks Delete Selected → dialog opens → admin types password (+ count, if 10+) → `confirmDelete()` → `delete-doctor-account` with `{ doctor_ids, password }` → edge function verifies password first → only then processes the batch → response parsed exactly as before for the deleted/failed summary toast.

## Error handling

- Wrong password: `401`, nothing touched, dialog stays open with a clear, specific message — distinct from "N of M doctors deleted" partial-failure messaging, since no deletion was even attempted.
- Missing/empty password in the request body: `400 { error: "password is required" }` (mirrors the existing `doctor_ids` validation style in the same function).
- Everything else (doctor not found, GoTrue delete failure + SQL fallback failure, `admin_audit_log` FK, etc.): unchanged from the current implementation.

## Testing

- Edge function: a request with a wrong password returns `401` and performs zero deletions (verify no `profiles`/`appointments` rows touched).
- Edge function: a request with the correct password behaves identically to today's (already-tested) flow.
- Frontend: dialog disables "Delete Selected" with an empty password field; a `401` response clears the password field and keeps the dialog open with the selection intact; a successful response behaves as today.
