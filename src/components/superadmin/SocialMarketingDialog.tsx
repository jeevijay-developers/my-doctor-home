import { useMemo, useState } from "react";
import { Loader2, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SM_APPROVAL, SM_PLATFORMS, SM_POST_TYPES, SM_PUBLISHING, SM_REPORTING,
  describeMissing, emptyScope, missingForActivation, scopeToRpcArgs,
  type ApprovalProcess, type PublishingBy, type ReportingFrequency, type SocialMarketing,
} from "@/lib/socialMarketing";

type Props = {
  doctorId: string;
  doctorName: string;
  /** The saved record, or null when the service has not been scoped yet. */
  row: SocialMarketing | null;
  canManage: boolean;
  onClose: () => void;
  onDone: () => void;
};

const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const numOrNull = (t: string) => (t.trim() === "" ? null : Number(t));

const toggle = (list: string[], v: string, on: boolean) => (on ? Array.from(new Set([...list, v])) : list.filter((x) => x !== v));

const SocialMarketingDialog = ({ doctorId, doctorName, row, canManage, onClose, onDone }: Props) => {
  const [s, setS] = useState<SocialMarketing>(() => ({ ...emptyScope(), ...(row ?? {}) }));
  const [busy, setBusy] = useState(false);
  const status = row?.status ?? null;
  const missing = useMemo(() => missingForActivation(s), [s]);
  const set = <K extends keyof SocialMarketing>(k: K, v: SocialMarketing[K]) => setS((p) => ({ ...p, [k]: v }));
  const readOnly = !canManage || busy;

  const save = async (): Promise<boolean> => {
    if (s.posts_per_month != null && (!Number.isInteger(s.posts_per_month) || s.posts_per_month < 1 || s.posts_per_month > 1000)) {
      toast({ title: "Posts per month must be a whole number from 1 to 1000", variant: "destructive" });
      return false;
    }
    for (const [v, name] of [[s.monthly_fee, "Monthly fee"], [s.ad_spend_monthly, "Ad spend"]] as const) {
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        toast({ title: `${name} must be zero or more`, variant: "destructive" });
        return false;
      }
    }
    const { error } = await supabase.rpc("save_social_marketing_scope" as any, { _doctor_id: doctorId, ...scopeToRpcArgs(s) });
    if (error) {
      toast({ title: "Could not save the scope", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const onSave = async () => {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (!ok) return;
    toast({
      title: "Scope saved",
      description: status === "active" && missing.length === 0
        ? "If the scope changed, it goes back to draft until the agreement is recorded again."
        : "It stays a draft until everything below is documented and you activate it.",
    });
    onDone();
  };

  const onActivate = async () => {
    setBusy(true);
    let ok = await save();
    if (ok) {
      const { error } = await supabase.rpc("activate_social_marketing" as any, { _doctor_id: doctorId });
      if (error) {
        toast({ title: "Could not activate", description: error.message, variant: "destructive" });
        ok = false;
      }
    }
    setBusy(false);
    if (!ok) return;
    toast({ title: "Social media marketing is active", description: "The doctor can now see the agreed scope." });
    onDone();
  };

  const onEnd = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("end_social_marketing" as any, { _doctor_id: doctorId });
    setBusy(false);
    if (error) return toast({ title: "Could not end the service", description: error.message, variant: "destructive" });
    toast({ title: "Social media marketing ended" });
    onDone();
  };

  const check = (id: string, label: string, checked: boolean, on: (v: boolean) => void) => (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} disabled={readOnly} onCheckedChange={(v) => on(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Social media marketing — {doctorName}</DialogTitle>
          <DialogDescription>
            Status: <strong className="capitalize">{status ?? "not scoped yet"}</strong>. Nothing is promised to the clinic until every item in the checklist is documented.
            The fee is <strong>billed separately by Sales</strong>; it is not added to the plan payment.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Platforms</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SM_PLATFORMS.map((p) => (
              <div key={p.value}>{check(`sm-pl-${p.value}`, p.label, s.platforms.includes(p.value), (v) => set("platforms", toggle(s.platforms, p.value, v)))}</div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Deliverables</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sm-posts" className="text-xs">Posts per month</Label>
              <Input id="sm-posts" type="number" min={1} max={1000} value={s.posts_per_month ?? ""} disabled={readOnly}
                onChange={(e) => set("posts_per_month", numOrNull(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Post types</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {SM_POST_TYPES.map((p) => (
                  <div key={p.value}>{check(`sm-pt-${p.value}`, p.label, s.post_types.includes(p.value), (v) => set("post_types", toggle(s.post_types, p.value, v)))}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {check("sm-creative", "Creative design and copywriting included", s.creative_included, (v) => set("creative_included", v))}
            {check("sm-calendar", "Content calendar included", s.calendar_included, (v) => set("calendar_included", v))}
            {check("sm-community", "Community management included", s.community_management, (v) => set("community_management", v))}
            {check("sm-ads", "Paid advertising included", s.paid_ads, (v) => set("paid_ads", v))}
          </div>
          {s.paid_ads && (
            <div className="space-y-1 max-w-xs">
              <Label htmlFor="sm-adspend" className="text-xs">Monthly ad spend (₹, paid by the clinic)</Label>
              <Input id="sm-adspend" type="number" min={0} value={s.ad_spend_monthly ?? ""} disabled={readOnly}
                onChange={(e) => set("ad_spend_monthly", numOrNull(e.target.value))} />
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="sm-publishing" className="text-xs">Account handling / publishing</Label>
            <select id="sm-publishing" className={selectCls} value={s.publishing_by ?? ""} disabled={readOnly}
              onChange={(e) => set("publishing_by", (e.target.value || null) as PublishingBy | null)}>
              <option value="">Choose…</option>
              {SM_PUBLISHING.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sm-reporting" className="text-xs">Reporting</Label>
            <select id="sm-reporting" className={selectCls} value={s.reporting_frequency ?? ""} disabled={readOnly}
              onChange={(e) => set("reporting_frequency", (e.target.value || null) as ReportingFrequency | null)}>
              <option value="">Choose…</option>
              {SM_REPORTING.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sm-approval" className="text-xs">Content approval before publishing</Label>
            <select id="sm-approval" className={selectCls} value={s.approval_process ?? ""} disabled={readOnly}
              onChange={(e) => set("approval_process", (e.target.value || null) as ApprovalProcess | null)}>
              <option value="">Choose…</option>
              {SM_APPROVAL.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sm-fee" className="text-xs">Monthly service fee (₹)</Label>
            <Input id="sm-fee" type="number" min={0} value={s.monthly_fee ?? ""} disabled={readOnly}
              onChange={(e) => set("monthly_fee", numOrNull(e.target.value))} />
          </div>
        </section>

        <section className="space-y-2 rounded-lg border border-border p-3">
          <Label className="text-xs uppercase text-muted-foreground">Access and agreement</Label>
          {check("sm-access", "Access to the clinic's social accounts is confirmed", s.access_confirmed, (v) => set("access_confirmed", v))}
          {check("sm-agreed", "The clinic has agreed to this scope, fee and approval process", s.agreed, (v) => set("agreed", v))}
          {s.agreed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sm-agreed-on" className="text-xs">Agreed on</Label>
                <Input id="sm-agreed-on" type="date" value={s.agreed_on ?? ""} disabled={readOnly}
                  onChange={(e) => set("agreed_on", e.target.value || null)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sm-agreed-ref" className="text-xs">Reference (email, WhatsApp, quote no.)</Label>
                <Input id="sm-agreed-ref" maxLength={500} value={s.agreement_ref ?? ""} disabled={readOnly}
                  onChange={(e) => set("agreement_ref", e.target.value)} />
              </div>
            </div>
          )}
        </section>

        <div className="space-y-1">
          <Label htmlFor="sm-notes" className="text-xs">Internal notes</Label>
          <Textarea id="sm-notes" maxLength={2000} className="text-sm" value={s.notes ?? ""} disabled={readOnly}
            onChange={(e) => set("notes", e.target.value || null)} />
        </div>

        <div className="rounded-lg bg-secondary p-3 space-y-1" aria-live="polite">
          <p className="text-xs font-semibold">{missing.length === 0 ? "Everything is documented." : "Still missing before it can be activated:"}</p>
          {missing.length === 0 ? (
            <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Ready to activate.</p>
          ) : (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {describeMissing(missing).map((m) => <li key={m} className="flex items-center gap-1"><Circle className="h-2.5 w-2.5" />{m}</li>)}
            </ul>
          )}
        </div>
        {status === "active" && (
          <p className="text-[11px] text-muted-foreground">
            It is live. Changing anything except the notes sends it back to draft and clears the agreement, so the clinic re-confirms the new scope.
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {status && status !== "ended" && (
            <Button variant="outline" className="text-destructive mr-auto" disabled={readOnly} onClick={onEnd}>End service</Button>
          )}
          <Button variant="outline" disabled={readOnly} onClick={onSave}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save scope
          </Button>
          {status !== "active" && (
            <Button disabled={readOnly || missing.length > 0} onClick={onActivate} className="bg-royal hover:bg-royal/90">Save &amp; activate</Button>
          )}
        </div>
        {!canManage && <p className="text-xs text-muted-foreground text-right">You have view-only access to this module.</p>}
      </DialogContent>
    </Dialog>
  );
};

export default SocialMarketingDialog;
