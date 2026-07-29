import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CalendarCheck, Plus, Search, Filter, Clock, User, Phone, Video, Trash2, X, Calendar as CalendarIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, isSameDay, parseISO } from "date-fns";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { ensureInvoiceForAppointment } from "@/lib/invoiceGeneration";

type Appointment = {
  id: string; patient_name: string; patient_phone: string; patient_age: number | null;
  patient_gender: string | null; service_name: string; appointment_type: string;
  date: string; time_slot: string; status: string; payment_status: string;
  amount: number; token_number: string | null; chief_complaint: string | null; notes: string | null;
  reschedule_count?: number | null;
  zoom_meeting_id?: string | null;
  zoom_join_url?: string | null;
};

const statusConfig: Record<string, { bg: string; dot: string; label: string }> = {
  pending: { bg: "bg-warning/10 text-warning border-l-warning", dot: "bg-warning", label: "Pending" },
  completed: { bg: "bg-royal/10 text-royal border-l-royal", dot: "bg-royal", label: "Completed" },
  cancelled: { bg: "bg-destructive/10 text-destructive border-l-destructive", dot: "bg-destructive", label: "Cancelled" },
  no_show: { bg: "bg-muted text-muted-foreground border-l-muted-foreground", dot: "bg-muted-foreground", label: "No Show" },
};

const AppointmentsPage = () => {
  const { profile } = useProfile();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [datesWithAppointments, setDatesWithAppointments] = useState<Set<string>>(new Set());
  const [newAppt, setNewAppt] = useState({
    patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic",
    date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0,
    status: "pending",
  });
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time_slot: "" });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [slotConflict, setSlotConflict] = useState<{ taken: number; cap: number; time: string } | null>(null);

  // Keep detail view in sync with the latest data after mutations
  useEffect(() => {
    if (!viewing) return;
    const fresh = appointments.find((a) => a.id === viewing.id);
    if (fresh && fresh !== viewing) setViewing(fresh);
  }, [appointments]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from("appointments").delete().in("id", ids);
    if (error) { toast.error("Could not delete appointments"); return; }
    toast.success(`${ids.length} appointment${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    exitSelectMode();
    load();
  };

  const load = async () => {
    if (!profile) return;
    let q = supabase.from("appointments").select("*").eq("doctor_id", profile.id).order("date", { ascending: false }).order("time_slot");
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (dateFilterActive) q = q.eq("date", format(selectedDate, "yyyy-MM-dd"));
    const { data } = await q;
    const rows = (data || []) as Appointment[];

    // BUG-006: Auto-mark past pending/confirmed appointments as no_show
    const now = new Date();
    const expired = rows.filter(
      (a) =>
        (a.status === "pending" || a.status === "confirmed") &&
        new Date(`${a.date}T${a.time_slot}`) < now
    );
    if (expired.length) {
      await supabase
        .from("appointments")
        .update({ status: "no_show" as any })
        .in("id", expired.map((e) => e.id));
      expired.forEach((e) => (e.status = "no_show"));
    }

    // BUG-007: Rank so cancelled / no_show sit at the bottom
    const rank = (s: string) =>
      s === "cancelled" ? 3 : s === "no_show" ? 2 : s === "completed" ? 1 : 0;
    rows.sort((a, b) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.time_slot < b.time_slot ? -1 : 1;
    });
    setAppointments(rows);
  };

  useEffect(() => { load(); }, [profile, statusFilter, selectedDate, dateFilterActive]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Load distinct dates that have any appointments (for calendar dot indicators)
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("appointments").select("date").eq("doctor_id", profile.id);
      if (cancelled) return;
      setDatesWithAppointments(new Set((data || []).map((r: any) => r.date)));
    })();
    return () => { cancelled = true; };
  }, [profile, appointments.length]);

  const upsertPatientForCompletion = async (appt: Appointment) => {
    if (!profile || !appt.patient_phone) return;
    // Identify a patient by (phone + normalized name) so that two different
    // people sharing a mobile number remain distinct patient records. The
    // patient's UUID (patients.id) is the true identity; phone is contact info.
    const normalizedName = (appt.patient_name || "").trim().toLowerCase();
    const { data: candidates } = await supabase
      .from("patients").select("id, name, total_visits, first_visit")
      .eq("doctor_id", profile.id).eq("phone", appt.patient_phone);
    const existing = (candidates || []).find(
      (p: any) => (p.name || "").trim().toLowerCase() === normalizedName
    );
    if (existing) {
      await supabase.from("patients").update({
        total_visits: (existing.total_visits || 0) + 1,
        last_visit: appt.date,
        first_visit: existing.first_visit || appt.date,
      } as any).eq("id", existing.id);
    } else {
      await supabase.from("patients").insert({
        doctor_id: profile.id, name: appt.patient_name, phone: appt.patient_phone,
        first_visit: appt.date, last_visit: appt.date, total_visits: 1,
        age: appt.patient_age, gender: appt.patient_gender,
      });
    }
  };

  // BUG-014: status can be changed at any time. On transition INTO "completed",
  // the patient is added / their visit count incremented.
  const updateStatus = async (id: string, status: string) => {
    const current = appointments.find((a) => a.id === id);
    await supabase.from("appointments").update({ status: status as any }).eq("id", id);
    if (status === "completed" && current && current.status !== "completed") {
      await upsertPatientForCompletion(current);
      // Persist an invoice now so Revenue/Billing remain intact even if the
      // appointment is deleted later.
      try {
        await ensureInvoiceForAppointment({
          id: current.id,
          doctor_id: (profile as any).id,
          patient_name: current.patient_name,
          service_name: current.service_name,
          amount: current.amount,
        });
      } catch (e) {
        console.warn("Invoice generation failed", e);
      }
    }
    load();
    toast.success(`Marked ${status.replace("_", " ")}`);
  };

  const deleteAppointment = async (id: string) => {
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) { toast.error("Could not delete appointment"); return; }
    toast.success("Appointment deleted");
    load();
  };

  const openReschedule = (a: Appointment) => {
    setRescheduling(a);
    setRescheduleForm({ date: a.date, time_slot: a.time_slot });
  };

  const submitReschedule = async () => {
    if (!rescheduling) return;
    const { error } = await supabase.from("appointments").update({
      date: rescheduleForm.date, time_slot: rescheduleForm.time_slot,
      reschedule_count: (rescheduling.reschedule_count ?? 0) + 1,
    } as any).eq("id", rescheduling.id);
    if (error) { toast.error(error.message.includes("SLOT_FULL") ? "That slot is full." : "Could not reschedule."); return; }
    setRescheduling(null);
    load();
    toast.success("Appointment rescheduled");
  };

  const generateZoomMeeting = async (_appointmentId: string) => {
    toast.info("Zoom integration coming soon", {
      description: "Meeting links will generate automatically once connected.",
    });
  };

  const addAppointment = async (bypassSlotCheck = false) => {
    if (!profile) return;
    if (!newAppt.patient_name.trim()) { toast.error("Patient name is required"); return; }
    if (!newAppt.patient_phone.trim()) { toast.error("Phone number is required"); return; }
    if (!isValidIndianPhone(newAppt.patient_phone)) { toast.error(phoneErrorMessage); return; }
    // Block past date / time
    const apptTs = new Date(`${newAppt.date}T${newAppt.time_slot}`);
    if (apptTs.getTime() < Date.now()) { toast.error("Cannot book an appointment for a past date or time slot."); return; }
    const normalizedPhone = normalizeIndianPhone(newAppt.patient_phone);

    if (!bypassSlotCheck) {
      const { data: settingsRow } = await supabase
        .from("website_settings").select("max_per_slot").eq("doctor_id", profile.id).single();
      const cap = (settingsRow as any)?.max_per_slot || 1;
      const { count: taken } = await supabase
        .from("appointments").select("*", { count: "exact", head: true })
        .eq("doctor_id", profile.id).eq("date", newAppt.date).eq("time_slot", newAppt.time_slot)
        .neq("status", "cancelled");
      if ((taken ?? 0) >= cap) {
        setSlotConflict({ taken: taken ?? 0, cap, time: newAppt.time_slot });
        return;
      }
    }

    const token = `T${Math.floor(Math.random() * 900) + 100}`;
    const { status, ...rest } = newAppt;
    const serviceName = rest.service_name.trim() || "Consultation";
    const { error } = await supabase.from("appointments").insert({
      doctor_id: profile.id, ...rest, service_name: serviceName,
      appointment_type: "clinic",
      patient_phone: normalizedPhone,
      token_number: token, status: status as any, payment_status: "pending" as any,
    });
    if (error) { toast.error("Could not add appointment"); return; }

    // BUG-04: patient row created only when appointment is completed.

    setShowNew(false);
    setSlotConflict(null);
    setNewAppt({ patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic", date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0, status: "pending" });
    load();
    toast.success("Appointment added");
  };


  const filtered = appointments.filter((a) =>
    a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    a.service_name.toLowerCase().includes(search.toLowerCase())
  );


  // Status summary counts
  const statusCounts = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === "pending" || a.status === "confirmed").length,
    completed: appointments.filter(a => a.status === "completed").length,
    cancelled: appointments.filter(a => a.status === "cancelled").length,
  };

  const allTimeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const timeSlots = newAppt.date === todayStr
    ? allTimeSlots.filter((t) => new Date(`${todayStr}T${t}`).getTime() > Date.now())
    : allTimeSlots;

  // Auto-select first available slot when dialog opens or slot list changes
  useEffect(() => {
    if (!showNew) return;
    if (timeSlots.length === 0) return;
    if (!timeSlots.includes(newAppt.time_slot)) {
      setNewAppt((prev) => ({ ...prev, time_slot: timeSlots[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew, newAppt.date, timeSlots.join(",")]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-royal" /> Appointments
        </h1>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button className="bg-royal hover:bg-royal/90"><Plus className="h-4 w-4 mr-1" /> New Appointment</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Add Appointment</DialogTitle></DialogHeader>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
                  <Input value={newAppt.patient_name} onChange={(e) => setNewAppt({ ...newAppt, patient_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone *</Label>
                  <Input value={newAppt.patient_phone} inputMode="numeric" maxLength={13} onChange={(e) => setNewAppt({ ...newAppt, patient_phone: e.target.value })} placeholder="10-digit mobile" className="h-10" />
                  {newAppt.patient_phone && !isValidIndianPhone(newAppt.patient_phone) && (
                    <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Service <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input value={newAppt.service_name} onChange={(e) => setNewAppt({ ...newAppt, service_name: e.target.value })} placeholder="e.g. Consultation" className="h-10" />
              </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" min={todayStr} value={newAppt.date} onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Time Slot</Label>
                  <Select value={newAppt.time_slot} onValueChange={(v) => setNewAppt({ ...newAppt, time_slot: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/40 text-sm text-foreground">
                    Clinic Visit
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (₹)</Label>
                  <Input type="number" min={0} placeholder="0" value={newAppt.amount === 0 ? "" : newAppt.amount} onChange={(e) => setNewAppt({ ...newAppt, amount: e.target.value === "" ? 0 : Number(e.target.value) })} className="h-10" />
                </div>
              </div>
              <Button onClick={() => addAppointment()} className="w-full h-10 bg-royal hover:bg-royal/90">Add Appointment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Date filter */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {dateFilterActive ? format(selectedDate, "EEE, d MMM yyyy") : "Filter by date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateFilterActive ? selectedDate : undefined}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDate(d);
                    setDateFilterActive(true);
                    setCalendarOpen(false);
                  }}
                  modifiers={{
                    hasAppointments: (day) => datesWithAppointments.has(format(day, "yyyy-MM-dd")),
                  }}
                  modifiersClassNames={{
                    hasAppointments:
                      "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-royal",
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {dateFilterActive ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Showing: {format(selectedDate, "EEEE, d MMMM yyyy")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-royal"
                  onClick={() => setDateFilterActive(false)}
                >
                  <X className="h-3 w-3" /> Clear
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Showing all upcoming appointments</span>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: statusCounts.total, color: "text-foreground", bg: "bg-secondary" },
          { label: "Pending", count: statusCounts.pending, color: "text-warning", bg: "bg-warning/10" },
          { label: "Completed", count: statusCounts.completed, color: "text-royal", bg: "bg-royal/10" },
          { label: "Cancelled", count: statusCounts.cancelled, color: "text-destructive", bg: "bg-destructive/10" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <div className={`font-heading font-bold text-xl ${s.color}`}>{s.count}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`flex flex-col sm:flex-row gap-3 transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search patient or service..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-10"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} appointment{filtered.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (selectedIds.size === filtered.length) clearSelection();
                  else setSelectedIds(new Set(filtered.map((a) => a.id)));
                }}
              >
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length}`}
              </Button>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={selectMode ? "default" : "outline"}
                    className={`h-8 w-8 p-0 ${selectMode ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    aria-pressed={selectMode}
                    aria-label={selectMode ? "Exit selection mode" : "Select items to delete"}
                  >
                    {selectMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{selectMode ? "Done" : "Select to delete"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Appointment Cards */}
      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <CalendarCheck className="h-12 w-12 text-royal/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No appointments found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Try adjusting your filters or add a new appointment</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const sc = statusConfig[a.status] || statusConfig.pending;
            const isSelected = selectedIds.has(a.id);
            const borderColor = sc.bg.split(" ").find((c) => c.startsWith("border-l-")) || "";
            return (
              <Card
                key={a.id}
                className={`relative border-border/60 shadow-none border-l-4 ${borderColor} transition-all ${
                  selectMode ? "cursor-pointer" : "cursor-pointer hover:shadow-md"
                } ${isSelected ? "bg-royal/5 ring-2 ring-royal ring-offset-2" : ""}`}
                onClick={selectMode ? () => toggleSelected(a.id) : () => setViewing(a)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {selectMode && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select appointment for ${a.patient_name}`}
                          className="h-5 w-5 rounded-full"
                        />
                      )}
                      <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                        {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div>
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {a.patient_name}
                          {a.token_number && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-royal/10 text-royal text-[10px] font-semibold">#{a.token_number}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{a.service_name}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.time_slot?.slice(0, 5)}</span>
                          <span>·</span>
                          <span>{a.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] capitalize ${a.appointment_type === "clinic" ? "bg-royal/10 text-royal border-royal/20" : "bg-teal/10 text-teal border-teal/20"}`}>
                        {a.appointment_type}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] capitalize ${sc.bg}`}>{sc.label}</Badge>
                      {(a.reschedule_count ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                          Rescheduled ({a.reschedule_count})
                        </Badge>
                      )}
                      <span className="font-semibold text-sm text-foreground">₹{a.amount}</span>
                    </div>
                    {!selectMode && (
                      <div className="flex gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
                        {a.appointment_type === "online" && a.status !== "cancelled" && a.status !== "completed" && (
                          <Button size="sm" variant="outline" className="text-xs h-8 bg-teal/10 text-teal hover:bg-teal/20 border-teal/20" onClick={() => generateZoomMeeting(a.id)}>
                            <Video className="h-3 w-3 mr-1" /> Meeting
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Appointment Detail Sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {viewing && (() => {
            const sc = statusConfig[viewing.status] || statusConfig.pending;
            const transitions: Record<string, { label: string; next: string; tone: string }[]> = {
              pending: [
                { label: "Complete", next: "completed", tone: "bg-royal text-white hover:bg-royal/90" },
                { label: "No Show", next: "no_show", tone: "bg-muted-foreground text-white hover:bg-muted-foreground/90" },
                { label: "Cancel", next: "cancelled", tone: "bg-destructive text-white hover:bg-destructive/90" },
              ],
              confirmed: [
                { label: "Complete", next: "completed", tone: "bg-royal text-white hover:bg-royal/90" },
                { label: "No Show", next: "no_show", tone: "bg-muted-foreground text-white hover:bg-muted-foreground/90" },
                { label: "Cancel", next: "cancelled", tone: "bg-destructive text-white hover:bg-destructive/90" },
              ],
              completed: [],
              no_show: [],
              cancelled: [],
            };
            const options = transitions[viewing.status] ?? [];
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="w-16 h-16 rounded-full bg-royal/10 flex items-center justify-center text-2xl font-bold text-royal">
                      {viewing.patient_name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-primary text-lg truncate">{viewing.patient_name}</SheetTitle>
                      <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {viewing.patient_phone}</span>
                        {viewing.token_number && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-royal/10 text-royal text-[10px] font-semibold">#{viewing.token_number}</span>}
                      </p>
                    </div>
                  </div>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                  {/* Status */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Current status</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </div>
                    {options.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {options.map((o) => (
                          <Button
                            key={o.next}
                            size="sm"
                            className={`h-9 text-xs ${o.tone}`}
                            onClick={() => updateStatus(viewing.id, o.next)}
                          >
                            {o.label}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">This appointment is in a final state. No further status changes are available.</p>
                    )}
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Date", value: viewing.date },
                      { label: "Time", value: viewing.time_slot?.slice(0, 5) },
                      { label: "Service", value: viewing.service_name },
                      { label: "Type", value: viewing.appointment_type },
                      { label: "Amount", value: `₹${viewing.amount}` },
                      { label: "Payment", value: viewing.payment_status === "paid" ? "Paid" : "Unpaid" },
                    ].map((item) => (
                      <div key={item.label} className="bg-secondary rounded-xl p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">{item.label}</div>
                        <div className="font-medium text-sm text-foreground capitalize truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {(viewing.chief_complaint || viewing.notes) && (
                    <div className="space-y-2">
                      {viewing.chief_complaint && (
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Chief complaint</div>
                          <p className="text-sm text-foreground">{viewing.chief_complaint}</p>
                        </div>
                      )}
                      {viewing.notes && (
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Notes</div>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{viewing.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Secondary actions */}
                  {viewing.status !== "completed" && viewing.status !== "cancelled" && (
                    <div className="pt-4 border-t border-border flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => { const a = viewing; setViewing(null); openReschedule(a); }}>
                        Reschedule
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <Dialog open={!!rescheduling} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" min={todayStr} value={rescheduleForm.date} onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={rescheduleForm.time_slot} onChange={(e) => setRescheduleForm({ ...rescheduleForm, time_slot: e.target.value })} className="h-10" />
            </div>
            <Button onClick={submitReschedule} className="w-full h-10 bg-royal hover:bg-royal/90">Save New Slot</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Patient records will remain, but this appointment will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { if (deletingId) { deleteAppointment(deletingId); setDeletingId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Double-booking confirmation */}
      <AlertDialog open={!!slotConflict} onOpenChange={(o) => !o && setSlotConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-warning"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <AlertDialogTitle className="text-center">Time Slot Already Booked</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This time slot ({slotConflict?.time}) already has {slotConflict?.taken}/{slotConflict?.cap} appointment{(slotConflict?.taken ?? 0) === 1 ? "" : "s"} scheduled. Do you want to book another appointment at the same time anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setSlotConflict(null); addAppointment(true); }}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Book Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} appointment{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => { setBulkConfirmText(""); setBulkDeleteOpen(true); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) setBulkConfirmText(""); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} appointment{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Patient records will remain, but these appointments will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedIds.size >= 10 && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                To confirm, type <span className="font-mono font-semibold">{selectedIds.size}</span> below:
              </Label>
              <Input
                value={bulkConfirmText}
                onChange={(e) => setBulkConfirmText(e.target.value)}
                placeholder={String(selectedIds.size)}
                className="h-10"
                autoFocus
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectedIds.size >= 10 && bulkConfirmText.trim() !== String(selectedIds.size)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
              onClick={(e) => { e.preventDefault(); bulkDelete(); }}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppointmentsPage;
