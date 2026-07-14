import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Users, Plus, Search, Phone, Mail, Calendar, Activity, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Patient = {
  id: string; name: string; phone: string; email: string | null;
  age: number | null; gender: string | null; first_visit: string | null;
  last_visit: string | null; total_visits: number; notes: string | null;
};

const PatientsPage = () => {
  const { profile } = useProfile();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [patientAppts, setPatientAppts] = useState<any[]>([]);
  const [newPatient, setNewPatient] = useState({ name: "", phone: "", email: "", age: "", gender: "" });

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from("patients").select("*").eq("doctor_id", profile.id).order("last_visit", { ascending: false });
    setPatients((data || []) as Patient[]);
  };

  useEffect(() => { load(); }, [profile]);

  const addPatient = async () => {
    if (!profile || !newPatient.name || !newPatient.phone) return;
    await supabase.from("patients").insert({
      doctor_id: profile.id, name: newPatient.name, phone: newPatient.phone,
      email: newPatient.email || null, age: newPatient.age ? Number(newPatient.age) : null,
      gender: newPatient.gender || null,
    });
    setShowNew(false);
    setNewPatient({ name: "", phone: "", email: "", age: "", gender: "" });
    load();
    toast.success("Patient added");
  };

  const viewPatient = async (p: Patient) => {
    setSelected(p);
    if (profile) {
      const { data } = await supabase.from("appointments").select("*").eq("doctor_id", profile.id).eq("patient_phone", p.phone).order("date", { ascending: false });
      setPatientAppts(data || []);
    }
  };

  const exportPatients = () => {
    if (!patients.length) {
      toast.info("No patients to export");
      return;
    }
    const headers = ["Name", "Phone", "Email", "Age", "Gender", "First Visit", "Last Visit", "Total Visits", "Notes"];
    const rows = patients.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.phone,
      p.email ? `"${p.email.replace(/"/g, '""')}"` : "",
      p.age ?? "",
      p.gender ?? "",
      p.first_visit ?? "",
      p.last_visit ?? "",
      p.total_visits,
      p.notes ? `"${p.notes.replace(/"/g, '""')}"` : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patients-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${patients.length} patients to CSV`);
  };

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <Users className="h-6 w-6 text-teal" /> Patients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{patients.length} total patients</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPatients} className="h-10"><Download className="h-4 w-4 mr-1.5" /> Export CSV</Button>
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button className="bg-royal hover:bg-royal/90"><Plus className="h-4 w-4 mr-1" /> Add Patient</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Patient</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="+91" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input type="number" value={newPatient.age} onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={newPatient.gender} onValueChange={(v) => setNewPatient({ ...newPatient, gender: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={addPatient} className="w-full h-10 bg-royal hover:bg-royal/90">Add Patient</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-10" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Patient Grid Cards */}
      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-teal/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No patients yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add your first patient to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="border-border/60 shadow-none hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              onClick={() => viewPatient(p)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-teal/10 flex items-center justify-center text-lg font-bold text-teal flex-shrink-0">
                    {p.name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                      <Badge variant="secondary" className={`text-[10px] flex-shrink-0 ${
                        p.total_visits >= 10 ? "bg-success/10 text-success" :
                        p.total_visits >= 3 ? "bg-royal/10 text-royal" :
                        "bg-warning/10 text-warning"
                      }`}>
                        {p.total_visits >= 10 ? "Loyal" : p.total_visits >= 3 ? "Regular" : "New"} · {p.total_visits}
                      </Badge>
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> {p.phone}
                      </div>
                      {p.age && p.gender && (
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-3 w-3" /> {p.age}y, {p.gender}
                        </div>
                      )}
                      {p.last_visit && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" /> Last: {p.last_visit}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Patient Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-4 mt-2">
                  <div className="w-16 h-16 rounded-full bg-teal/10 flex items-center justify-center text-2xl font-bold text-teal">
                    {selected.name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div>
                    <SheetTitle className="text-primary text-lg">{selected.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selected.phone}</p>
                  </div>
                </div>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Info Cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Email", value: selected.email || "—", icon: Mail },
                    { label: "Age", value: selected.age ? `${selected.age} years` : "—", icon: Activity },
                    { label: "Gender", value: selected.gender || "—", icon: Users },
                    { label: "Total Visits", value: String(selected.total_visits), icon: Calendar },
                  ].map(item => (
                    <div key={item.label} className="bg-secondary rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                        <item.icon className="h-3.5 w-3.5" />
                        <span className="text-[11px]">{item.label}</span>
                      </div>
                      <div className="font-medium text-sm text-foreground">{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Visit History Timeline */}
                <div>
                  <h3 className="font-heading font-semibold text-foreground mb-3">Visit History</h3>
                  {patientAppts.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No appointment history.</p>
                  ) : (
                    <div className="space-y-1">
                      {patientAppts.map((a: any, i: number) => (
                        <div key={a.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              a.status === "completed" ? "bg-success" : a.status === "cancelled" ? "bg-destructive" : "bg-warning"
                            }`} />
                            {i < patientAppts.length - 1 && <div className="w-0.5 flex-1 bg-border min-h-[30px]" />}
                          </div>
                          <div className="pb-3 flex-1">
                            <div className="flex justify-between items-start">
                              <span className="font-medium text-sm text-foreground">{a.service_name}</span>
                              <span className="text-xs text-muted-foreground">{a.date}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{a.time_slot?.slice(0, 5)} · {a.appointment_type} · ₹{a.amount}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PatientsPage;
