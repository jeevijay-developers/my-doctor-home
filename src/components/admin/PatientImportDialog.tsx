import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { importPatients, type ImportOutcome, type SendImportFn } from "@/lib/patientImport";
import { importErrorMessage } from "@/lib/patientImportApi";
import ImportLimitRequestForm from "./ImportLimitRequestForm";
import { usePatientImportAccess } from "@/hooks/usePatientImportAccess";

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

const sendImport: SendImportFn = async (rows, fileName) => {
  const { data, error } = await supabase.rpc("import_patients" as any, { _rows: rows, _file_name: fileName });
  return { data, error };
};

const PatientImportDialog = ({ open, onOpenChange, doctorId, onImported }: Props) => {
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Extract<ImportOutcome, { ok: true }> | null>(null);
  const { access, failed: accessFailed, refresh: refreshAccess } = usePatientImportAccess(open);
  const runId = useRef(0);
  // Set synchronously, so a second click before the next render cannot start a second import.
  const importing = useRef(false);

  const reset = () => {
    runId.current += 1;
    importing.current = false;
    setBusy(null); setMessage(null); setPreview(null); setResult(null);
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
      const text = await readFile(file);
      if (id !== runId.current) return;
      const parsed = parsePatientCsv(text);
      if (parsed.fileError) { setMessage(parsed.fileError); return; }
      const existing = await loadExistingKeys(doctorId);
      if (id !== runId.current) return;
      if (!existing) { setMessage("Could not check your existing patients, so nothing was imported. Please try again."); return; }
      const { fresh, duplicates } = splitDuplicates(parsed.rows, existing);
      setPreview({ fileName: file.name, fresh, duplicates, errors: parsed.errors });
    } catch {
      if (id === runId.current) setMessage("Could not read that file. Please choose a CSV file.");
    } finally {
      if (id === runId.current) setBusy(null);
    }
  };

  const startImport = async () => {
    if (importing.current || !preview || preview.fresh.length === 0 || overLimit) return;
    importing.current = true;
    const id = runId.current;
    setBusy("importing");
    setMessage(null);
    try {
      const res = await importPatients(preview.fresh, sendImport, preview.fileName);
      // The patient list and the allowance changed even if the dialog was closed and reopened meanwhile.
      if (res.ok) onImported();
      void refreshAccess();
      if (id !== runId.current) return;
      if (res.ok) setResult(res);
      else setMessage((res as Extract<ImportOutcome, { ok: false }>).message); // no strictNullChecks, so `else` does not narrow
    } finally {
      if (id === runId.current) { importing.current = false; setBusy(null); }
    }
  };

  const skippedExisting = (preview?.duplicates.length ?? 0) + (result?.duplicates ?? 0);
  // A missing, unreadable or negative number means no room left.
  const remaining = Math.max(0, Number(access?.remaining) || 0);
  const overLimit = !!preview && preview.fresh.length > remaining;
  const locked = !!access && !access.eligible;
  const shownRejected = result?.rejected.slice(0, MAX_ERRORS_SHOWN) ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import patients from CSV</DialogTitle>
          <DialogDescription>
            Required columns: Name, Phone, Age and Gender. Optional: Email, Weight (kg), Notes, and the history columns Patient Since, First Visit, Last Visit and Total Visits (dates like 25/12/2023), so long-standing patients keep their real dates. Up to {MAX_IMPORT_ROWS} patients and 2 MB per file. Medical history and reports are added per patient after the import.
          </DialogDescription>
        </DialogHeader>

        {!access && !accessFailed ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">Checking your plan…</p>
        ) : result ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground" role="status">Imported {plural(result.imported, "patient")}</p>
            {skippedExisting > 0 && <p className="text-muted-foreground">{skippedExisting} skipped because they already exist</p>}
            {(preview?.errors.length ?? 0) > 0 && (
              <p className="text-muted-foreground">{plural(preview!.errors.length, "row")} with problems were not imported.</p>
            )}
            {result.rejectedCount > 0 && (
              <div className="space-y-1">
                <p className="text-destructive">{plural(result.rejectedCount, "row")} could not be saved{shownRejected.length > 0 ? ":" : "."}</p>
                <ul className="text-xs text-muted-foreground list-disc pl-5">
                  {shownRejected.map((f) => <li key={f.line}>Line {f.line} · {f.name}: {f.message}</li>)}
                </ul>
                {shownRejected.length > 0 && result.rejectedCount > shownRejected.length && (
                  <p className="text-xs text-muted-foreground">Showing the first {shownRejected.length}.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button className="bg-royal hover:bg-royal/90" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : accessFailed ? (
          <div className="space-y-3 text-sm">
            <p className="text-destructive" role="alert">Could not check your import access. Please try again.</p>
            <Button variant="outline" onClick={() => void refreshAccess()}>Try again</Button>
          </div>
        ) : locked ? (
          <div className="space-y-3 text-sm">
            {access?.reason === "blocked" ? (
              <p className="text-foreground">Import is turned off for your clinic. Please contact support.</p>
            ) : access?.reason === "no_permission" ? (
              <p className="text-foreground">{importErrorMessage("NOT_ALLOWED")}</p>
            ) : (
              <>
                <p className="text-foreground">{importErrorMessage("NOT_ELIGIBLE")}</p>
                <Button asChild className="bg-royal hover:bg-royal/90">
                  <Link to="/admin/settings?tab=subscription">View plans</Link>
                </Button>
              </>
            )}
          </div>
        ) : busy === "importing" ? (
          <div className="py-6 text-center text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Importing {plural(preview?.fresh.length ?? 0, "patient")}…
          </div>
        ) : preview ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground break-all">{preview.fileName}</p>
            <div className="space-y-1">
              <p className="font-medium text-success">{preview.fresh.length} ready to import</p>
              <p className="text-muted-foreground">{preview.duplicates.length} already exist (skipped)</p>
              <p className={preview.errors.length > 0 ? "text-destructive" : "text-muted-foreground"}>{preview.errors.length} with problems (skipped)</p>
            </div>
            {overLimit && (
              <p className="text-sm text-destructive" role="alert">
                This file adds {plural(preview.fresh.length, "patient")} but your limit allows {remaining} more.
              </p>
            )}
            {overLimit && access && (
              <ImportLimitRequestForm access={access} needed={preview.fresh.length} onRequested={() => void refreshAccess()} />
            )}
            {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
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
              <Button className="bg-royal hover:bg-royal/90" disabled={preview.fresh.length === 0 || overLimit} onClick={startImport}>
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
              <p className="text-xs text-muted-foreground">
                {remaining > 0
                  ? `You can import up to ${remaining.toLocaleString("en-IN")} more ${remaining === 1 ? "patient" : "patients"}`
                  : "You have reached your patient limit, so no more patients can be imported"}
                {access?.cap ? ` (limit ${Number(access.cap).toLocaleString("en-IN")}).` : "."}
              </p>
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
