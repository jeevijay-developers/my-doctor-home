import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Users, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

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
    toast({ title: "Patient added" });
  };

  const viewPatient = async (p: Patient) => {
    setSelected(p);
    if (profile) {
      const { data } = await supabase.from("appointments").select("*").eq("doctor_id", profile.id).eq("patient_phone", p.phone).order("date", { ascending: false });
      setPatientAppts(data || []);
    }
  };

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <Users className="h-6 w-6 text-accent" /> Patients
        </h1>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button className="bg-royal hover:bg-royal/90"><Plus className="h-4 w-4 mr-1" /> Add Patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Patient</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name *</Label><Input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} /></div>
              <div><Label>Phone *</Label><Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="+91" /></div>
              <div><Label>Email</Label><Input value={newPatient.email} onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Age</Label><Input type="number" value={newPatient.age} onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} /></div>
                <div>
                  <Label>Gender</Label>
                  <Select value={newPatient.gender} onValueChange={(v) => setNewPatient({ ...newPatient, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={addPatient} className="w-full bg-royal hover:bg-royal/90">Add Patient</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Age / Gender</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Visit</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total Visits</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No patients yet.</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-secondary/50 cursor-pointer" onClick={() => viewPatient(p)}>
                  <td className="px-4 py-3 font-medium text-primary">{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.phone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.age || "—"} / {p.gender || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.last_visit || "—"}</td>
                  <td className="px-4 py-3 font-medium text-primary">{p.total_visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-primary">{selected.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selected.phone}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selected.email || "—"}</span></div>
                  <div><span className="text-muted-foreground">Age:</span> <span className="font-medium">{selected.age || "—"}</span></div>
                  <div><span className="text-muted-foreground">Gender:</span> <span className="font-medium">{selected.gender || "—"}</span></div>
                  <div><span className="text-muted-foreground">First Visit:</span> <span className="font-medium">{selected.first_visit || "—"}</span></div>
                  <div><span className="text-muted-foreground">Total Visits:</span> <span className="font-medium">{selected.total_visits}</span></div>
                </div>
                <h3 className="font-heading font-semibold text-primary mt-6">Visit History</h3>
                {patientAppts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No appointment history.</p>
                ) : patientAppts.map((a: any) => (
                  <div key={a.id} className="p-3 rounded-lg bg-secondary text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-primary">{a.service_name}</span>
                      <span className="text-muted-foreground">{a.date}</span>
                    </div>
                    <div className="text-muted-foreground">{a.time_slot?.slice(0, 5)} • {a.appointment_type} • ₹{a.amount}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PatientsPage;
