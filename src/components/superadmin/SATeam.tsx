import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const SATeam = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [me, setMe] = useState<string>("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("id, role, user_id, profiles:user_id(full_name)")
      .in("role", ["admin", "staff"]);
    setRows(data ?? []);
  };
  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? ""));
  }, []);

  const invite = async () => {
    if (!email) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-team-member", { body: { email, role } });
    setBusy(false);
    if (error || !data?.ok) return toast({ title: "Failed", description: error?.message || data?.error, variant: "destructive" });
    await logAdminAction("invite_team_member", "user_roles", data.user_id, { email, role });
    toast({ title: "Invite sent" });
    setEmail("");
    load();
  };

  const changeRole = async (id: string, userId: string, next: "admin" | "staff", prev: string) => {
    const { error } = await supabase.from("user_roles").update({ role: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("change_team_role", "user_roles", userId, { from: prev, to: next });
    toast({ title: "Role changed" });
    load();
  };

  const remove = async (id: string, userId: string, r: string) => {
    if (userId === me && r === "admin") return toast({ title: "Cannot remove your own admin role", variant: "destructive" });
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("remove_team_member", "user_roles", userId, { role: r });
    toast({ title: "Access removed" });
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Invite team member</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <Input type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="md:max-w-sm" />
          <Select value={role} onValueChange={(v: any) => setRole(v)}>
            <SelectTrigger className="md:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={!email || busy}>{busy ? "Inviting…" : "Send invite"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">User ID</th><th className="text-left p-3">Role</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.profiles?.full_name || "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{r.user_id?.slice(0, 8)}…</td>
                  <td className="p-3">
                    <Select value={r.role} onValueChange={(v: any) => changeRole(r.id, r.user_id, v, r.role)} disabled={r.user_id === me}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="destructive" disabled={r.user_id === me && r.role === "admin"} onClick={() => remove(r.id, r.user_id, r.role)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No team members.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Your own admin role is protected from accidental removal.</p>
    </div>
  );
};

export default SATeam;
