// Generic list+form manager shared by the Conditions, Medications, Allergies,
// Surgeries and Family History tabs — their CRUD shape (card list, Add/Edit
// dialog, soft-delete confirm) is identical; only the fields and badges
// differ, so those are supplied as config instead of duplicating five
// near-identical components.
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

export type FieldDef =
  | { key: string; label: string; type: "text"; required?: boolean; placeholder?: string; colSpan?: 1 | 2 }
  | { key: string; label: string; type: "textarea"; required?: boolean; placeholder?: string; rows?: number; colSpan?: 1 | 2 }
  | { key: string; label: string; type: "date"; required?: boolean; colSpan?: 1 | 2 }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; colSpan?: 1 | 2 }
  | { key: string; label: string; type: "boolean"; trueLabel: string; falseLabel: string; colSpan?: 1 | 2 };

export type RecordItem = { id: string; deleted_at?: string | null; [key: string]: unknown };

type Badge_ = { label: string; className: string };

export type RecordManagerProps = {
  table: "patient_conditions" | "patient_medications" | "patient_allergies" | "patient_surgeries" | "patient_family_history";
  patientId: string;
  doctorId: string;
  icon: LucideIcon;
  iconColorClass: string;
  title: string;
  addLabel: string;
  // Singular noun used in success toasts, e.g. "Medication" for a title of
  // "Current Medications" — falls back to `title` if omitted.
  successLabel?: string;
  fields: FieldDef[];
  defaultValues: Record<string, unknown>;
  emptyTitle: string;
  emptyHint: string;
  orderBy: string;
  orderAscending?: boolean;
  renderItem: (row: RecordItem) => { heading: string; badges: Badge_[]; lines: { label: string; value: string }[] };
  onChange?: () => void;
};

const fieldValue = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const RecordManager = ({
  table, patientId, doctorId, icon: Icon, iconColorClass, title, addLabel, successLabel, fields,
  defaultValues, emptyTitle, emptyHint, orderBy, orderAscending = false, renderItem, onChange,
}: RecordManagerProps) => {
  const noun = successLabel || title;
  const [rows, setRows] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(defaultValues);
  const [deleting, setDeleting] = useState<RecordItem | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order(orderBy, { ascending: orderAscending });
    setRows((data || []) as RecordItem[]);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [patientId, table]);

  const openAdd = () => { setEditingId(null); setForm(defaultValues); setDialogOpen(true); };
  const openEdit = (row: RecordItem) => {
    setEditingId(row.id);
    const next: Record<string, unknown> = { ...defaultValues };
    for (const f of fields) next[f.key] = row[f.key] ?? defaultValues[f.key];
    setForm(next);
    setDialogOpen(true);
  };

  const save = async () => {
    for (const f of fields) {
      if ("required" in f && f.required && !fieldValue(form[f.key]).trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    const payload: Record<string, unknown> = { ...form };
    for (const f of fields) {
      if (f.type !== "boolean" && payload[f.key] === "") payload[f.key] = null;
    }
    if (editingId) {
      const { error } = await supabase.from(table).update({ ...payload, updated_by: doctorId } as never).eq("id", editingId);
      if (error) { toast.error(dbErrorMessage(error, `${table} update`, `Could not save ${noun.toLowerCase()}`)); return; }
      toast.success(`${noun} updated successfully.`);
    } else {
      const { error } = await supabase.from(table).insert({
        ...payload, patient_id: patientId, doctor_id: doctorId, created_by: doctorId, updated_by: doctorId,
      } as never);
      if (error) { toast.error(dbErrorMessage(error, `${table} insert`, `Could not add ${noun.toLowerCase()}`)); return; }
      toast.success(`${noun} added successfully.`);
    }
    setDialogOpen(false);
    load();
    onChange?.();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() } as never).eq("id", deleting.id);
    if (error) { toast.error(dbErrorMessage(error, `${table} soft-delete`, "Could not remove record")); return; }
    toast.success("Removed from record");
    setDeleting(null);
    load();
    onChange?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <Icon className={`h-4.5 w-4.5 ${iconColorClass}`} /> {title}
          {rows.length > 0 && <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>}
        </h3>
        <Button size="sm" onClick={openAdd} className="bg-royal hover:bg-royal/90 h-8 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> {addLabel}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <Icon className={`h-9 w-9 mx-auto mb-2 opacity-20 ${iconColorClass}`} />
            <p className="text-sm text-muted-foreground font-medium">{emptyTitle}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{emptyHint}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const { heading, badges, lines } = renderItem(row);
            return (
              <Card key={row.id} className="border-border/60 shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{heading}</span>
                        {badges.map((b, i) => (
                          <Badge key={i} variant="secondary" className={`text-[10px] ${b.className}`}>{b.label}</Badge>
                        ))}
                      </div>
                      {lines.length > 0 && (
                        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {lines.map((l, i) => (
                            <div key={i} className="text-xs">
                              <dt className="inline text-muted-foreground">{l.label}: </dt>
                              <dd className="inline text-foreground">{l.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(row)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleting(row)} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? `Edit ${title}` : addLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.key} className={`space-y-1.5 ${f.colSpan === 2 ? "sm:col-span-2" : ""}`}>
                  <Label>{f.label}{"required" in f && f.required ? " *" : ""}</Label>
                  {f.type === "text" && (
                    <Input
                      value={fieldValue(form[f.key])}
                      placeholder={f.placeholder}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="h-10"
                    />
                  )}
                  {f.type === "date" && (
                    <Input
                      type="date"
                      value={fieldValue(form[f.key])}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="h-10"
                    />
                  )}
                  {f.type === "textarea" && (
                    <Textarea
                      value={fieldValue(form[f.key])}
                      placeholder={f.placeholder}
                      rows={f.rows || 3}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                  {f.type === "select" && (
                    <Select value={fieldValue(form[f.key])} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {f.type === "boolean" && (
                    <Select
                      value={form[f.key] ? "true" : "false"}
                      onValueChange={(v) => setForm({ ...form, [f.key]: v === "true" })}
                    >
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">{f.trueLabel}</SelectItem>
                        <SelectItem value="false">{f.falseLabel}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
            <Button onClick={save} className="w-full h-10 bg-royal hover:bg-royal/90">
              {editingId ? "Save Changes" : "Add Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this record?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from the patient's medical record. This does not permanently erase it from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RecordManager;
