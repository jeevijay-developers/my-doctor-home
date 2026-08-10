// Regular Checkup Reminder & Notification — doctor-side configuration,
// manual test tools, and a per-patient view of recent notification_logs.
// Mock vs live delivery is entirely a backend concern (see
// supabase/functions/_shared/notificationProviders.ts) — this UI is
// identical either way and never sees or needs API keys.
import { useEffect, useState } from "react";
import {
  CalendarClock, Bell, Pencil, Pause, Play, Trash2, Send, PlayCircle, FlaskConical,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { dbErrorMessage } from "@/lib/dbErrorMessage";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import {
  FREQUENCY_OPTIONS, FREQUENCY_LABEL, STATUS_LABEL, STATUS_CLASS,
  NOTIFICATION_STATUS_LABEL, NOTIFICATION_STATUS_CLASS, CHANNEL_LABEL,
  computeNextReminderDate, type Frequency, type ReminderStatus,
} from "@/lib/checkupReminders";

type Reminder = {
  id: string; frequency: Frequency; custom_interval_days: number | null;
  next_checkup_date: string; reminder_before_days: number;
  whatsapp_enabled: boolean; sms_enabled: boolean; in_app_enabled: boolean;
  status: ReminderStatus;
};
type LogRow = {
  id: string; channel: string; message: string; status: string; recipient: string | null;
  is_test: boolean; created_at: string; error_message: string | null;
};

const emptyForm = {
  frequency: "every_3_months" as Frequency, custom_interval_days: "",
  next_checkup_date: "", reminder_before_days: "7",
  whatsapp_enabled: false, sms_enabled: false, in_app_enabled: true,
};

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const CheckupReminderTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("patient_checkup_reminders")
      .select("id, frequency, custom_interval_days, next_checkup_date, reminder_before_days, whatsapp_enabled, sms_enabled, in_app_enabled, status")
      .eq("patient_id", patientId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReminder(data as Reminder | null);
    const { data: logRows } = await supabase
      .from("notification_logs")
      .select("id, channel, message, status, recipient, is_test, created_at, error_message")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(8);
    setLogs((logRows || []) as LogRow[]);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [patientId]);

  const openAdd = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = () => {
    if (!reminder) return;
    setForm({
      frequency: reminder.frequency, custom_interval_days: reminder.custom_interval_days?.toString() || "",
      next_checkup_date: reminder.next_checkup_date, reminder_before_days: String(reminder.reminder_before_days),
      whatsapp_enabled: reminder.whatsapp_enabled, sms_enabled: reminder.sms_enabled, in_app_enabled: reminder.in_app_enabled,
    });
    setDialogOpen(true);
  };

  const previewNextReminder = form.next_checkup_date && form.reminder_before_days
    ? computeNextReminderDate(form.next_checkup_date, Number(form.reminder_before_days) || 0)
    : null;

  const save = async () => {
    if (!form.next_checkup_date) { toast.error("Next Checkup Date is required"); return; }
    if (form.frequency === "custom" && !form.custom_interval_days) { toast.error("Custom interval (days) is required"); return; }
    if (!form.whatsapp_enabled && !form.sms_enabled && !form.in_app_enabled) { toast.error("Enable at least one notification channel"); return; }

    const reminderBeforeDays = Number(form.reminder_before_days) || 0;
    const nextReminderDate = computeNextReminderDate(form.next_checkup_date, reminderBeforeDays);
    const payload = {
      frequency: form.frequency,
      custom_interval_days: form.frequency === "custom" ? Number(form.custom_interval_days) : null,
      next_checkup_date: form.next_checkup_date,
      reminder_before_days: reminderBeforeDays,
      whatsapp_enabled: form.whatsapp_enabled,
      sms_enabled: form.sms_enabled,
      in_app_enabled: form.in_app_enabled,
      next_reminder_at: `${nextReminderDate}T00:00:00Z`,
    };

    setSaving(true);
    if (reminder) {
      const { error } = await supabase.from("patient_checkup_reminders").update({ ...payload, updated_by: doctorId, status: "active" }).eq("id", reminder.id);
      setSaving(false);
      if (error) { toast.error(dbErrorMessage(error, "patient_checkup_reminders update", "Could not save reminder")); return; }
      toast.success("Checkup reminder updated successfully.");
    } else {
      const { error } = await supabase.from("patient_checkup_reminders").insert({
        ...payload, patient_id: patientId, doctor_id: doctorId, created_by: doctorId, updated_by: doctorId,
      });
      setSaving(false);
      if (error) { toast.error(dbErrorMessage(error, "patient_checkup_reminders insert", "Could not save reminder")); return; }
      toast.success("Checkup reminder created successfully.");
    }
    setDialogOpen(false);
    load();
    onChange?.();
  };

  const togglePause = async () => {
    if (!reminder) return;
    const nextStatus: ReminderStatus = reminder.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("patient_checkup_reminders").update({ status: nextStatus, updated_by: doctorId }).eq("id", reminder.id);
    if (error) { toast.error(dbErrorMessage(error, "patient_checkup_reminders status update", "Could not update reminder")); return; }
    toast.success(nextStatus === "paused" ? "Reminder paused." : "Reminder resumed.");
    load();
  };

  const confirmDelete = async () => {
    if (!reminder) return;
    const { error } = await supabase.from("patient_checkup_reminders").delete().eq("id", reminder.id);
    if (error) { toast.error(dbErrorMessage(error, "patient_checkup_reminders delete", "Could not delete reminder")); return; }
    toast.success("Reminder deleted.");
    setDeleting(false);
    load();
    onChange?.();
  };

  const sendTest = async (channel: "whatsapp" | "sms") => {
    setBusy(channel);
    const fn = channel === "whatsapp" ? "send-whatsapp-notification" : "send-sms-notification";
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke(fn, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: { patient_id: patientId, checkup_date: reminder?.next_checkup_date, reminder_id: reminder?.id, is_test: true },
    });
    setBusy(null);
    if (error) { toast.error(await edgeFunctionErrorMessage(error, `Could not generate test ${channel === "whatsapp" ? "WhatsApp" : "SMS"} reminder`)); return; }
    toast.success(`Test ${channel === "whatsapp" ? "WhatsApp" : "SMS"} reminder generated successfully.`);
    load();
  };

  const runWorker = async () => {
    setBusy("worker");
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("checkup-reminder-worker", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: {},
    });
    setBusy(null);
    if (error) { toast.error(await edgeFunctionErrorMessage(error, "Could not run the reminder worker")); return; }
    toast.success(`Reminder worker ran — ${data?.processed ?? 0} reminder(s) processed.`);
    load();
    onChange?.();
  };

  if (loading) return <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="h-4.5 w-4.5 text-royal" /> Regular Checkup Reminder
        </h3>
        {!reminder && (
          <Button size="sm" onClick={openAdd} className="bg-royal hover:bg-royal/90 h-8 text-xs">
            <Bell className="h-3.5 w-3.5 mr-1" /> Enable Reminder
          </Button>
        )}
      </div>

      {!reminder ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <CalendarClock className="h-9 w-9 mx-auto mb-2 opacity-20 text-royal" />
            <p className="text-sm text-muted-foreground font-medium">No checkup reminder set up</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Enable a reminder to notify this patient when their next regular checkup is due</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-sm text-foreground">Regular Checkup</div>
                <dl className="mt-2 space-y-1 text-xs">
                  <div><dt className="inline text-muted-foreground">Next Checkup: </dt><dd className="inline text-foreground font-medium">{fmtDate(reminder.next_checkup_date)}</dd></div>
                  <div><dt className="inline text-muted-foreground">Frequency: </dt><dd className="inline text-foreground">{FREQUENCY_LABEL[reminder.frequency]}{reminder.frequency === "custom" && reminder.custom_interval_days ? ` (${reminder.custom_interval_days} days)` : ""}</dd></div>
                  <div><dt className="inline text-muted-foreground">Next Reminder: </dt><dd className="inline text-foreground">{fmtDate(computeNextReminderDate(reminder.next_checkup_date, reminder.reminder_before_days))}</dd></div>
                </dl>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_CLASS[reminder.status]}`}>Status: {STATUS_LABEL[reminder.status]}</Badge>
                  {reminder.whatsapp_enabled && <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>}
                  {reminder.sms_enabled && <Badge variant="secondary" className="text-[10px]">SMS</Badge>}
                  {reminder.in_app_enabled && <Badge variant="secondary" className="text-[10px]">In-App</Badge>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Reminder
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={togglePause}>
                {reminder.status === "active" ? <><Pause className="h-3.5 w-3.5 mr-1" /> Pause Reminder</> : <><Play className="h-3.5 w-3.5 mr-1" /> Resume Reminder</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setDeleting(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Reminder
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
              {reminder.whatsapp_enabled && (
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy} onClick={() => sendTest("whatsapp")}>
                  <Send className="h-3.5 w-3.5 mr-1" /> {busy === "whatsapp" ? "Sending…" : "Send Test WhatsApp"}
                </Button>
              )}
              {reminder.sms_enabled && (
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy} onClick={() => sendTest("sms")}>
                  <Send className="h-3.5 w-3.5 mr-1" /> {busy === "sms" ? "Sending…" : "Send Test SMS"}
                </Button>
              )}
              <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!!busy} onClick={runWorker}>
                <PlayCircle className="h-3.5 w-3.5 mr-1" /> {busy === "worker" ? "Running…" : "Run Reminder Worker"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" /> Recent Notifications
        </h4>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">No notifications sent yet for this patient.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 text-xs bg-secondary/50 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">{CHANNEL_LABEL[l.channel as keyof typeof CHANNEL_LABEL] || l.channel}</span>
                    {l.is_test && <Badge variant="secondary" className="text-[9px]">Test</Badge>}
                    <Badge variant="secondary" className={`text-[9px] ${NOTIFICATION_STATUS_CLASS[l.status as keyof typeof NOTIFICATION_STATUS_CLASS] || ""}`}>
                      {NOTIFICATION_STATUS_LABEL[l.status as keyof typeof NOTIFICATION_STATUS_LABEL] || l.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate mt-0.5">{l.message}</p>
                </div>
                <span className="text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{reminder ? "Edit Checkup Reminder" : "Enable Regular Checkup Reminder"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Checkup Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as Frequency })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === "custom" && (
                <div className="space-y-1.5">
                  <Label>Custom Interval (days)</Label>
                  <Input type="number" min={1} value={form.custom_interval_days} onChange={(e) => setForm({ ...form, custom_interval_days: e.target.value })} className="h-10" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Next Checkup Date</Label>
                <Input type="date" value={form.next_checkup_date} onChange={(e) => setForm({ ...form, next_checkup_date: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Reminder Before (days)</Label>
                <Input type="number" min={0} value={form.reminder_before_days} onChange={(e) => setForm({ ...form, reminder_before_days: e.target.value })} className="h-10" />
              </div>
            </div>

            {previewNextReminder && (
              <p className="text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-2">Next Reminder will be sent on <strong className="text-foreground">{fmtDate(previewNextReminder)}</strong></p>
            )}

            <div>
              <Label className="mb-2 block">Notification Channels</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.whatsapp_enabled} onCheckedChange={(v) => setForm({ ...form, whatsapp_enabled: !!v })} /> WhatsApp
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.sms_enabled} onCheckedChange={(v) => setForm({ ...form, sms_enabled: !!v })} /> SMS
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.in_app_enabled} onCheckedChange={(v) => setForm({ ...form, in_app_enabled: !!v })} /> In-App Notification
                </label>
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="w-full h-10 bg-royal hover:bg-royal/90">
              {saving ? "Saving…" : "Save Reminder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this checkup reminder?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the reminder configuration. Past notification history is kept for audit purposes.</AlertDialogDescription>
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

export default CheckupReminderTab;
