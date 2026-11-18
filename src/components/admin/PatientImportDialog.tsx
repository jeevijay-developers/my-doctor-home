import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parsePatientCsv,
  patientImportTemplate,
  patientKey,
  splitDuplicates,
  type ImportRow,
  type RowError,
} from "@/lib/patientCsv";
import { importPatients, type ImportResult, type InsertFn } from "@/lib/patientImport";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  onImported: () => void;
};

type Preview = { fileName: string; fresh: ImportRow[]; duplicates: ImportRow[]; errors: RowError[] };

const MAX_ERRORS_SHOWN = 50;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

// The clinic's current patients, as the same keys the database unique index uses, so rows that
// already exist can be shown as skipped before anything is written.
async function loadExistingKeys(doctorId: string): Promise<Set<string> | null> {
  const keys = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("patients").select("name, phone").eq("doctor_id", doctorId).order("id").range(start, start + 999);
    if (error || !data) return null;
    for (const p of data as { name: string; phone: string }[]) keys.add(patientKey(p.name, p.phone));
    if (data.length < 1000) return keys;
  }
}

const insertPatients: InsertFn = async (rows) => {
  const { error } = await supabase.from("patients").insert(rows);
  return { error };
};

const PatientImportDialog = ({ open, onOpenChange, doctorId, onImported }: Props) => {
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const runId = useRef(0);

  const reset = () => {
    runId.current += 1;
    setBusy(null); setMessage(null); setPreview(null); setResult(null); setProgress({ done: 0, total: 0 });
  };
  useEffect(() => { if (open) reset(); }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (busy === "importing") return;
    onOpenChange(next);
  };

  const downloadTemplate = () => {
    const blob = new Blob([patientImportTemplate()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "patient-import-template.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_IMPORT_BYTES) { setMessage("File is larger than 2 MB. Split it into smaller files."); return; }

    const id = ++runId.current;
    setBusy("reading");
    try {
      const parsed = parsePatientCsv(await readFile(file));
      if (parsed.fileError) { setMessage(parsed.fileError); return; }
      const existing = await loadExistingKeys(doctorId);
      if (id !== runId.current) return;
      if (!existing) { setMessage("Could not check your existing patients, so nothing was imported. Please try again."); return; }
      const { fresh, duplicates } = splitDuplicates(parsed.rows, existing);
      setPreview({ fileName: file.name, fresh, duplicates, errors: parsed.errors });
    } catch {
      setMessage("Could not read that file. Please choose a CSV file.");
    } finally {
      if (id === runId.current) setBusy(null);
    }
  };

  const startImport = async () => {
    if (!preview || preview.fresh.length === 0) return;
    setBusy("importing");
    setProgress({ done: 0, total: preview.fresh.length });
    try {
      const res = await importPatients(doctorId, preview.fresh, insertPatients, (done, total) => setProgress({ done, total }));
      setResult(res);
      onImported();
    } finally {
      setBusy(null);
    }
  };

  const skippedExisting = (preview?.duplicates.length ?? 0) + (result?.duplicates ?? 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import patients from CSV</DialogTitle>
          <DialogDescription>
            Required columns: Name, Phone, Age and Gender. Email, Weight (kg) and Notes are optional. Up to {MAX_IMPORT_ROWS} patients and 2 MB per file.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">Imported {plural(result.imported, "patient")}</p>
            {skippedExisting > 0 && <p className="text-muted-foreground">{skippedExisting} skipped because they already exist</p>}
            {(preview?.errors.length ?? 0) > 0 && (
              <p className="text-muted-foreground">{plural(preview!.errors.length, "row")} with problems were not imported.</p>
            )}
            {result.failed.length > 0 && (
              <div className="space-y-1">
                <p className="text-destructive">{plural(result.failed.length, "patient")} could not be saved:</p>
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {result.failed.slice(0, MAX_ERRORS_SHOWN).map((f) => <li key={f.line}>Line {f.line} · {f.name}</li>)}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button className="bg-royal hover:bg-royal/90" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : busy === "importing" ? (
          <div className="py-6 text-center text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Importing {progress.done} of {progress.total}…
          </div>
        ) : preview ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground break-all">{preview.fileName}</p>
            <div className="space-y-1">
              <p className="font-medium text-success">{preview.fresh.length} ready to import</p>
              <p className="text-muted-foreground">{preview.duplicates.length} already exist (skipped)</p>
              <p className={preview.errors.length > 0 ? "text-destructive" : "text-muted-foreground"}>{preview.errors.length} with problems (skipped)</p>
            </div>
            {preview.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {preview.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                  <div key={e.line} className="p-2 space-y-0.5">
                    <div className="text-xs font-medium text-foreground">Line {e.line} · {e.name}</div>
                    <div className="text-[11px] text-destructive">{e.messages.join("; ")}</div>
                  </div>
                ))}
                {preview.errors.length > MAX_ERRORS_SHOWN && (
                  <div className="p-2 text-[11px] text-muted-foreground">…and {preview.errors.length - MAX_ERRORS_SHOWN} more.</div>
                )}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>Choose another file</Button>
              <Button className="bg-royal hover:bg-royal/90" disabled={preview.fresh.length === 0} onClick={startImport}>
                Import {plural(preview.fresh.length, "patient")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="patient-import-file" className="flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5" /> CSV file</Label>
              <Input
                id="patient-import-file"
                type="file"
                accept=".csv,text/csv"
                disabled={busy === "reading"}
                onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ""; }}
                className="h-10"
              />
            </div>
            {busy === "reading" && <p className="text-sm text-muted-foreground" role="status">Reading file…</p>}
            {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1.5" /> Download template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PatientImportDialog;
