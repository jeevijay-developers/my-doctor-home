import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CalendarCheck, Plus, Search, Filter, ChevronLeft, ChevronRight, Clock, User, Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addDays, subDays, isSameDay, startOfWeek } from "date-fns";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";

type Appointment = {
  id: string; patient_name: string; patient_phone: string; patient_age: number | null;
  patient_gender: string | null; service_name: string; appointment_type: string;
  date: string; time_slot: string; status: string; payment_status: string;
  amount: number; token_number: string | null; chief_complaint: string | null; notes: string | null;
  reschedule_count?: number | null;
};

const statusConfig: Record<string, { bg: string; dot: string; label: string }> = {
  pending: { bg: "bg-warning/10 text-warning border-l-warning", dot: "bg-warning", label: "Pending" },
  confirmed: { bg: "bg-success/10 text-success border-l-success", dot: "bg-success", label: "Confirmed" },
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
  const [newAppt, setNewAppt] = useState({
    patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic",
    date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0,
    status: "pending",
  });
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time_slot: "" });

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

  const upsertPatientForCompletion = async (appt: Appointment) => {
    if (!profile || !appt.patient_phone) return;
    const { data: existing } = await supabase
      .from("patients").select("id, total_visits, first_visit")
      .eq("doctor_id", profile.id).eq("phone", appt.patient_phone).maybeSingle();
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
    }
    load();
    toast.success(`Marked ${status.replace("_", " ")}`);
  };

  const togglePaid = async (a: Appointment) => {
    const next = a.payment_status === "paid" ? "pending" : "paid";
    await supabase.from("appointments").update({ payment_status: next as any }).eq("id", a.id);
    load();
    toast.success(next === "paid" ? "Marked as paid" : "Marked as unpaid");
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

  const addAppointment = async () => {
    if (!profile) return;
    if (!newAppt.patient_name.trim()) { toast.error("Patient name is required"); return; }
    if (!newAppt.patient_phone.trim()) { toast.error("Phone number is required"); return; }
    if (!isValidIndianPhone(newAppt.patient_phone)) { toast.error(phoneErrorMessage); return; }
    // Block past date / time
    const apptTs = new Date(`${newAppt.date}T${newAppt.time_slot}`);
    if (apptTs.getTime() < Date.now()) { toast.error("Cannot book an appointment for a past date or time slot."); return; }
    const normalizedPhone = normalizeIndianPhone(newAppt.patient_phone);

    const { data: settingsRow } = await supabase
      .from("website_settings").select("max_per_slot").eq("doctor_id", profile.id).single();
    const cap = (settingsRow as any)?.max_per_slot || 1;
    const { count: taken } = await supabase
      .from("appointments").select("*", { count: "exact", head: true })
      .eq("doctor_id", profile.id).eq("date", newAppt.date).eq("time_slot", newAppt.time_slot)
      .neq("status", "cancelled");
    if ((taken ?? 0) >= cap) {
      const ok = confirm(`This slot already has ${taken}/${cap} appointments. Add anyway?`);
      if (!ok) return;
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
    setNewAppt({ patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic", date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0, status: "pending" });
    load();
    toast.success("Appointment added");
  };


  const filtered = appointments.filter((a) =>
    a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    a.service_name.toLowerCase().includes(search.toLowerCase())
  );

  // Calendar strip: 7 days centered on selected date
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const calendarDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Status summary counts
  const statusCounts = {
    total: appointments.length,
    pending: appointments.filter(a => a.status === "pending").length,
    confirmed: appointments.filter(a => a.status === "confirmed").length,
    completed: appointments.filter(a => a.status === "completed").length,
  };

  const allTimeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const timeSlots = newAppt.date === todayStr
    ? allTimeSlots.filter((t) => new Date(`${todayStr}T${t}`).getTime() > Date.now())
    : allTimeSlots;

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
                  <Input type="number" value={newAppt.amount} onChange={(e) => setNewAppt({ ...newAppt, amount: Number(e.target.value) })} className="h-10" />
                </div>
              </div>
              <Button onClick={addAppointment} className="w-full h-10 bg-royal hover:bg-royal/90">Add Appointment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar Strip */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={() => setSelectedDate(d => subDays(d, 7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 grid grid-cols-7 gap-1 overflow-x-auto">
              {calendarDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                const isSelected = dateFilterActive && isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setSelectedDate(day); setDateFilterActive(true); }}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl text-center transition-all ${
                      isSelected ? "bg-royal text-white" :
                      isToday ? "bg-royal/10 text-royal" :
                      "hover:bg-secondary text-foreground"
                    }`}
                  >
                    <span className="text-[10px] font-medium opacity-70">{format(day, "EEE")}</span>
                    <span className="text-sm font-bold">{format(day, "d")}</span>
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedDate(d => addDays(d, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {dateFilterActive && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
              <span className="text-xs text-muted-foreground">Showing: {format(selectedDate, "MMMM d, yyyy")}</span>
              <Button variant="ghost" size="sm" className="text-xs h-6 text-royal" onClick={() => setDateFilterActive(false)}>Show All</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: statusCounts.total, color: "text-foreground", bg: "bg-secondary" },
          { label: "Pending", count: statusCounts.pending, color: "text-warning", bg: "bg-warning/10" },
          { label: "Confirmed", count: statusCounts.confirmed, color: "text-success", bg: "bg-success/10" },
          { label: "Completed", count: statusCounts.completed, color: "text-royal", bg: "bg-royal/10" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <div className={`font-heading font-bold text-xl ${s.color}`}>{s.count}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search patient or service..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-10"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            return (
              <Card key={a.id} className={`border-border/60 shadow-none border-l-4 ${sc.bg.split(" ")[0].replace("bg-", "border-l-")} hover:shadow-md transition-shadow`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                        {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{a.patient_name}</div>
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
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <Select value={a.status} onValueChange={(v) => updateStatus(a.id, v)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="no_show">No Show</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className={`text-xs h-7 ${a.payment_status === "paid" ? "border-success/40 text-success" : "border-warning/40 text-warning"}`} onClick={() => togglePaid(a)}>
                        {a.payment_status === "paid" ? "Paid" : "Mark Paid"}
                      </Button>
                      {a.status !== "cancelled" && a.status !== "completed" && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openReschedule(a)}>Reschedule</Button>
                      )}
                      {a.appointment_type === "online" && a.status !== "cancelled" && (
                        <Button size="sm" className="text-xs h-7 bg-teal/10 text-teal hover:bg-teal/20 border-0" onClick={() => generateZoomMeeting(a.id)}>
                          <Video className="h-3 w-3 mr-1" /> Meeting Link
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={!!rescheduling} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={rescheduleForm.date} onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={rescheduleForm.time_slot} onChange={(e) => setRescheduleForm({ ...rescheduleForm, time_slot: e.target.value })} className="h-10" />
            </div>
            <Button onClick={submitReschedule} className="w-full h-10 bg-royal hover:bg-royal/90">Save New Slot</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentsPage;
