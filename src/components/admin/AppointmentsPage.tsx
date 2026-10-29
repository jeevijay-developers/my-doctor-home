import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { CalendarCheck, Plus, Search, Filter, Clock, User, Phone, Video, Trash2, X, Calendar as CalendarIcon, MoreVertical, ListChecks, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { AmountInput } from "@/components/ui/amount-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, isSameDay, parseISO } from "date-fns";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import LiveQueue from "./LiveQueue";
import { PAYMENT_METHODS, clinicToday, isUnpaid, queueErrorMessage } from "@/lib/queue";
import { generateBookingToken } from "@/lib/bookingToken";
import VideoConsultationCard from "@/components/VideoConsultationCard";
import { useTrialStatus } from "@/contexts/TrialStatusContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import PaginationBar, { PAGE_SIZE } from "@/components/shared/PaginationBar";
import DateFilter from "@/components/shared/DateFilter";
import { defaultAppointmentAmount } from "@/lib/appointmentAmount";
import { appointmentSerialNumber } from "@/lib/appointmentList";

const WALK_IN_TIME = "walk-in";

// Escapes characters that would otherwise break PostgREST's .or() filter
// string syntax (commas/parens are filter-list separators, % and _ are
// ilike wildcards) when a raw search term is interpolated into it.
const sanitizeSearchTerm = (term: string) => term.replace(/[,()%_]/g, " ").trim();

type Appointment = {
  id: string; patient_name: string; patient_phone: string; patient_age: number | null;
  patient_gender: string | null; patient_email: string | null; service_name: string; appointment_type: string;
  date: string; time_slot: string | null; status: string; payment_status: string;
  amount: number; token_number: string | null; chief_complaint: string | null; notes: string | null;
  reschedule_count?: number | null;
  queue_number?: number | null;
  payment_method?: string | null;
  zoom_meeting_id?: string | null;
  zoom_join_url?: string | null;
};

const paymentLabel = (a: { payment_status: string; payment_method?: string | null }) => {
  switch (a.payment_status) {
    case "paid": return a.payment_method ? `Paid · ${a.payment_method.toUpperCase()}` : "Paid";
    case "pay_at_clinic": return "Due at clinic";
    case "refunded": return "Refunded";
    default: return "Unpaid";
  }
};

const statusConfig: Record<string, { bg: string; dot: string; label: string }> = {
  pending: { bg: "bg-warning/10 text-warning border-l-warning", dot: "bg-warning", label: "Pending" },
  completed: { bg: "bg-royal/10 text-royal border-l-royal", dot: "bg-royal", label: "Completed" },
  cancelled: { bg: "bg-destructive/10 text-destructive border-l-destructive", dot: "bg-destructive", label: "Cancelled" },
  no_show: { bg: "bg-muted text-muted-foreground border-l-muted-foreground", dot: "bg-muted-foreground", label: "No Show" },
};

// Every status can be corrected to any other status (no permanent lock) — a
// doctor can fix a mis-click (e.g. Completed when it should've been No Show)
// at any time. Statuses below are "final" only in the sense that leaving one
// asks for confirmation first, since Completed already has an invoice/revenue
// entry generated for it (see ensureInvoiceForAppointment). Decision: status
// correction only ever updates the appointment row itself — an invoice already
// generated at completion time is intentionally left untouched (historical
// fact), matching how invoices already survive appointment deletion.
const FINAL_STATUSES = new Set(["completed", "no_show", "cancelled"]);
const STATUS_ACTIONS: Record<string, { label: string; tone: string; requiresCancelPermission?: boolean }> = {
  pending: { label: "Reopen as Pending", tone: "bg-warning text-warning-foreground hover:bg-warning/90" },
  completed: { label: "Complete", tone: "bg-royal text-white hover:bg-royal/90" },
  no_show: { label: "No Show", tone: "bg-muted-foreground text-white hover:bg-muted-foreground/90" },
  cancelled: { label: "Cancel", tone: "bg-destructive text-white hover:bg-destructive/90", requiresCancelPermission: true },
};

const AppointmentsPage = () => {
  const navigate = useNavigate();
  const { profile, isStaff, can } = useProfile();
  const { nearCap, appointmentsUsed, appointmentsCap } = usePlanAccess();
  const { accessLevel: trialAccessLevel } = useTrialStatus();
  const writeDisabled = trialAccessLevel === "grace";
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ total: 0, pending: 0, completed: 0, cancelled: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFilterActive, setDateFilterActive] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [datesWithAppointments, setDatesWithAppointments] = useState<Set<string>>(new Set());
  const blankNewAppt = () => ({
    patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic",
    date: clinicToday(), time_slot: WALK_IN_TIME,
    amount: defaultAppointmentAmount(profile?.consultation_fee),
    status: "pending",
  });
  const [newAppt, setNewAppt] = useState(blankNewAppt);
  // Walk-ins pay on the spot, so the booking dialog records the payment by default.
  const [countersPaid, setCountersPaid] = useState(true);
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [view, setView] = useState<"list" | "queue">("list");
  const handleNewOpenChange = (open: boolean) => {
    setShowNew(open);
    if (open) { setNewAppt(blankNewAppt()); setCountersPaid(true); setPayMethod("cash"); }
  };
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time_slot: "" });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [slotConflict, setSlotConflict] = useState<{ time: string } | null>(null);
  const [confirmingChange, setConfirmingChange] = useState<{ appointment: Appointment; nextStatus: string } | null>(null);

  // Keep detail view in sync with the latest data after mutations
  useEffect(() => {
    if (!viewing) return;
    const fresh = appointments.find((a) => a.id === viewing.id);
    if (fresh && fresh !== viewing) setViewing(fresh);
    // The row left this list (e.g. filtered out after a status change): don't leave a
    // stale sheet with buttons that act on old data.
    if (!fresh) setViewing(null);
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

  // Overdue appointments (never-called -> no-show, called-but-never-closed -> completed)
  // are closed by the nightly expire_overdue_appointments() job on the server. The page
  // used to do it from whichever browser opened it, using that browser's clock, which
  // could flip a patient who was still waiting to "no show".

  const load = async () => {
    if (!profile) return;
    const seq = ++loadSeq.current;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("appointments").select("*", { count: "exact" }).eq("doctor_id", profile.id);
    // "Pending" means pending OR confirmed, matching the Pending summary tile.
    if (statusFilter === "pending") q = q.in("status", ["pending", "confirmed"] as any);
    else if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (dateFilterActive) q = q.eq("date", format(selectedDate, "yyyy-MM-dd"));
    const term = sanitizeSearchTerm(debouncedSearch);
    if (term) q = q.or(`patient_name.ilike.%${term}%,service_name.ilike.%${term}%`);
    q = q
      .order("date", { ascending: true })
      .order("sort_time", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to);
    const { data, count, error } = await q;
    // A slower, older response must not overwrite a newer one.
    if (seq !== loadSeq.current) return;
    if (error) { console.error("Appointments load failed:", error.message); return; }
    setAppointments((data || []) as Appointment[]);
    setTotalCount(count ?? 0);
  };
  // The realtime listener is created once; it must always call the CURRENT load
  // (current page, filter and date), not the first render's.
  const loadRef = useRef<() => Promise<void>>(async () => {});
  loadRef.current = load;
  const loadSeq = useRef(0);

  const loadStatusCountsRef = useRef<() => Promise<void>>(async () => {});
  const loadDatesRef = useRef<() => Promise<void>>(async () => {});
  const countsSeq = useRef(0);
  const loadStatusCounts = async () => {
    if (!profile) return;
    const seq = ++countsSeq.current;
    const base = () => {
      let q = supabase.from("appointments").select("*", { count: "exact", head: true }).eq("doctor_id", profile.id);
      if (dateFilterActive) q = q.eq("date", format(selectedDate, "yyyy-MM-dd"));
      return q;
    };
    const results = await Promise.all([
      base(),
      base().in("status", ["pending", "confirmed"]),
      base().eq("status", "completed"),
      base().eq("status", "cancelled"),
    ]);
    // A newer request already answered, or one failed: keep the numbers on screen rather
    // than showing zeros.
    if (seq !== countsSeq.current || results.some((r) => r.error)) return;
    const [total, pending, completed, cancelled] = results.map((r) => r.count ?? 0);
    setStatusCounts({ total, pending, completed, cancelled });
  };

  // Reset to page 1 whenever the result set changes shape underneath the pager.
  useEffect(() => { setPage(1); }, [statusFilter, selectedDate, dateFilterActive, debouncedSearch]);

  useEffect(() => { load(); }, [profile, statusFilter, selectedDate, dateFilterActive, debouncedSearch, page]);
  loadStatusCountsRef.current = loadStatusCounts;
  useEffect(() => { loadStatusCounts(); }, [profile, selectedDate, dateFilterActive]);

  // If the current page no longer exists (e.g. after deleting the last row
  // on it), step back to the last valid page.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [totalCount, page]);

  // Load distinct dates that have any appointments (for calendar dot indicators)
  const loadDatesWithAppointments = async () => {
    if (!profile) return;
    // Page through the dates: a single select stops at 1000 rows and would hide the rest.
    const dates = new Set<string>();
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase
        .from("appointments").select("date").eq("doctor_id", profile.id).range(start, start + 999);
      if (error || !data) break;
      data.forEach((r: any) => dates.add(r.date));
      if (data.length < 1000) break;
    }
    setDatesWithAppointments(dates);
  };
  loadDatesRef.current = loadDatesWithAppointments;

  useEffect(() => { loadDatesWithAppointments(); }, [profile]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const prevView = useRef(view);
  useEffect(() => {
    // Coming back from the queue tab: the list was not refreshed while it was hidden.
    if (prevView.current === "queue" && view === "list") { loadRef.current(); loadStatusCountsRef.current(); }
    prevView.current = view;
  }, [view]);

  useEffect(() => {
    if (!profile) return;
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    let datesTimer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      // One staff action fires several row events: coalesce them into one reload. The queue
      // tab has its own live view, so the list is not refetched behind it.
      clearTimeout(listTimer);
      listTimer = setTimeout(() => {
        if (viewRef.current === "queue") return;
        loadRef.current();
        loadStatusCountsRef.current();
      }, 300);
      // The calendar dots page through every appointment date, so refresh them at most
      // every few seconds instead of once per event.
      if (!datesTimer) datesTimer = setTimeout(() => { datesTimer = undefined; loadDatesRef.current(); }, 4000);
    };
    const channel = supabase.channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, onChange)
      .subscribe();
    return () => {
      clearTimeout(listTimer);
      clearTimeout(datesTimer);
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // BUG-014: status can be changed at any time. The patient record, the visit count and
  // the invoice are handled by the database when an appointment becomes completed
  // (sync_appointment_patient / invoice_on_appointment_billable), so the same result
  // follows whichever screen changes the status, and a double click cannot count twice.
  const syncZoom = async (appointmentId: string, action: "update" | "delete") => {
    try {
      const { error } = await supabase.functions.invoke("create-zoom-meeting", {
        body: { appointment_id: appointmentId, action },
      });
      if (error) toast.warning("The Zoom meeting could not be updated. Please check it in Zoom.");
    } catch (e) {
      console.warn(`Zoom ${action} sync failed`, e);
    }
  };

  const statusBusy = useRef(false);
  const updateStatus = async (id: string, status: string) => {
    if (statusBusy.current) return;
    statusBusy.current = true;
    try {
      const current = appointments.find((a) => a.id === id);
      // .select() so a row the policies silently refused to touch shows up as "0 rows".
      const { data, error } = await supabase.from("appointments").update({ status: status as any }).eq("id", id).select("id");
      if (error || !data || data.length === 0) {
        toast.error(error?.message?.includes("Not authorized") ? "You don't have permission to change this appointment." : "Could not update the appointment.");
        load();
        return;
      }
      // Delete Zoom meeting if the appointment is cancelled or a no-show.
      if ((status === "cancelled" || status === "no_show") && current?.zoom_meeting_id) {
        await syncZoom(id, "delete");
      }
      await load();
      toast.success(`Marked ${status.replace("_", " ")}`);
    } finally {
      statusBusy.current = false;
    }
  };

  const markPaid = async (id: string, method: string): Promise<boolean> => {
    const { data, error } = await (supabase as any).rpc("queue_action", { _action: "mark_paid", _appointment_id: id, _payment_method: method });
    if (error || !data?.ok) { toast.error(queueErrorMessage(data?.error)); return false; }
    toast.success("Payment recorded");
    load();
    return true;
  };

  // An invoice exists only for money actually received, so finishing a visit that has not
  // been paid asks how it was paid (or lets the doctor bill later).
  const [payPrompt, setPayPrompt] = useState<Appointment | null>(null);
  const completeWithPayment = async (method: string | null) => {
    if (!payPrompt) return;
    const target = payPrompt;
    setPayPrompt(null);
    if (method && !(await markPaid(target.id, method))) return;
    await updateStatus(target.id, "completed");
  };

  // Shared by both the card kebab menu and the detail panel so the two
  // entry points never diverge — both list every other valid status as an
  // available action, filtered to what this user is allowed to do.
  const getStatusOptions = (currentStatus: string) =>
    Object.keys(STATUS_ACTIONS)
      .filter((s) => s !== currentStatus)
      .filter((s) => (STATUS_ACTIONS[s].requiresCancelPermission ? (can("appointments.edit") || can("appointments.cancel")) : can("appointments.edit")))
      .map((s) => ({ next: s, ...STATUS_ACTIONS[s] }));

  // Leaving a final state needs a confirmation step since Completed already
  // has an invoice generated for it (see FINAL_STATUSES comment above).
  const requestStatusChange = (appt: Appointment, nextStatus: string) => {
    if (FINAL_STATUSES.has(appt.status)) {
      setConfirmingChange({ appointment: appt, nextStatus });
    } else if (nextStatus === "completed" && isUnpaid(appt)) {
      setPayPrompt(appt);
    } else {
      updateStatus(appt.id, nextStatus);
    }
  };

  const deleteAppointment = async (id: string) => {
    const current = appointments.find((a) => a.id === id);
    if (current?.zoom_meeting_id) {
      await syncZoom(id, "delete");
    }
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) { toast.error("Could not delete appointment"); return; }
    toast.success("Appointment deleted");
    load();
  };

  const openReschedule = (a: Appointment) => {
    setRescheduling(a);
    setRescheduleForm({ date: a.date, time_slot: a.time_slot ?? "" });
  };

  const submitReschedule = async () => {
    if (!rescheduling) return;
    if (!rescheduleForm.time_slot) { toast.error("Please select a time slot"); return; }
    const { error } = await supabase.from("appointments").update({
      date: rescheduleForm.date, time_slot: rescheduleForm.time_slot,
      reschedule_count: (rescheduling.reschedule_count ?? 0) + 1,
    } as any).eq("id", rescheduling.id);
    if (error) { toast.error(error.message.includes("SLOT_FULL") ? "That slot is full." : "Could not reschedule."); return; }
    // Keep Zoom in sync when the underlying appointment moves.
    if (rescheduling.zoom_meeting_id) {
      await syncZoom(rescheduling.id, "update");
    }
    setRescheduling(null);
    load();
    toast.success("Appointment rescheduled");
  };


  const addAppointment = async () => {
    if (!profile || adding) return;
    if (!newAppt.patient_name.trim()) { toast.error("Patient name is required"); return; }
    if (newAppt.patient_phone.trim() && !isValidIndianPhone(newAppt.patient_phone)) { toast.error(phoneErrorMessage); return; }
    if (newAppt.amount < 0) { toast.error("Amount cannot be negative"); return; }
    const isWalkIn = newAppt.time_slot === WALK_IN_TIME;
    // Block past date / time for scheduled appointments. Walk-ins have no scheduled time.
    if (!isWalkIn) {
      // The clinic runs on Indian time whatever the browser's zone is.
      const apptTs = new Date(`${newAppt.date}T${newAppt.time_slot}:00+05:30`);
      if (apptTs.getTime() < Date.now()) { toast.error("Cannot book an appointment for a past date or time slot."); return; }
    }
    const normalizedPhone = normalizeIndianPhone(newAppt.patient_phone);

    // Locked synchronously (state updates are not instant), so a quick double click cannot
    // insert two bookings.
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    try {
      if (!isWalkIn) {
        const { count: taken, error: takenError } = await supabase
          .from("appointments").select("*", { count: "exact", head: true })
          .eq("doctor_id", profile.id).eq("date", newAppt.date).eq("time_slot", newAppt.time_slot)
          .eq("appointment_type", "clinic")
          .neq("status", "cancelled");
        if (takenError) { toast.error("Could not check that slot. Please try again."); return; }
        if ((taken ?? 0) >= 1) {
          setSlotConflict({ time: newAppt.time_slot });
          return;
        }
      }

      const token = generateBookingToken();
      const { status, time_slot, ...rest } = newAppt;
      const serviceName = rest.service_name.trim() || "Clinic Visit";
      const paidNow = countersPaid && Number(rest.amount) > 0;
      const { error } = await supabase.from("appointments").insert({
        doctor_id: profile.id, ...rest, time_slot: isWalkIn ? null : time_slot, service_name: serviceName,
        appointment_type: "clinic",
        patient_phone: normalizedPhone,
        token_number: token, status: status as any,
        payment_status: (paidNow ? "paid" : "pending") as any,
        ...(paidNow ? { payment_method: payMethod, paid_at: new Date().toISOString() } : {}),
      } as any);
      if (error) {
        if (error.message.includes("MONTHLY_APPOINTMENT_CAP_REACHED")) {
          toast.error("You've reached your plan's monthly appointment limit. Upgrade to Premium for unlimited appointments.");
        } else if (error.message.includes("SLOT_FULL")) {
          setSlotConflict({ time: newAppt.time_slot });
        } else if (error.message.includes("SLOT_IN_PAST")) {
          toast.error("Cannot book an appointment for a past date or time slot.");
        } else {
          toast.error("Could not add appointment");
        }
        return;
      }

      // The database creates the patient record when staff book (so walk-ins show up in
      // Patients straight away) and counts the visit once, when the appointment completes.
      setShowNew(false);
      setSlotConflict(null);
      setNewAppt(blankNewAppt());
      load();
      toast.success("Appointment added");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };


  // Search, status and date filtering now happen server-side in load(), so
  // the current page's rows are already the filtered/paginated result set.
  const filtered = appointments;

  const allTimeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];
  const todayStr = clinicToday();
  const timeSlots = [
    ...(newAppt.date === todayStr
      ? allTimeSlots.filter((t) => new Date(`${todayStr}T${t}:00+05:30`).getTime() > Date.now())
      : allTimeSlots),
    WALK_IN_TIME,
  ];

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
        {can("appointments.create") && (
        <Dialog open={showNew} onOpenChange={handleNewOpenChange}>
          <DialogTrigger asChild>
            <Button
              className="bg-royal hover:bg-royal/90"
              disabled={writeDisabled}
              title={writeDisabled ? "Upgrade to continue editing" : undefined}
            >
              <Plus className="h-4 w-4 mr-1" /> New Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Add Appointment</DialogTitle></DialogHeader>
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-name" className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
                  <Input id="new-appt-name" placeholder="Full name" value={newAppt.patient_name} onChange={(e) => setNewAppt({ ...newAppt, patient_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-phone" className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  <PhoneInput id="new-appt-phone" value={newAppt.patient_phone} onChange={(e) => setNewAppt({ ...newAppt, patient_phone: e.target.value })} placeholder="Phone number (optional)" className="h-10" />
                  {newAppt.patient_phone && !isValidIndianPhone(newAppt.patient_phone) && (
                    <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
                  )}
                  {!newAppt.patient_phone.trim() && (
                    <p className="text-[11px] text-muted-foreground">Add a phone number so repeat visits join the same patient record and the patient can follow the queue.</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-appt-service">Service <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <Input id="new-appt-service" value={newAppt.service_name} onChange={(e) => setNewAppt({ ...newAppt, service_name: e.target.value })} placeholder="e.g. Clinic Visit" className="h-10" />
              </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-appt-date">Date</Label>
                  <Input id="new-appt-date" type="date" min={todayStr} value={newAppt.date} onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Time Slot</Label>
                  <Select value={newAppt.time_slot} onValueChange={(v) => setNewAppt({ ...newAppt, time_slot: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {timeSlots.map(t => <SelectItem key={t} value={t}>{t === WALK_IN_TIME ? "Walk-in" : t}</SelectItem>)}
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
                  <AmountInput placeholder="0" value={newAppt.amount === 0 ? "" : newAppt.amount} onChange={(e) => setNewAppt({ ...newAppt, amount: e.target.value === "" ? 0 : Number(e.target.value) })} className="h-10" />
                </div>
              </div>
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="counter-paid" checked={countersPaid && newAppt.amount > 0} disabled={newAppt.amount <= 0} onCheckedChange={(v) => setCountersPaid(v === true)} />
                  <Label htmlFor="counter-paid" className="text-sm font-normal cursor-pointer">Payment received at the counter</Label>
                </div>
                {countersPaid && newAppt.amount > 0 && (
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger className="h-9" aria-label="Payment method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button onClick={() => addAppointment()} disabled={writeDisabled || adding} className="w-full h-10 bg-royal hover:bg-royal/90">{adding ? "Adding…" : "Add Appointment"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/50" role="group" aria-label="Appointments view">
        <Button aria-pressed={view === "list"} size="sm" variant={view === "list" ? "default" : "ghost"} className={`h-8 ${view === "list" ? "bg-royal hover:bg-royal/90" : ""}`} onClick={() => setView("list")}>
          <ListChecks className="h-4 w-4 mr-1" /> All appointments
        </Button>
        <Button aria-pressed={view === "queue"} size="sm" variant={view === "queue" ? "default" : "ghost"} className={`h-8 ${view === "queue" ? "bg-royal hover:bg-royal/90" : ""}`} onClick={() => setView("queue")}>
          <Users className="h-4 w-4 mr-1" /> Live queue
        </Button>
      </div>

      {view === "queue" && profile && (
        <LiveQueue doctorId={profile.id} doctorSlug={(profile as any).slug} canAct={can("appointments.edit")} writeDisabled={writeDisabled} />
      )}

      {view === "list" && (<>
      {nearCap && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-foreground">
            You've used <strong>{appointmentsUsed}/{appointmentsCap}</strong> appointments this month — upgrade to Premium for unlimited.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/settings?tab=subscription")} className="border-warning/40 text-foreground hover:bg-warning/20">
            Upgrade Plan
          </Button>
        </div>
      )}

      <DateFilter
        selectedDate={selectedDate}
        dateFilterActive={dateFilterActive}
        calendarOpen={calendarOpen}
        onCalendarOpenChange={setCalendarOpen}
        onDateChange={(date) => { setSelectedDate(date); setDateFilterActive(true); setCalendarOpen(false); }}
        onClear={() => setDateFilterActive(false)}
        datesWithRecords={datesWithAppointments}
        activeLabel="Showing"
        inactiveLabel="Showing all upcoming appointments"
      />


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
              <span>{selectedIds.size} of {filtered.length} selected on this page</span>
            ) : (
              <span>{totalCount} appointment{totalCount === 1 ? "" : "s"}{totalCount > filtered.length ? ` · page ${page}` : ""}</span>
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
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length} on this page`}
              </Button>
            )}
            {!isStaff && (
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
            )}
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
          {filtered.map((a, index) => {
            const sc = statusConfig[a.status] || statusConfig.pending;
            const isSelected = selectedIds.has(a.id);
            const borderColor = sc.bg.split(" ").find((c) => c.startsWith("border-l-")) || "";
            const serialNumber = appointmentSerialNumber(index, page, PAGE_SIZE);
            return (
              <Card
                key={a.id}
                className={`relative border-border/60 shadow-none border-l-4 ${borderColor} transition-all ${
                  selectMode ? "cursor-pointer" : "cursor-pointer hover:shadow-md"
                } ${isSelected ? "bg-royal/5 ring-2 ring-royal ring-offset-2" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${selectMode ? "Select" : "Open"} appointment for ${a.patient_name}`}
                onClick={selectMode ? () => toggleSelected(a.id) : () => setViewing(a)}
                onKeyDown={(e) => {
                  // Only when the card itself has focus: the menu and checkbox inside keep their own keys.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (selectMode) toggleSelected(a.id); else setViewing(a);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-semibold text-muted-foreground" aria-label={`Appointment ${serialNumber}`}>
                        #{serialNumber}
                      </span>
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
                          {a.queue_number != null && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-royal/10 text-royal text-[10px] font-semibold" title="Queue number">Q{a.queue_number}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{a.service_name}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.time_slot ? a.time_slot.slice(0, 5) : "Walk-in"}</span>
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
                      {!selectMode && a.appointment_type === "online" && a.status !== "cancelled" && a.status !== "completed" && (
                        <Badge variant="outline" className="text-[10px] bg-teal/10 text-teal border-teal/20">
                          <Video className="h-3 w-3 mr-1" /> Video call
                        </Badge>
                      )}
                      <span className="font-semibold text-sm text-foreground">₹{a.amount}</span>
                      {!selectMode && getStatusOptions(a.status).length > 0 && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Change status for ${a.patient_name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {getStatusOptions(a.status).map((o) => (
                                <DropdownMenuItem key={o.next} onClick={() => requestStatusChange(a, o.next)}>
                                  {o.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <PaginationBar page={page} totalCount={totalCount} onPageChange={setPage} />
      )}
      </>)}

      {/* Appointment Detail Sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {viewing && (() => {
            const sc = statusConfig[viewing.status] || statusConfig.pending;
            const options = getStatusOptions(viewing.status);
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
                        {viewing.patient_phone ? (
                          <a href={`tel:${viewing.patient_phone}`} className="flex items-center gap-1 hover:text-royal transition-colors">
                            <Phone className="h-3 w-3" /> {viewing.patient_phone}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> —</span>
                        )}
                        {viewing.queue_number != null && <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-royal/10 text-royal text-[10px] font-semibold" title="Queue number">Q{viewing.queue_number}</span>}
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
                            onClick={() => requestStatusChange(viewing, o.next)}
                          >
                            {o.label}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">You don't have permission to change this appointment's status.</p>
                    )}
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Date", value: viewing.date },
                      { label: "Time", value: viewing.time_slot ? viewing.time_slot.slice(0, 5) : "Walk-in" },
                      { label: "Service", value: viewing.service_name },
                      { label: "Type", value: viewing.appointment_type },
                      { label: "Amount", value: `₹${viewing.amount}` },
                      { label: "Payment", value: paymentLabel(viewing) },
                    ].map((item) => (
                      <div key={item.label} className="bg-secondary rounded-xl p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">{item.label}</div>
                        <div className="font-medium text-sm text-foreground capitalize truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {can("appointments.edit") && ["pending", "pay_at_clinic"].includes(viewing.payment_status) && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground uppercase tracking-wide">Collect payment (₹{viewing.amount})</div>
                      <div className="flex flex-wrap gap-2">
                        {PAYMENT_METHODS.map((m) => (
                          <Button key={m.value} size="sm" variant="outline" className="h-9 text-xs" disabled={writeDisabled} onClick={() => markPaid(viewing.id, m.value)}>
                            Paid · {m.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewing.appointment_type === "online" && (
                    <VideoConsultationCard
                      appointmentId={viewing.id}
                      date={viewing.date}
                      timeSlot={viewing.time_slot}
                      role="doctor"
                      status={viewing.status}
                      hasMeeting={!!viewing.zoom_join_url}
                      onCreated={load}
                    />
                  )}

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
                  {viewing.status !== "completed" && viewing.status !== "cancelled" && can("appointments.edit") && (
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
            <Button onClick={submitReschedule} disabled={writeDisabled} className="w-full h-10 bg-royal hover:bg-royal/90">Save New Slot</Button>
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

      {/* Payment prompt when finishing an unpaid visit */}
      <Dialog open={!!payPrompt} onOpenChange={(o) => !o && setPayPrompt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect ₹{payPrompt?.amount}</DialogTitle>
            <DialogDescription>{payPrompt?.patient_name} has not paid yet. How did they pay?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Button key={m.value} variant="outline" onClick={() => completeWithPayment(m.value)}>{m.label}</Button>
            ))}
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="ghost" size="sm" onClick={() => completeWithPayment(null)}>Complete without payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status-change confirmation when leaving a final state */}
      <AlertDialog open={!!confirmingChange} onOpenChange={(o) => !o && setConfirmingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change status from {confirmingChange && (statusConfig[confirmingChange.appointment.status]?.label ?? confirmingChange.appointment.status)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingChange?.appointment.status === "completed"
                ? "This appointment is marked Completed and may already have an invoice counted in your revenue. Changing its status now will NOT delete or modify that invoice — it stays as a historical record. Are you sure you want to change the status?"
                : "This appointment is already marked as a final status. Are you sure you want to change it?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingChange(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingChange) updateStatus(confirmingChange.appointment.id, confirmingChange.nextStatus);
                setConfirmingChange(null);
              }}
            >
              Yes, change status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Occupied-slot notice */}
      <AlertDialog open={!!slotConflict} onOpenChange={(o) => !o && setSlotConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-warning"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <AlertDialogTitle className="text-center">Time Slot Already Booked</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              This time slot ({slotConflict?.time}) already has an appointment scheduled. Please choose another time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setSlotConflict(null)}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              Choose Another Time
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
