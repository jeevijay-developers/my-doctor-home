// Files live in the private "patient-documents" storage bucket (public: false,
// storage RLS scoped to the uploading doctor's auth.uid() folder segment — see
// the medical-records migration). There is no public URL for these files;
// every preview/download goes through a short-lived signed URL requested by
// the owning doctor's own session, matching the bucket's RLS.
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Trash2, Eye, Download, File as FileIcon } from "lucide-react";
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

type Doc = {
  id: string; document_name: string; document_type: string; file_path: string; file_type: string | null;
  document_date: string; notes: string | null; visit_id: string | null;
};
type VisitOpt = { id: string; visit_date: string };

const TYPE_LABEL: Record<string, string> = {
  lab_report: "Lab Report", xray: "X-Ray", mri: "MRI", ct_scan: "CT Scan",
  previous_prescription: "Previous Prescription", other: "Other",
};
const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.webp";
const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const DocumentsTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [visits, setVisits] = useState<VisitOpt[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ document_name: "", document_type: "other", document_date: new Date().toISOString().slice(0, 10), notes: "", visit_id: "" });
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("patient_documents").select("*").eq("patient_id", patientId).is("deleted_at", null).order("document_date", { ascending: false });
    setDocs((data || []) as Doc[]);
    const { data: v } = await supabase.from("patient_visits").select("id, visit_date").eq("patient_id", patientId).is("deleted_at", null).order("visit_date", { ascending: false });
    setVisits((v || []) as VisitOpt[]);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [patientId]);

  const openAdd = () => {
    setFile(null);
    setForm({ document_name: "", document_type: "other", document_date: new Date().toISOString().slice(0, 10), notes: "", visit_id: "" });
    setDialogOpen(true);
  };

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!ACCEPTED_MIME.includes(f.type)) { toast.error("Only PDF, JPG, JPEG, PNG or WebP files are supported"); return; }
    setFile(f);
    if (!form.document_name) setForm((prev) => ({ ...prev, document_name: f.name.replace(/\.[^.]+$/, "") }));
  };

  const upload = async () => {
    if (!file) { toast.error("Choose a file to upload"); return; }
    if (!form.document_name.trim()) { toast.error("Document name is required"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${doctorId}/${patientId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("patient-documents").upload(path, file);
    if (upErr) {
      console.error("patient-documents upload failed:", upErr);
      setUploading(false);
      toast.error(`Could not upload file: ${upErr.message}`);
      return;
    }
    const { error } = await supabase.from("patient_documents").insert({
      patient_id: patientId, doctor_id: doctorId, created_by: doctorId,
      document_name: form.document_name, document_type: form.document_type as DocumentType,
      file_path: path, file_type: file.type, document_date: form.document_date,
      notes: form.notes || null, visit_id: form.visit_id || null,
    });
    setUploading(false);
    if (error) {
      // Uploaded file is now orphaned in storage since the metadata row
      // failed — remove it so retrying doesn't leave duplicate blobs behind.
      await supabase.storage.from("patient-documents").remove([path]);
      toast.error(dbErrorMessage(error, "patient_documents insert", "Could not save document record"));
      return;
    }
    toast.success("Document uploaded successfully.");
    setDialogOpen(false);
    load();
    onChange?.();
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
    const a = document.createElement("a");
    a.href = url; a.download = doc.document_name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Upload Medical Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>File * (PDF, JPG, JPEG, PNG, WebP)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                onChange={(e) => pickFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-foreground file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium hover:file:bg-secondary/80"
              />
              {file && <p className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Document Name *</Label>
              <Input value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })} className="h-10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Document Type</Label>
                <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.document_date} onChange={(e) => setForm({ ...form, document_date: e.target.value })} className="h-10" />
              </div>
            </div>
            {visits.length > 0 && (
              <div className="space-y-1.5">
                <Label>Related Visit (optional)</Label>
                <Select value={form.visit_id} onValueChange={(v) => setForm({ ...form, visit_id: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="-- None --" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {visits.map((v) => <SelectItem key={v.id} value={v.id}>{v.visit_date}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} rows={2} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button onClick={upload} disabled={uploading} className="w-full h-10 bg-royal hover:bg-royal/90">
              {uploading ? "Uploading…" : "Upload Document"}
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
