import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CalendarCheck, Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Appointment = {
  id: string; patient_name: string; patient_phone: string; patient_age: number | null;
  patient_gender: string | null; service_name: string; appointment_type: string;
  date: string; time_slot: string; status: string; payment_status: string;
  amount: number; token_number: string | null; chief_complaint: string | null; notes: string | null;
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  confirmed: "bg-success/10 text-success",
  completed: "bg-royal/10 text-royal",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

const AppointmentsPage = () => {
  const { profile } = useProfile();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [newAppt, setNewAppt] = useState({
    patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic",
    date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0,
  });

  const load = async () => {
    if (!profile) return;
    let q = supabase.from("appointments").select("*").eq("doctor_id", profile.id).order("date", { ascending: false }).order("time_slot");
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    setAppointments((data || []) as Appointment[]);
  };

  useEffect(() => { load(); }, [profile, statusFilter]);

  // Realtime subscription
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("appointments").update({ status: status as any }).eq("id", id);
    load();
    toast({ title: `Appointment ${status}` });
  };

  const addAppointment = async () => {
    if (!profile || !newAppt.patient_name || !newAppt.service_name) return;
    const token = `T${Math.floor(Math.random() * 999) + 1}`;
    await supabase.from("appointments").insert({
      doctor_id: profile.id, ...newAppt, token_number: token, status: "confirmed" as any, payment_status: "pending" as any,
    });
    // Also add to patients
    const existing = await supabase.from("patients").select("id, total_visits").eq("doctor_id", profile.id).eq("phone", newAppt.patient_phone).single();
    if (existing.data) {
      await supabase.from("patients").update({ total_visits: (existing.data.total_visits || 0) + 1, last_visit: newAppt.date }).eq("id", existing.data.id);
    } else {
      await supabase.from("patients").insert({ doctor_id: profile.id, name: newAppt.patient_name, phone: newAppt.patient_phone, first_visit: newAppt.date, last_visit: newAppt.date, total_visits: 1 });
    }
    setShowNew(false);
    setNewAppt({ patient_name: "", patient_phone: "", service_name: "", appointment_type: "clinic", date: format(new Date(), "yyyy-MM-dd"), time_slot: "09:00", amount: 0 });
    load();
    toast({ title: "Appointment added" });
  };

  const filtered = appointments.filter((a) =>
    a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    a.service_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <CalendarCheck className="h-6 w-6 text-royal" /> Appointments
        </h1>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button className="bg-royal hover:bg-royal/90"><Plus className="h-4 w-4 mr-1" /> New Appointment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Appointment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Patient Name *</Label><Input value={newAppt.patient_name} onChange={(e) => setNewAppt({ ...newAppt, patient_name: e.target.value })} /></div>
              <div><Label>Phone *</Label><Input value={newAppt.patient_phone} onChange={(e) => setNewAppt({ ...newAppt, patient_phone: e.target.value })} placeholder="+91" /></div>
              <div><Label>Service *</Label><Input value={newAppt.service_name} onChange={(e) => setNewAppt({ ...newAppt, service_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Date</Label><Input type="date" value={newAppt.date} onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })} /></div>
                <div><Label>Time</Label><Input type="time" value={newAppt.time_slot} onChange={(e) => setNewAppt({ ...newAppt, time_slot: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={newAppt.appointment_type} onValueChange={(v) => setNewAppt({ ...newAppt, appointment_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="clinic">Clinic</SelectItem><SelectItem value="online">Online</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Amount (₹)</Label><Input type="number" value={newAppt.amount} onChange={(e) => setNewAppt({ ...newAppt, amount: Number(e.target.value) })} /></div>
              </div>
              <Button onClick={addAppointment} className="w-full bg-royal hover:bg-royal/90">Add Appointment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search patient or service..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="Status" /></SelectTrigger>
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

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date & Time</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No appointments yet.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="border-b border-border hover:bg-secondary/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">{a.patient_name}</div>
                    <div className="text-xs text-muted-foreground">{a.patient_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.service_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.date} • {a.time_slot?.slice(0, 5)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${a.appointment_type === "clinic" ? "bg-royal/10 text-royal" : "bg-accent/10 text-accent"}`}>{a.appointment_type}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">₹{a.amount}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${statusColors[a.status] || ""}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {a.status === "pending" && <Button size="sm" variant="ghost" className="text-success text-xs h-7" onClick={() => updateStatus(a.id, "confirmed")}>Confirm</Button>}
                      {(a.status === "confirmed" || a.status === "pending") && (
                        <>
                          <Button size="sm" variant="ghost" className="text-royal text-xs h-7" onClick={() => updateStatus(a.id, "completed")}>Complete</Button>
                          <Button size="sm" variant="ghost" className="text-destructive text-xs h-7" onClick={() => updateStatus(a.id, "cancelled")}>Cancel</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AppointmentsPage;
