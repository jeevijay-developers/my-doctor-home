import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2, CheckSquare, X, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string;
};

const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "",
  date: format(new Date(), "yyyy-MM-dd"),
};

const PrescriptionsPage = () => {
  const { profile } = useProfile();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [patients, setPatients] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [form, setForm] = useState(emptyForm);

  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");

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

  // Keep detail view in sync with latest data
  useEffect(() => {
    if (!viewing) return;
    const fresh = prescriptions.find((p) => p.id === viewing.id);
    if (fresh && fresh !== viewing) setViewing(fresh);
  }, [prescriptions]);

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
    setForm(emptyForm);
    load();
    toast.success("Prescription added");
  };

  const saveEdit = async () => {
    if (!viewing) return;
    if (!editForm.patient_name) { toast.error("Patient name is required"); return; }
    const { error } = await supabase.from("prescriptions").update({
      patient_id: editForm.patient_id || null,
      patient_name: editForm.patient_name,
      diagnosis: editForm.diagnosis || null,
      medications: editForm.medications || null,
      notes: editForm.notes || null,
      date: editForm.date,
    }).eq("id", viewing.id);
    if (error) { toast.error("Could not save changes"); return; }
    toast.success("Prescription updated");
    setEditing(false);
    load();
  };

  const startEdit = () => {
    if (!viewing) return;
    setEditForm({
      patient_name: viewing.patient_name,
      patient_id: viewing.patient_id || "",
      diagnosis: viewing.diagnosis || "",
      medications: viewing.medications || "",
      notes: viewing.notes || "",
      date: viewing.date,
    });
    setEditing(true);
  };

  const selectPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (p) setForm({ ...form, patient_id: p.id, patient_name: p.name });
  };
  const selectEditPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (p) setEditForm({ ...editForm, patient_id: p.id, patient_name: p.name });
  };

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
    const { error } = await supabase.from("prescriptions").delete().in("id", ids);
    if (error) { toast.error("Could not delete prescriptions"); return; }
    toast.success(`${ids.length} prescription${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    exitSelectMode();
    load();
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

      <div className={`transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search by patient or diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} prescription{filtered.length === 1 ? "" : "s"}</span>
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
                  else setSelectedIds(new Set(filtered.map((p) => p.id)));
                }}
              >
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length}`}
              </Button>
            )}
            <Button
              size="sm"
              variant={selectMode ? "secondary" : "outline"}
              className="h-8 text-xs"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              aria-pressed={selectMode}
            >
              {selectMode ? (<><X className="h-3.5 w-3.5 mr-1" /> Done</>) : (<><CheckSquare className="h-3.5 w-3.5 mr-1" /> Select</>)}
            </Button>
          </div>
        </div>
      )}

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
          {filtered.map((rx) => {
            const isSelected = selectedIds.has(rx.id);
            return (
              <Card
                key={rx.id}
                className={`border-border/60 shadow-none border-l-4 border-l-ai-purple/40 transition-all cursor-pointer ${
                  selectMode ? "" : "hover:shadow-md"
                } ${isSelected ? "bg-royal/5 ring-2 ring-royal ring-offset-2" : ""}`}
                onClick={selectMode ? () => toggleSelected(rx.id) : () => setViewing(rx)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {selectMode && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelected(rx.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select prescription for ${rx.patient_name}`}
                        className="h-5 w-5 rounded-full mt-1"
                      />
                    )}
                    <div className="w-10 h-10 rounded-full bg-ai-purple/10 flex items-center justify-center text-sm font-bold text-ai-purple flex-shrink-0">
                      {rx.patient_name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{rx.patient_name}</h3>
                        <Badge variant="secondary" className="text-[10px] bg-secondary">{rx.date}</Badge>
                      </div>
                      {rx.diagnosis && (
                        <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                          <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0" />
                          <span className="truncate">{rx.diagnosis}</span>
                        </div>
                      )}
                      {rx.medications && (
                        <div className="flex items-start gap-1.5 mt-1 text-sm text-muted-foreground">
                          <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2 whitespace-pre-line">{rx.medications}</span>
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

      {/* Prescription detail sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-ai-purple/10 flex items-center justify-center text-base font-bold text-ai-purple flex-shrink-0">
                    {viewing.patient_name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-primary text-lg truncate">{viewing.patient_name}</SheetTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">Issued {viewing.date}</div>
                  </div>
                </div>
              </SheetHeader>

              {!editing ? (
                <div className="mt-6 space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <p className="text-sm text-foreground mt-1">{viewing.diagnosis || <span className="text-muted-foreground italic">Not specified</span>}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</Label>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-line">{viewing.medications || <span className="text-muted-foreground italic">None recorded</span>}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-line">{viewing.notes || <span className="text-muted-foreground italic">No notes</span>}</p>
                  </div>
                  <div className="pt-2">
                    <Button onClick={startEdit} className="w-full h-10 bg-royal hover:bg-royal/90">
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {patients.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Linked Patient</Label>
                      <Select value={editForm.patient_id} onValueChange={(v) => selectEditPatient(v)}>
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
                      <Input value={editForm.patient_name} onChange={(e) => setEditForm({ ...editForm, patient_name: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</Label>
                      <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <Input value={editForm.diagnosis} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</Label>
                    <Textarea value={editForm.medications} onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-10" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={saveEdit} className="flex-1 h-10 bg-royal hover:bg-royal/90">Save Changes</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} prescription{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>Clear</Button>
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
            <AlertDialogTitle>Delete {selectedIds.size} prescription{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. These prescription records will be permanently removed.
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

export default PrescriptionsPage;
