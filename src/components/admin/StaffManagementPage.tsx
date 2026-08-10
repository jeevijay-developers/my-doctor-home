import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  UserCog, Plus, Pencil, KeyRound, Ban, CheckCircle2, Trash2, ShieldCheck, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PERMISSION_MODULES, type PermissionKey, type Permissions } from "@/lib/staffPermissions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import LockedFeatureCard from "./LockedFeatureCard";

type StaffRow = {
  id: string; staff_name: string; username: string; status: string;
  permissions: Permissions; created_at: string; last_login_at: string | null;
};

const emptyPermissions: Permissions = {};
const emptyForm = { staff_name: "", username: "", password: "", confirm_password: "", status: "active" as "active" | "inactive" };

const StaffManagementPage = () => {
  const { profile, isStaff, can } = useProfile();
  const { isPremium, loading: planLoading } = usePlanAccess();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [permissions, setPermissions] = useState<Permissions>(emptyPermissions);
  const [saving, setSaving] = useState(false);

  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleting, setDeleting] = useState<StaffRow | null>(null);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from("staff_members").select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false });
    setStaff((data || []) as unknown as StaffRow[]);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [profile]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPermissions({});
    setDialogOpen(true);
  };

  const openEdit = (s: StaffRow) => {
    setEditingId(s.id);
    setForm({ staff_name: s.staff_name, username: s.username, password: "", confirm_password: "", status: s.status as "active" | "inactive" });
    setPermissions(s.permissions || {});
    setDialogOpen(true);
  };

  const togglePermission = (key: PermissionKey) => setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    if (!form.staff_name.trim()) { toast.error("Staff name is required"); return; }
    if (!form.username.trim()) { toast.error("Login ID / Username is required"); return; }

    if (editingId) {
      setSaving(true);
      const { error } = await supabase.from("staff_members").update({
        staff_name: form.staff_name.trim(),
        username: form.username.trim(),
        permissions,
      }).eq("id", editingId);
      setSaving(false);
      if (error) { toast.error("Could not save changes"); return; }
      toast.success("Staff account updated");
      setDialogOpen(false);
      load();
      return;
    }

    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (form.password !== form.confirm_password) { toast.error("Passwords do not match"); return; }

    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("create-staff-account", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { staff_name: form.staff_name.trim(), username: form.username.trim(), password: form.password, status: form.status, permissions },
    });
    setSaving(false);
    if (error) {
      // Never logs the password — only the error object supabase-js gives back.
      console.error("create-staff-account failed:", error);
      toast.error(await edgeFunctionErrorMessage(error, "Could not create staff account. Check the browser console for details."));
      return;
    }
    toast.success("Staff account created successfully.");
    setDialogOpen(false);
    load();
  };

  const toggleStatus = async (s: StaffRow) => {
    const nextStatus = s.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("staff_members").update({ status: nextStatus }).eq("id", s.id);
    if (error) { toast.error("Could not update status"); return; }
    toast.success(nextStatus === "active" ? "Staff account activated" : "Staff account deactivated");
    load();
  };

  const submitReset = async () => {
    if (!resetting) return;
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("reset-staff-password", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { staff_id: resetting.id, new_password: newPassword },
    });
    if (error) { toast.error(await edgeFunctionErrorMessage(error, "Could not reset password")); return; }
    toast.success("Password reset");
    setResetting(null);
    setNewPassword("");
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("delete-staff-account", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { staff_id: deleting.id },
    });
    if (error) { toast.error(await edgeFunctionErrorMessage(error, "Could not delete staff account")); return; }
    toast.success("Staff account deleted");
    setDeleting(null);
    load();
  };

  const grantedCount = (p: Permissions) => Object.values(p || {}).filter(Boolean).length;

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-royal" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="max-w-6xl mx-auto">
        <LockedFeatureCard
          featureName="Staff Management"
          description="Add clinic staff accounts and control exactly what each one can see and do. Available on Premium."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <UserCog className="h-6 w-6 text-royal" /> Staff Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {staff.length} staff account{staff.length === 1 ? "" : "s"} · control exactly what each staff member can access
          </p>
        </div>
        {/* Always visible — this page itself is already permission-gated
            (staff.view) at the route level, and the doctor's own account
            must never be restricted by the staff permission system. The
            actual create action is still authorized server-side (RLS +
            create-staff-account's own checks), so a staff session without
            staff.create still can't succeed even though the button shows. */}
        <Button className="bg-royal hover:bg-royal/90" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : staff.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <UserCog className="h-12 w-12 text-royal/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No staff accounts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add a staff account and choose exactly what they can see and do</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 border-b border-border">
                <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-3">Staff Name</th>
                  <th className="px-4 py-3">Login ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Permissions</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                          {s.staff_name?.charAt(0)?.toUpperCase() || "S"}
                        </div>
                        <span className="font-semibold text-foreground">{s.staff_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{s.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={`text-[10px] ${s.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
                        {s.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                        <ShieldCheck className="h-3 w-3" /> {grantedCount(s.permissions)} permission{grantedCount(s.permissions) === 1 ? "" : "s"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {can("staff.edit") && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(s)} aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can("staff.edit") && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setResetting(s); setNewPassword(""); }} aria-label="Reset Password">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can("staff.disable") && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleStatus(s)} aria-label={s.status === "active" ? "Deactivate" : "Activate"}>
                            {s.status === "active" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        {!isStaff && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleting(s)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Staff */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Staff" : "Add Staff"}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Staff Name *</Label>
                <Input value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Staff Login ID / Username *</Label>
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. reception1" className="h-10" />
              </div>
              {!editingId && (
                <>
                  <div className="space-y-1.5">
                    <Label>Password *</Label>
                    <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirm Password *</Label>
                    <PasswordInput value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} className="h-10" />
                  </div>
                </>
              )}
            </div>

            <div>
              <h3 className="font-heading font-semibold text-sm text-foreground mb-1">Permissions</h3>
              <p className="text-xs text-muted-foreground mb-3">Only checked items will be accessible to this staff member — everything else stays hidden and blocked.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PERMISSION_MODULES.map((mod) => (
                  <Card key={mod.key} className="border-border/60 shadow-none">
                    <CardContent className="p-3.5">
                      <div className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">{mod.label}</div>
                      <div className="space-y-2">
                        {mod.permissions.map((p) => (
                          <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={!!permissions[p.key]} onCheckedChange={() => togglePermission(p.key)} />
                            <span className="text-foreground">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="w-full h-10 bg-royal hover:bg-royal/90">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Staff"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password — {resetting?.staff_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-10" />
            </div>
            <Button onClick={submitReset} className="w-full h-10 bg-royal hover:bg-royal/90">Reset Password</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete staff account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleting?.staff_name}</strong>'s login and access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StaffManagementPage;
