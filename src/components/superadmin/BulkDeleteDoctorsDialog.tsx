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
