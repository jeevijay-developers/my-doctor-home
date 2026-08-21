import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { KeyRound, Loader2 } from "lucide-react";

type FeatureAccessRow = {
  feature_key: string;
  label: string;
  description: string;
  default_min_tier: string;
  included_by_plan: boolean;
  override_enabled: boolean | null;
  override_granted_by: string | null;
  override_granted_at: string | null;
  override_reason: string | null;
  override_expires_at: string | null;
  override_active: boolean;
  effective_enabled: boolean;
};

// "default" = no override row (follow the plan), "on"/"off" = force an
// override row with that enabled value. Mirrors doctor_feature_overrides
// exactly — there's no fourth state.
type ChoiceValue = "default" | "on" | "off";

const choiceFor = (row: FeatureAccessRow): ChoiceValue => {
  if (!row.override_active) return "default";
  return row.override_enabled ? "on" : "off";
};

const SAFeatureAccess = ({ doctorId }: { doctorId: string }) => {
  const [rows, setRows] = useState<FeatureAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { choice: ChoiceValue; reason: string; expiresAt: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_doctor_feature_access", { _doctor_id: doctorId });
    if (error) {
      toast({ title: "Failed to load feature access", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const loaded = (data as FeatureAccessRow[]) || [];
    setRows(loaded);
    setDrafts(
      Object.fromEntries(
        loaded.map((r) => [
          r.feature_key,
          {
            choice: choiceFor(r),
            reason: r.override_reason || "",
            expiresAt: r.override_expires_at ? r.override_expires_at.slice(0, 10) : "",
          },
        ])
      )
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const setDraft = (key: string, patch: Partial<{ choice: ChoiceValue; reason: string; expiresAt: string }>) => {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  };

  const save = async (row: FeatureAccessRow) => {
    const draft = drafts[row.feature_key];
    if (!draft) return;
    setSavingKey(row.feature_key);

    if (draft.choice === "default") {
      const { error } = await supabase
        .from("doctor_feature_overrides")
        .delete()
        .eq("doctor_id", doctorId)
        .eq("feature_key", row.feature_key);
      if (error) {
        toast({ title: "Failed to reset to plan default", description: error.message, variant: "destructive" });
        setSavingKey(null);
        return;
      }
      await logAdminAction("remove_feature_override", "doctor_feature_overrides", doctorId, { feature_key: row.feature_key });
      toast({ title: `${row.label} reverted to plan default` });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const enabled = draft.choice === "on";
      const { error } = await supabase.from("doctor_feature_overrides").upsert(
        {
          doctor_id: doctorId,
          feature_key: row.feature_key,
          enabled,
          granted_by: user?.id,
          reason: draft.reason.trim() || null,
          expires_at: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        },
        { onConflict: "doctor_id,feature_key" }
      );
      if (error) {
        toast({ title: "Failed to save override", description: error.message, variant: "destructive" });
        setSavingKey(null);
        return;
      }
      await logAdminAction("set_feature_override", "doctor_feature_overrides", doctorId, {
        feature_key: row.feature_key,
        enabled,
        reason: draft.reason.trim() || undefined,
        expires_at: draft.expiresAt || undefined,
      });
      toast({ title: `${row.label} ${enabled ? "unlocked" : "disabled"} for this doctor` });
    }

    setSavingKey(null);
    load();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Feature Access</CardTitle></CardHeader>
        <CardContent className="py-8 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-royal" /> Feature Access
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Override what this doctor's plan includes, per feature — without changing their plan or billing.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const draft = drafts[row.feature_key];
          if (!draft) return null;
          const dirty =
            draft.choice !== choiceFor(row) ||
            (row.override_active && draft.reason !== (row.override_reason || "")) ||
            (row.override_active && draft.expiresAt !== (row.override_expires_at ? row.override_expires_at.slice(0, 10) : ""));
          return (
            <div key={row.feature_key} className="rounded-xl border border-border p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{row.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {row.included_by_plan ? `Included in ${row.default_min_tier}` : `Not in ${row.default_min_tier === "premium" ? "Pro" : "current"} plan`}
                    </Badge>
                    {row.override_active && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/15">
                        Overridden
                      </Badge>
                    )}
                    <Badge
                      className={`text-[10px] ${row.effective_enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} border-0 hover:bg-transparent`}
                    >
                      Effective: {row.effective_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
                  {row.override_active && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Granted {row.override_granted_at ? new Date(row.override_granted_at).toLocaleDateString() : "—"}
                      {row.override_reason ? ` — "${row.override_reason}"` : ""}
                      {row.override_expires_at ? ` · expires ${new Date(row.override_expires_at).toLocaleDateString()}` : ""}
                    </p>
                  )}
                </div>
                <Select value={draft.choice} onValueChange={(v: ChoiceValue) => setDraft(row.feature_key, { choice: v })}>
                  <SelectTrigger className="h-9 w-40 shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use plan default</SelectItem>
                    <SelectItem value="on">Force unlocked</SelectItem>
                    <SelectItem value="off">Force disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.choice !== "default" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <Input
                    placeholder="Reason (optional) — e.g. Support ticket #482"
                    value={draft.reason}
                    onChange={(e) => setDraft(row.feature_key, { reason: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <Input
                    type="date"
                    placeholder="Expires (optional)"
                    value={draft.expiresAt}
                    onChange={(e) => setDraft(row.feature_key, { expiresAt: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {dirty && (
                <div className="flex justify-end">
                  <Button size="sm" className="h-8 text-xs bg-royal hover:bg-royal/90" disabled={savingKey === row.feature_key} onClick={() => save(row)}>
                    {savingKey === row.feature_key ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default SAFeatureAccess;
