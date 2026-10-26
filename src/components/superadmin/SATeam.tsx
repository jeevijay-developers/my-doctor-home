import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Ban, CheckCircle2, Trash2, ShieldCheck, UserCog, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { normalizePhoneNumber } from "@/lib/auth/otp/productionOtpService";
import {
  SA_PERMISSION_MODULES, SA_PERMISSION_PRESETS, type SAPermissionKey, type SAPermissions,
} from "@/lib/superadminPermissions";

type MemberRow = {
  id: string; name: string; phone: string; status: string;
  permissions: SAPermissions; created_at: string; last_login_at: string | null;
};
type OwnerRow = { id: string; user_id: string; profiles: { full_name: string | null } | null };

const emptyForm = { name: "", phone: "", confirm_phone: "", status: "active" as "active" | "inactive" };
const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
// Only the last 4 digits are shown in the roster, e.g. "+91 ••••• ••3210".
const maskPhone = (p: string) => (p ? `${p.slice(0, 3)} ••••• ••${p.slice(-4)}` : "—");
const grantedCount = (p: SAPermissions) => Object.values(p || {}).filter(Boolean).length;

// Owner-only page (the route is gated with a null permission).
const SATeam = () => {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [permissions, setPermissions] = useState<SAPermissions>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MemberRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: m }, { data: o }] = await Promise.all([
      supabase.from("superadmin_team_members").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("id, user_id, profiles:user_id(full_name)").eq("role", "admin"),
    ]);
    setMembers((m || []) as unknown as MemberRow[]);
    setOwners((o || []) as unknown as OwnerRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPermissions({});
    setDialogOpen(true);
  };

  const openEdit = (m: MemberRow) => {
    setEditingId(m.id);
    setForm({ name: m.name, phone: m.phone, confirm_phone: m.phone, status: m.status as "active" | "inactive" });
    setPermissions(m.permissions || {});
    setDialogOpen(true);
  };

  const togglePermission = (key: SAPermissionKey) => setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  const applyPreset = (keys: SAPermissionKey[]) => setPermissions(Object.fromEntries(keys.map((k) => [k, true])));

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const phone = normalizePhoneNumber(form.phone);
    if (!PHONE_REGEX.test(phone)) { toast.error("Enter a valid phone number, e.g. +919876543210"); return; }
    if (phone !== normalizePhoneNumber(form.confirm_phone)) { toast.error("Phone numbers do not match"); return; }

    const { data: { session } } = await supabase.auth.getSession();
    const headers = { Authorization: `Bearer ${session?.access_token}` };
    setSaving(true);

    if (editingId) {
      const current = members.find((m) => m.id === editingId);
      const { error } = await supabase.from("superadmin_team_members")
        .update({ name: form.name.trim(), permissions })
        .eq("id", editingId);
      if (error) { setSaving(false); toast.error("Could not save changes"); return; }
      await logAdminAction("update_team_member", "superadmin_team_members", editingId, { permissions });
      if (current && current.phone !== phone) {
        const { error: phoneError } = await supabase.functions.invoke("update-team-member-phone", {
          headers, body: { member_id: editingId, phone },
        });
        if (phoneError) {
          setSaving(false);
          toast.error(await edgeFunctionErrorMessage(phoneError, "Could not change phone number"));
          load();
          return;
        }
      }
      setSaving(false);
      toast.success("Team member updated");
      setDialogOpen(false);
      load();
      return;
    }

    const { error } = await supabase.functions.invoke("create-team-member", {
      headers, body: { name: form.name.trim(), phone, status: form.status, permissions },
    });
    setSaving(false);
    if (error) {
      toast.error(await edgeFunctionErrorMessage(error, "Could not create team member"));
      return;
    }
    toast.success("Team member created. They can now log in with their phone number.");
    setDialogOpen(false);
    load();
  };

  const toggleStatus = async (m: MemberRow) => {
    const next = m.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("superadmin_team_members").update({ status: next }).eq("id", m.id);
    if (error) { toast.error("Could not update status"); return; }
    await logAdminAction(next === "active" ? "activate_team_member" : "deactivate_team_member", "superadmin_team_members", m.id);
    toast.success(next === "active" ? "Team member activated" : "Team member deactivated");
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("delete-team-member", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { member_id: deleting.id },
    });
    if (error) { toast.error(await edgeFunctionErrorMessage(error, "Could not delete team member")); return; }
    toast.success("Team member deleted");
    setDeleting(null);
    load();
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <Badge variant="secondary" className={`text-[10px] ${status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );

  const Actions = ({ m, size }: { m: MemberRow; size: string }) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className={size} onClick={() => openEdit(m)} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" className={size} onClick={() => toggleStatus(m)} aria-label={m.status === "active" ? "Deactivate" : "Activate"}>
        {m.status === "active" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </Button>
      <Button variant="ghost" size="sm" className={`${size} text-destructive hover:text-destructive`} onClick={() => setDeleting(m)} aria-label="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-xl text-primary flex items-center gap-2">
            <UserCog className="h-5 w-5 text-royal" /> Team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} team member{members.length === 1 ? "" : "s"} · they log in from the main login page with their phone number
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Team Member</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : members.length === 0 ? (
        <Card><CardContent className="py-14 text-center">
          <UserCog className="h-10 w-10 text-royal/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No team members yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add someone and choose exactly which sections they can use</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Table — tablet/desktop */}
          <Card className="hidden md:block overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Name</th><th className="text-left p-3">Phone</th>
                    <th className="text-left p-3">Status</th><th className="text-left p-3">Permissions</th>
                    <th className="text-left p-3">Last login</th><th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className="p-3">{maskPhone(m.phone)}</td>
                      <td className="p-3"><StatusBadge status={m.status} /></td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                          <ShieldCheck className="h-3 w-3" /> {grantedCount(m.permissions)} permission{grantedCount(m.permissions) === 1 ? "" : "s"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{m.last_login_at ? new Date(m.last_login_at).toLocaleString() : "Never"}</td>
                      <td className="p-3"><Actions m={m} size="h-7 w-7 p-0" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-2">
            {members.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{maskPhone(m.phone)}</div>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                    <ShieldCheck className="h-3 w-3" /> {grantedCount(m.permissions)} permission{grantedCount(m.permissions) === 1 ? "" : "s"}
                  </Badge>
                  <div className="pt-1 border-t border-border"><Actions m={m} size="h-8 w-8 p-0" /></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Owners — read-only. Owners have full access and are managed outside this page. */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-royal" /> Owners</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {owners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No owners found.</p>
          ) : owners.map((o) => (
            <div key={o.id} className="flex items-center justify-between text-sm">
              <span className="font-medium">{o.profiles?.full_name || `Owner ${o.user_id.slice(0, 8)}…`}</span>
              <Badge variant="secondary" className="text-[10px]">Full access</Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">Owners always have every permission and cannot be restricted or removed from here.</p>
        </CardContent>
      </Card>

      {/* Add / Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Team Member" : "Add Team Member"}</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Number *</Label>
                <FormattedPhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className="h-10" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Confirm Phone Number *</Label>
                <FormattedPhoneInput value={form.confirm_phone} onChange={(e) => setForm({ ...form, confirm_phone: e.target.value })} placeholder="Re-enter the number" className="h-10" />
                <p className="text-xs text-muted-foreground">They log in at Doctylia's login page with this number and a one-time code. Double-check it — anyone holding this number gets this access. A number already registered as a doctor can't be used.</p>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h3 className="font-heading font-semibold text-sm text-foreground">Permissions</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Presets:</span>
                  {SA_PERMISSION_PRESETS.map((p) => (
                    <Button key={p.label} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(p.permissions)}>{p.label}</Button>
                  ))}
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPermissions({})}>Clear</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Only checked items are accessible — everything else stays hidden and blocked. Managing the team itself is always owner-only.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SA_PERMISSION_MODULES.map((mod) => (
                  <Card key={mod.key} className="shadow-none">
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
          </div>
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-1 bg-background border-t border-border">
            <Button onClick={save} disabled={saving} className="w-full h-10">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Team Member"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleting?.name}</strong>'s login and access. Their past audit-log entries are kept. This cannot be undone.
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

export default SATeam;
