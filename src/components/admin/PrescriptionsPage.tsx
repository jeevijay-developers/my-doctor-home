import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string;
};

const PrescriptionsPage = () => {
  const { profile } = useProfile();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [patients, setPatients] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [form, setForm] = useState({
    patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "",
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("prescriptions")
      .select("*")
      .eq("doctor_id", profile.id)
      .order("date", { ascending: false });
    setPrescriptions((data || []) as Prescription[]);
  };

  const loadPatients = async () => {
    if (!profile) return;
    const { data } = await supabase.from("patients").select("id, name, phone").eq("doctor_id", profile.id).order("name");
    setPatients(data || []);
  };

  useEffect(() => { load(); loadPatients(); }, [profile]);

  const addPrescription = async () => {
    if (!profile || !form.patient_name) { toast.error("Patient name is required"); return; }
    await supabase.from("prescriptions").insert({
      doctor_id: profile.id,
      patient_id: form.patient_id || null,
      patient_name: form.patient_name,
      diagnosis: form.diagnosis || null,
      medications: form.medications || null,
      notes: form.notes || null,
      date: form.date,
    });
    setShowNew(false);
    setForm({ patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "", date: format(new Date(), "yyyy-MM-dd") });
    load();
    toast.success("Prescription added");
  };

  const deletePrescription = async (id: string) => {
    await supabase.from("prescriptions").delete().eq("id", id);
    load();
    toast.success("Prescription deleted");
  };

  const selectPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (p) setForm({ ...form, patient_id: p.id, patient_name: p.name });
  };

  const filtered = prescriptions.filter(p =>
    p.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.diagnosis || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-ai-purple" /> Prescriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{prescriptions.length} total records</p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button className="bg-royal hover:bg-royal/90"><Plus className="h-4 w-4 mr-1" /> New Prescription</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Add Prescription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {patients.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Select Existing Patient</Label>
                  <Select value={form.patient_id} onValueChange={(v) => selectPatient(v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="-- Or type name below --" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
                  <Input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Acute bronchitis" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</Label>
                <Textarea value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} placeholder="List medications, dosage, frequency..." rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={2} />
              </div>
              <Button onClick={addPrescription} className="w-full h-10 bg-royal hover:bg-royal/90">Save Prescription</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-10" placeholder="Search by patient or diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-ai-purple/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No prescriptions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add your first prescription record</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((rx) => (
            <Card key={rx.id} className="border-border/60 shadow-none border-l-4 border-l-ai-purple/40 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-ai-purple/10 flex items-center justify-center text-sm font-bold text-ai-purple flex-shrink-0">
                      {rx.patient_name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{rx.patient_name}</h3>
                        <Badge variant="secondary" className="text-[10px] bg-secondary">{rx.date}</Badge>
                      </div>
                      {rx.diagnosis && (
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                          <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0" />
                          <span>{rx.diagnosis}</span>
                        </div>
                      )}
                      {rx.medications && (
                        <div className="flex items-start gap-1.5 mt-1 text-sm text-muted-foreground">
                          <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" />
                          <span className="whitespace-pre-line">{rx.medications}</span>
                        </div>
                      )}
                      {rx.notes && (
                        <p className="text-xs text-muted-foreground/70 mt-1.5 italic">{rx.notes}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive/60 hover:text-destructive h-8 w-8 p-0 flex-shrink-0" onClick={() => deletePrescription(rx.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PrescriptionsPage;
