# Doctor Delete — Password Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the superadmin's own password before `delete-doctor-account` deletes anything, verified server-side so it can't be bypassed by calling the edge function directly with just a session token.

**Architecture:** `delete-doctor-account` gains a required `password` field, verified once per request via `signInWithPassword` against the caller's own email (from the JWT already being decoded for the admin-role check) before any doctor data is read or touched. `BulkDeleteDoctorsDialog.tsx` adds a password input, sends it with every delete request, and on a `401` clears the field and shows a specific "Incorrect password" message without closing the dialog.

**Tech Stack:** Deno edge function (existing `supabase.auth.signInWithPassword`), React + shadcn `Input`/`Label` (already used in this dialog for the typed-count field), Vitest + Testing Library.

## Global Constraints

- Password required for every deletion, regardless of batch size (1 doctor or many).
- The existing typed-count confirmation for batches of 10+ is unchanged and additive — password is a separate, always-present requirement.
- No retry-limit/lockout on wrong password — this is an already-authenticated superadmin session.
- No new UI primitives — reuse `Input`/`Label` from `@/components/ui/*`, already imported in this file.
- Edge functions in this repo have no automated test framework (confirmed: no `.test.` files under `supabase/functions/`) — verification is via direct `curl` calls against the deployed function, matching how every other edge function in this project has been verified.

---

### Task 1: Require and verify password in `delete-doctor-account`

**Files:**
- Modify: `supabase/functions/delete-doctor-account/index.ts`

**Interfaces:**
- Consumes: existing `claims` variable in this function (from `scoped.auth.getClaims(...)`), which already exposes `claims?.claims?.sub` for `callerId` — this task additionally reads `claims?.claims?.email`.
- Produces: request body now requires `{ doctor_ids: string[], password: string }` (previously just `doctor_ids`). New failure responses: `400 { error: "password is required" }` when `password` is missing/empty; `401 { error: "Incorrect password" }` when verification fails.

- [ ] **Step 1: Locate the current request-body validation block**

In `supabase/functions/delete-doctor-account/index.ts`, find:

```ts
  let doctor_ids: unknown;
  try {
    ({ doctor_ids } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!Array.isArray(doctor_ids) || doctor_ids.length === 0 || !doctor_ids.every((id) => typeof id === "string")) {
    return json(400, { error: "doctor_ids must be a non-empty array of strings" });
  }

  const deleted: string[] = [];
```

- [ ] **Step 2: Replace it with password extraction, validation, and server-side verification**

```ts
  let doctor_ids: unknown;
  let password: unknown;
  try {
    ({ doctor_ids, password } = await req.json());
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (!Array.isArray(doctor_ids) || doctor_ids.length === 0 || !doctor_ids.every((id) => typeof id === "string")) {
    return json(400, { error: "doctor_ids must be a non-empty array of strings" });
  }
  if (typeof password !== "string" || password.length === 0) {
    return json(400, { error: "password is required" });
  }

  // Step-up re-authentication: checking the password only in the browser
  // dialog would be cosmetic, since this function is reachable directly
  // with just a valid session token (no password needed) — verifying here,
  // before any doctor data is read or touched, is what makes it a real
  // control. One check covers the whole batch, not one per doctor.
  const callerEmail = claims?.claims?.email as string | undefined;
  if (!callerEmail) return json(401, { error: "Invalid token" });
  const { error: passwordError } = await scoped.auth.signInWithPassword({ email: callerEmail, password });
  if (passwordError) return json(401, { error: "Incorrect password" });

  const deleted: string[] = [];
```

- [ ] **Step 3: Deploy the updated function**

Deploy `delete-doctor-account` (entrypoint `delete-doctor-account/index.ts`, `verify_jwt: true`, same as its current deployment) together with its unchanged `_shared/paymentMode.ts` dependency, to project `atmelijhxsjzjixhdfcu`.

- [ ] **Step 4: Verify the password check rejects a wrong password and touches nothing**

Mint a test session for the superadmin account (`jeevijayit@gmail.com`) via the `create-e2e-session` function (already deployed, used earlier this session for the same purpose), then:

```bash
TOKEN="<access_token from create-e2e-session>"
ANON="<project anon key>"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST \
  "https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/delete-doctor-account" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"doctor_ids": ["<any real doctor id>"], "password": "definitely-wrong-password"}'
```

Expected: `HTTP_STATUS:401`, body `{"error":"Incorrect password"}`. Confirm via SQL that the target doctor's `profiles`/`auth.users` rows are unchanged (nothing was deleted).

- [ ] **Step 5: Verify the correct password still allows deletion**

Using an E2E test doctor row (`full_name = 'E2E Test Doctor'`, disposable seed data — see [[2026-08-11-fix-delete-doctor-database-error]] for why these are safe to delete) and the real password for `jeevijayit@gmail.com`:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST \
  "https://atmelijhxsjzjixhdfcu.supabase.co/functions/v1/delete-doctor-account" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"doctor_ids": ["<e2e test doctor id>"], "password": "<correct password>"}'
```

Expected: `HTTP_STATUS:200`, `{"ok":true,"deleted":["<id>"],"failed":[]}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/delete-doctor-account/index.ts
git commit -m "feat: require and verify the superadmin's password before deleting a doctor"
```

---

### Task 2: Password field in `BulkDeleteDoctorsDialog.tsx`

**Files:**
- Modify: `src/components/superadmin/BulkDeleteDoctorsDialog.tsx`
- Test: `src/components/superadmin/BulkDeleteDoctorsDialog.test.tsx`

**Interfaces:**
- Consumes: `delete-doctor-account` now requires `password` in its request body (Task 1) and returns `401` with `{ error: "Incorrect password" }` on a wrong password; a `401` is distinguishable client-side via `(error as { context?: Response })?.context?.status === 401` — the same `error.context` shape `@/lib/edgeFunctionError.ts`'s `edgeFunctionErrorMessage` already reads.
- No other component imports `BulkDeleteDoctorsDialog`'s internals beyond its existing `{ targets, onClose, onDeleted }` props (unchanged).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/superadmin/BulkDeleteDoctorsDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn() }));

const targets = [{ id: "doc-1", full_name: "Dr. Test" }];

describe("BulkDeleteDoctorsDialog", () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok" } },
    } as any);
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it("disables Delete Selected until a password is entered", () => {
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole("button", { name: /delete selected/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret" } });
    expect(screen.getByRole("button", { name: /delete selected/i })).not.toBeDisabled();
  });

  it("sends the entered password with the delete request", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, deleted: ["doc-1"], failed: [] },
      error: null,
    } as any);
    const onDeleted = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "delete-doctor-account",
      expect.objectContaining({ body: { doctor_ids: ["doc-1"], password: "correct-horse" } })
    );
  });

  it("on a 401, clears the password field and keeps the dialog open", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { context: { status: 401, json: async () => ({ error: "Incorrect password" }) } },
    } as any);
    const onClose = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={onClose} onDeleted={vi.fn()} />);
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(passwordInput.value).toBe(""));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/superadmin/BulkDeleteDoctorsDialog.test.tsx`
Expected: FAIL — no password field exists yet (`getByLabelText(/password/i)` finds nothing), and the current request body has no `password` key.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/components/superadmin/BulkDeleteDoctorsDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Target = { id: string; full_name: string | null };

// Shared by SADoctors.tsx and SASubscriptions.tsx so the bulk "Delete
// Selected" confirmation + edge-function call exists in exactly one place.
// Deleting a doctor cascades across ~20 tables (patients, appointments,
// staff, billing history, etc.) via profiles(id) ON DELETE CASCADE, so
// batches of 10+ require typing the exact count to confirm — the same
// safety bar already used for bulk-deleting 10+ prescriptions at once in
// PrescriptionsPage.tsx, reused verbatim here rather than inventing a new rule.
//
// The password field is a separate, always-present safeguard (any batch
// size) — delete-doctor-account verifies it server-side before touching
// any data, so this isn't just a UI gate (see that function's comment).
const BulkDeleteDoctorsDialog = ({ targets, onClose, onDeleted }: {
  targets: Target[]; onClose: () => void; onDeleted: () => void;
}) => {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const count = targets.length;
  const needsTypedConfirm = count >= 10;

  useEffect(() => { setConfirmText(""); setPassword(""); }, [targets]);

  const confirmDelete = async () => {
    if (count === 0 || !password) return;
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("delete-doctor-account", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { doctor_ids: targets.map((t) => t.id), password },
    });
    setDeleting(false);
    if (error || !data?.ok) {
      const message = await edgeFunctionErrorMessage(error, "Could not delete selected doctors");
      toast.error(message);
      const isIncorrectPassword = (error as { context?: Response })?.context?.status === 401;
      if (isIncorrectPassword) {
        setPassword("");
        passwordRef.current?.focus();
      }
      return;
    }
    const deleted: string[] = data.deleted || [];
    const failed: { id: string; error: string }[] = data.failed || [];
    await logAdminAction("bulk_delete_doctors", "profiles", undefined, {
      ids: targets.map((t) => t.id), deleted, failed,
    });
    if (failed.length === 0) {
      toast.success(`${deleted.length} doctor${deleted.length === 1 ? "" : "s"} deleted`);
    } else {
      toast.error(`${deleted.length} of ${count} doctors deleted`, {
        description: `${failed.length} failed: ${failed[0].error}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ""}`,
      });
    }
    onClose();
    onDeleted();
  };

  return (
    <AlertDialog open={count > 0} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {count} selected doctor{count === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes each selected doctor's login, profile, patients, appointments,
            prescriptions, staff accounts, and all billing/payment history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-delete-password" className="text-xs">
            Enter your password to confirm:
          </Label>
          <Input
            id="bulk-delete-password"
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="h-10"
            autoFocus
          />
        </div>
        {needsTypedConfirm && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              To confirm, type <span className="font-mono font-semibold">{count}</span> below:
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={String(count)}
              className="h-10"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting || !password || (needsTypedConfirm && confirmText.trim() !== String(count))}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
            onClick={(e) => { e.preventDefault(); confirmDelete(); }}
          >
            {deleting ? "Deleting..." : "Delete Selected"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BulkDeleteDoctorsDialog;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/superadmin/BulkDeleteDoctorsDialog.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npx vitest run`
Expected: All tests pass (the pre-existing `BlogPage.test.tsx`/`PrescriptionSlip.test.tsx` failures are unrelated — see [[2026-08-11-superadmin-billing-subscription-revenue-design]] session notes; don't investigate them as part of this task).

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/superadmin/BulkDeleteDoctorsDialog.tsx src/components/superadmin/BulkDeleteDoctorsDialog.test.tsx
git commit -m "feat: require a password in the doctor bulk-delete confirmation dialog"
```

---
