import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Users, Plus, Search, Mail, Calendar, Activity, Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";

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
  const [deleting, setDeleting] = useState<Patient | null>(null);

  // Bulk selection state (mirrors AppointmentsPage pattern)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");

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
    if (!profile) return;
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    // Safe delete: appointments reference patients via patient_phone (no FK),
    // so appointment/invoice history is preserved. prescriptions.patient_id
    // has ON DELETE SET NULL, so linked prescriptions are retained too.
    const { error } = await supabase.from("patients").delete().in("id", ids).eq("doctor_id", profile.id);
    if (error) { toast.error("Could not delete patients"); return; }
    toast.success(`${ids.length} patient${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    exitSelectMode();
    load();
  };

  const confirmDelete = async () => {
    if (!deleting || !profile) return;
    const { error } = await supabase.from("patients").delete().eq("id", deleting.id).eq("doctor_id", profile.id);
    if (error) { toast.error("Could not delete patient"); return; }
    setDeleting(null);
    setSelected(null);
    load();
    toast.success("Patient deleted");
  };

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from("patients").select("*").eq("doctor_id", profile.id).order("last_visit", { ascending: false });
    setPatients((data || []) as Patient[]);
  };

  useEffect(() => { load(); }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`patients-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "patients", filter: `doctor_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  const addPatient = async () => {
    if (!profile || !newPatient.name || !newPatient.phone) return;
    if (!isValidIndianPhone(newPatient.phone)) { toast.error(phoneErrorMessage); return; }
    const { error } = await supabase.from("patients").insert({
      doctor_id: profile.id, name: newPatient.name, phone: normalizeIndianPhone(newPatient.phone),
      email: newPatient.email || null, age: newPatient.age ? Number(newPatient.age) : null,
      gender: newPatient.gender || null,
    });
    if (error) { toast.error("Could not add patient"); return; }
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
    if (!patients.length) { toast.info("No patients to export"); return; }
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
    a.href = url; a.download = `patients-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${patients.length} patients to CSV`);
  };

  const filtered = patients.filter((p) =>
    (p.total_visits ?? 0) > 0 &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <Users className="h-6 w-6 text-teal" /> Patients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} of {patients.length} patients with completed visits</p>
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
                <Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="10-digit mobile" className="h-10" />
                {newPatient.phone && !isValidIndianPhone(newPatient.phone) && (
                  <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
                )}
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

      <div className={`flex flex-col sm:flex-row gap-3 transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} patient{filtered.length === 1 ? "" : "s"}</span>
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

      {/* Patient Table */}
      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-teal/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No patients yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add your first patient to get started</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 border-b border-border">
                <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {selectMode && <th className="pl-4 pr-2 py-3 w-10"></th>}
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 hidden md:table-cell">Age / Gender</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Last Visit</th>
                  <th className="px-4 py-3">Visits</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`border-b border-border/60 last:border-0 cursor-pointer transition-colors ${
                        isSelected ? "bg-royal/5" : "hover:bg-secondary/40"
                      }`}
                      onClick={selectMode ? () => toggleSelected(p.id) : () => viewPatient(p)}
                    >
                      {selectMode && (
                        <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelected(p.id)}
                            aria-label={`Select ${p.name}`}
                            className="h-5 w-5 rounded"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal/10 flex items-center justify-center text-sm font-bold text-teal flex-shrink-0">
                            {p.name?.charAt(0)?.toUpperCase() || "P"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate">{p.name}</div>
                            {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">{p.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell whitespace-nowrap">
                        {p.age || p.gender ? `${p.age ?? "—"}${p.gender ? `, ${p.gender}` : ""}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {p.last_visit || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{p.total_visits}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={`text-[10px] ${
                          p.total_visits >= 10 ? "bg-success/10 text-success" :
                          p.total_visits >= 3 ? "bg-royal/10 text-royal" :
                          "bg-warning/10 text-warning"
                        }`}>
                          {p.total_visits >= 10 ? "Loyal" : p.total_visits >= 3 ? "Regular" : "New"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
                            <div className="text-xs text-muted-foreground">
                              {a.time_slot?.slice(0, 5)} · {a.appointment_type} · ₹{a.amount}
                              {a.token_number && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-royal/10 text-royal text-[10px] font-semibold">#{a.token_number}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border">
                  <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => setDeleting(selected)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Patient Record
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete patient record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleting?.name}</strong>'s record and cannot be undone.
              Their past appointments will be kept in the appointment history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete
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
              {selectedIds.size} patient{selectedIds.size === 1 ? "" : "s"} selected
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
            <AlertDialogTitle>Delete {selectedIds.size} patient{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Past appointments and invoices for these patients will remain in your records; linked prescriptions will be kept but detached from the patient.
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

export default PatientsPage;
