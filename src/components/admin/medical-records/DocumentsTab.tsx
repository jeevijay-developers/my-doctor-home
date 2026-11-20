// Files live in the private "patient-documents" storage bucket (public: false,
// storage RLS scoped to the uploading doctor's auth.uid() folder segment — see
// the medical-records migration). There is no public URL for these files;
// every preview/download goes through a short-lived signed URL requested by
// the owning doctor's own session, matching the bucket's RLS.
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Trash2, Eye, Download, File as FileIcon, Camera, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DocumentType = Database["public"]["Enums"]["medical_document_type"];
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
import {
  ACCEPTED_EXTENSIONS, DOCUMENT_TYPE_LABEL, MAX_BATCH_FILES, MAX_DOCUMENT_BYTES, baseName, defaultDocumentDate,
  documentFileProblem, prepareImage, sniffMime, suggestDocumentType,
} from "@/lib/patientDocuments";
import { clinicToday } from "@/lib/queue";

type Doc = {
  id: string; document_name: string; document_type: string; file_path: string; file_type: string | null;
  document_date: string; notes: string | null; visit_id: string | null;
};
type VisitOpt = { id: string; visit_date: string };

const TYPE_LABEL = DOCUMENT_TYPE_LABEL;

// One file waiting to be attached. Name, type and date are each editable before upload.
type QueueItem = {
  key: string;
  file: File;
  name: string;
  type: string;
  date: string;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
};

// crypto.randomUUID() only exists in secure contexts (HTTPS, or localhost/127.0.0.1) —
// it's undefined on a plain-HTTP LAN origin like http://192.168.x.x:8080, which this
// app is regularly accessed over during dev/testing. Calling it there threw
// synchronously before the upload ever reached the network, leaving the button stuck
// on "Uploading..." forever with no request and no error. crypto.getRandomValues has
// no such restriction, so fall back to building a real v4 UUID from it.
function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DocumentsTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [visits, setVisits] = useState<VisitOpt[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // Shared by every file in the batch.
  const [form, setForm] = useState({ notes: "", visit_id: "" });
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("patient_documents").select("*").eq("patient_id", patientId).is("deleted_at", null).order("document_date", { ascending: false });
    setDocs((data || []) as Doc[]);
    const { data: v } = await supabase.from("patient_visits").select("id, visit_date").eq("patient_id", patientId).is("deleted_at", null).order("visit_date", { ascending: false });
    setVisits((v || []) as VisitOpt[]);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [patientId]);

  const openAdd = () => {
    setItems([]);
    setForm({ notes: "", visit_id: "" });
    setDialogOpen(true);
  };

  const addFiles = async (picked: FileList | File[] | null) => {
    const files = Array.from(picked ?? []);
    if (files.length === 0) return;
    setPreparing(true);
    try {
      const problems: string[] = [];
      const added: QueueItem[] = [];
      let room = MAX_BATCH_FILES - items.length;
      for (const original of files) {
        if (room <= 0) { problems.push(`Only ${MAX_BATCH_FILES} files can be added at a time`); break; }
        const mime = await sniffMime(original);
        const problem = documentFileProblem(original, mime);
        if (problem) { problems.push(problem); continue; }
        // The type is taken from the real bytes, not the name the phone or scanner gave it.
        const typed = mime && original.type !== mime ? new File([original], original.name, { type: mime, lastModified: original.lastModified }) : original;
        const file = await prepareImage(typed);
        if (file.size > MAX_DOCUMENT_BYTES) { problems.push(`${original.name}: still over ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB after shrinking`); continue; }
        added.push({
          key: randomUUID(), file, name: baseName(original.name), type: suggestDocumentType(original.name),
          date: defaultDocumentDate(original), status: "ready",
        });
        room--;
      }
      if (added.length) setItems((prev) => [...prev, ...added]);
      if (problems.length) toast.error(problems.slice(0, 3).join("\n") + (problems.length > 3 ? `\n+${problems.length - 3} more` : ""));
    } finally {
      setPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const patchItem = (key: string, patch: Partial<QueueItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  const uploadOne = async (item: QueueItem): Promise<string | null> => {
    let path: string | null = null;
    try {
      const ext = item.file.name.split(".").pop();
      path = `${doctorId}/${patientId}/${Date.now()}-${randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("patient-documents").upload(path, item.file);
      if (upErr) {
        console.error("patient-documents upload failed:", upErr);
        return `Could not upload file: ${upErr.message}`;
      }
      const { error } = await supabase.from("patient_documents").insert({
        patient_id: patientId, doctor_id: doctorId, created_by: doctorId,
        document_name: item.name.trim(), document_type: item.type as DocumentType,
        file_path: path, file_type: item.file.type, document_date: item.date,
        notes: form.notes || null, visit_id: form.visit_id || null,
      });
      if (error) {
        // Uploaded file is now orphaned in storage since the metadata row
        // failed — remove it so retrying doesn't leave duplicate blobs behind.
        await supabase.storage.from("patient-documents").remove([path]);
        return dbErrorMessage(error, "patient_documents insert", "Could not save document record");
      }
      return null;
    } catch (e) {
      // Guards against any unexpected synchronous/async throw (e.g. an
      // unavailable browser API) leaving the button stuck on "Uploading…"
      // forever with no request ever sent and no feedback to the user.
      console.error("patient-documents upload threw:", e);
      return "Could not upload file. Please try again.";
    }
  };

  const upload = async () => {
    const todo = items.filter((i) => i.status !== "done");
    if (todo.length === 0) { toast.error("Choose at least one file to upload"); return; }
    const today = clinicToday();
    const invalid = todo.find((i) => !i.name.trim() || !i.date || i.date > today);
    if (invalid) {
      toast.error(!invalid.name.trim() ? "Every document needs a name" : "Dates cannot be empty or in the future");
      return;
    }
    setUploading(true);
    let ok = 0;
    let failed = 0;
    // One at a time: keeps the connection usable on a clinic's slow wifi and gives clear per-file status.
    for (const item of todo) {
      patchItem(item.key, { status: "uploading", error: undefined });
      const err = await uploadOne(item);
      if (err) { failed++; patchItem(item.key, { status: "error", error: err }); }
      else { ok++; patchItem(item.key, { status: "done" }); }
    }
    setUploading(false);
    if (ok) { load(); onChange?.(); }
    if (failed === 0) {
      toast.success(ok === 1 ? "Document uploaded successfully." : `${ok} documents uploaded successfully.`);
      setDialogOpen(false);
    } else {
      toast.error(`${failed} file${failed === 1 ? "" : "s"} could not be uploaded${ok ? ` (${ok} done)` : ""}. Fix or retry the ones marked below.`);
    }
  };

  const signedUrl = async (path: string) => {
    const { data, error } = await supabase.storage.from("patient-documents").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      if (error) console.error("patient-documents signed URL failed:", error);
      toast.error("Could not open document");
      return null;
    }
    return data.signedUrl;
  };

  const preview = async (doc: Doc) => {
    const url = await signedUrl(doc.file_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const download = async (doc: Doc) => {
    const url = await signedUrl(doc.file_path);
    if (!url) return;
    // The signed URL is cross-origin (Supabase Storage, not this app's own
    // origin) — browsers ignore the `download` attribute on cross-origin
    // links for security reasons and just open/preview the file instead of
    // saving it. Fetching the file into a blob and downloading from a
    // same-origin blob: URL is the only reliable way to force a real save.
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const ext = doc.file_path.split(".").pop();
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = ext ? `${doc.document_name}.${ext}` : doc.document_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("patient-documents download failed:", e);
      toast.error("Could not download document");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("patient_documents").update({ deleted_at: new Date().toISOString() }).eq("id", deleting.id);
    if (error) { toast.error(dbErrorMessage(error, "patient_documents soft-delete", "Could not remove document")); return; }
    toast.success("Document removed");
    setDeleting(null);
    load();
    onChange?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4.5 w-4.5 text-ai-purple" /> Medical Documents
          {docs.length > 0 && <Badge variant="secondary" className="text-[10px]">{docs.length}</Badge>}
        </h3>
        <Button size="sm" onClick={openAdd} className="bg-royal hover:bg-royal/90 h-8 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Upload Document
        </Button>
      </div>

      {docs.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <FileText className="h-9 w-9 mx-auto mb-2 opacity-20 text-ai-purple" />
            <p className="text-sm text-muted-foreground font-medium">No documents uploaded</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Upload lab reports, scans or previous prescriptions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {docs.map((d) => (
            <Card key={d.id} className="border-border/60 shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-ai-purple/10 flex items-center justify-center flex-shrink-0">
                    <FileIcon className="h-4.5 w-4.5 text-ai-purple" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-foreground truncate">{d.document_name}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[d.document_type] || "Other"}</Badge>
                      <span className="text-[11px] text-muted-foreground">{d.document_date}</span>
                    </div>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1.5 truncate">{d.notes}</p>}
                    <div className="flex items-center gap-1 mt-2.5">
                      <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => preview(d)}>
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => download(d)}>
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive ml-auto" onClick={() => setDeleting(d)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!uploading) setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upload Medical Documents</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Files * (PDF, JPG, PNG, WebP — up to {MAX_DOCUMENT_BYTES / 1024 / 1024} MB each, {MAX_BATCH_FILES} at a time)</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={uploading || preparing} onClick={() => fileInputRef.current?.click()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Choose files
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={uploading || preparing} onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> Take photo
                </Button>
                {preparing && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</span>}
              </div>
              <input
                ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} aria-label="Choose files" className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <input
                ref={cameraInputRef} type="file" accept="image/*" capture="environment" aria-label="Take photo" className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <p className="text-[11px] text-muted-foreground">Large photos are shrunk automatically. The date is taken from the file, so please check it.</p>
            </div>

            {items.length > 0 && (
              <ul className="space-y-2" aria-label="Files to upload">
                {items.map((it) => (
                  <li key={it.key} className="rounded-lg border border-border/60 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        value={it.name} aria-label={`Name for ${it.file.name}`} disabled={uploading || it.status === "done"}
                        onChange={(e) => patchItem(it.key, { name: e.target.value })} className="h-9 flex-1"
                      />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{(it.file.size / 1024).toFixed(0)} KB</span>
                      {it.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-royal" aria-label="Uploading" />}
                      {it.status === "done" && <CheckCircle2 className="h-4 w-4 text-success" aria-label="Uploaded" />}
                      {it.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" aria-label="Failed" />}
                      {!uploading && it.status !== "done" && (
                        <button type="button" onClick={() => removeItem(it.key)} aria-label={`Remove ${it.file.name}`} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={it.type} disabled={uploading || it.status === "done"} onValueChange={(v) => patchItem(it.key, { type: v })}>
                        <SelectTrigger className="h-9" aria-label={`Type for ${it.file.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date" value={it.date} max={clinicToday()} aria-label={`Date for ${it.file.name}`} disabled={uploading || it.status === "done"}
                        onChange={(e) => patchItem(it.key, { date: e.target.value })} className="h-9"
                      />
                    </div>
                    {it.error && <p role="alert" className="text-xs text-destructive">{it.error}</p>}
                  </li>
                ))}
              </ul>
            )}

            {visits.length > 0 && (
              <div className="space-y-1.5">
                <Label>Related Visit (optional, applies to all)</Label>
                <Select value={form.visit_id} onValueChange={(v) => setForm({ ...form, visit_id: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="-- None --" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {visits.map((v) => <SelectItem key={v.id} value={v.id}>{v.visit_date}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes (applies to all)</Label>
              <Textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={upload} disabled={uploading || preparing || items.every((i) => i.status === "done")} className="w-full h-10 bg-royal hover:bg-royal/90">
              {uploading ? "Uploading…" : items.length > 1 ? `Upload ${items.filter((i) => i.status !== "done").length} Documents` : "Upload Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>It will be hidden from the patient's medical record. The underlying file is kept for audit purposes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DocumentsTab;
