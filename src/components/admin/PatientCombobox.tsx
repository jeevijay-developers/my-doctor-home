import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePractitioners } from "@/hooks/usePractitioners";
import { istDayKey } from "@/lib/istDate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { PatientOption } from "@/lib/prescriptionPatient";

export const PATIENT_PICKER_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 250;
const COLUMNS = "id, name, phone, gender, age, weight";

/**
 * Makes a typed term safe to place inside a PostgREST `or(...)` filter: no wildcard, comma,
 * parenthesis, quote, backslash or asterisk survives, so nothing typed can add or change a filter.
 */
export function sanitizePatientQuery(raw: string): string {
  return raw.replace(/[%_,()"'`\\*]/g, " ").replace(/\s+/g, " ").trim();
}

/** The `or(...)` filter for a typed term, matching name, phone as typed, or the phone's digits. */
export function patientSearchFilter(raw: string): string | null {
  const q = sanitizePatientQuery(raw);
  if (!q) return null;
  const parts = [`name.ilike.%${q}%`, `phone.ilike.%${q}%`];
  const digits = q.replace(/\D/g, "");
  if (digits && digits !== q) parts.push(`phone.ilike.%${digits}%`);
  return parts.join(",");
}

type Props = {
  /** The clinic (patients.doctor_id). */
  clinicId: string;
  /** The chosen patient's id ("" when none). */
  value: string;
  /** What to show on the button for the chosen patient, e.g. "Aaryan (8871876376)". */
  valueLabel?: string;
  /** The prescribing doctor; patients seen by them come first in multi-doctor clinics. */
  practitionerId?: string | null;
  onSelect: (patient: PatientOption) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
};

const toOption = (r: any): PatientOption => ({
  id: r.id, name: r.name, phone: r.phone, gender: r.gender ?? null, age: r.age ?? null, weight: r.weight ?? null,
});

const PatientCombobox = ({ clinicId, value, valueLabel, practitionerId, onSelect, id, disabled, placeholder = "Search patient by name or phone…" }: Props) => {
  const { isMulti } = usePractitioners();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [today, setToday] = useState<PatientOption[]>([]);
  const [results, setResults] = useState<PatientOption[]>([]);
  const [full, setFull] = useState(false);
  const seq = useRef(0);

  const searching = sanitizePatientQuery(query) !== "";

  useEffect(() => {
    if (!open || !clinicId) return;
    const mine = ++seq.current;
    setLoading(true);
    const term = sanitizePatientQuery(query);

    const run = async () => {
      try {
        const base = () => supabase.from("patients").select(COLUMNS).eq("doctor_id", clinicId);
        if (term) {
          const { data } = await base()
            .or(patientSearchFilter(term)!)
            .order("last_visit", { ascending: false, nullsFirst: false })
            .order("name")
            .limit(PATIENT_PICKER_LIMIT);
          if (mine !== seq.current) return;
          const rows = (data || []).map(toOption);
          setToday([]);
          setResults(rows);
          setFull(rows.length >= PATIENT_PICKER_LIMIT);
          return;
        }

        // Empty box: who is booked today (IST), then the most recently seen.
        let apptQ = supabase.from("appointments").select("patient_id")
          .eq("doctor_id", clinicId).eq("date", istDayKey(new Date()))
          .neq("status", "cancelled").not("patient_id", "is", null);
        if (practitionerId) apptQ = apptQ.eq("practitioner_id", practitionerId);
        const { data: appts } = await apptQ.limit(100);
        const ids = [...new Set(((appts || []) as { patient_id: string | null }[]).map((a) => a.patient_id).filter(Boolean) as string[])];

        const [todayRes, recentRes, byDoctorRes] = await Promise.all([
          ids.length ? base().in("id", ids).order("name").limit(100) : Promise.resolve({ data: [] as any[] }),
          base().order("last_visit", { ascending: false, nullsFirst: false }).order("name").limit(PATIENT_PICKER_LIMIT),
          isMulti && practitionerId
            ? supabase.from("patients_with_doctors" as any).select(COLUMNS).eq("doctor_id", clinicId)
                .contains("practitioner_ids", [practitionerId])
                .order("last_visit", { ascending: false, nullsFirst: false }).order("name").limit(PATIENT_PICKER_LIMIT)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        if (mine !== seq.current) return;

        const todayRows = (todayRes.data || []).map(toOption);
        const seen = new Set(todayRows.map((p) => p.id));
        const recent: PatientOption[] = [];
        for (const r of [...((byDoctorRes.data as any[]) || []), ...(recentRes.data || [])]) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          recent.push(toOption(r));
          if (recent.length >= PATIENT_PICKER_LIMIT) break;
        }
        setToday(todayRows);
        setResults(recent);
        setFull((recentRes.data || []).length >= PATIENT_PICKER_LIMIT);
      } catch {
        if (mine !== seq.current) return;
        setToday([]);
        setResults([]);
        setFull(false);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    };

    const timer = setTimeout(run, term ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [open, query, clinicId, practitionerId, isMulti]);

  const choose = (p: PatientOption) => {
    onSelect(p);
    setOpen(false);
    setQuery("");
  };

  const row = (p: PatientOption) => (
    <CommandItem key={p.id} value={p.id} aria-label={`${p.name} (${p.phone})`} onSelect={() => choose(p)} className="flex items-center gap-2">
      <Check className={cn("h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{p.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.phone}
          {(p.age != null || p.gender) && ` · ${[p.age != null ? `${p.age}y` : null, p.gender].filter(Boolean).join(" ")}`}
        </span>
      </span>
    </CommandItem>
  );

  const empty = !loading && results.length === 0 && today.length === 0;

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Patient"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? valueLabel || "Selected patient" : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[260px] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Name or phone number" aria-label="Search patients" />
          <CommandList className="max-h-[260px]">
            {loading && <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>}
            {empty && <CommandEmpty>No patient found — type the name below to add a new one</CommandEmpty>}
            {!loading && !searching && today.length > 0 && <CommandGroup heading="Today's patients">{today.map(row)}</CommandGroup>}
            {!loading && results.length > 0 && (
              <CommandGroup heading={searching ? "Matching patients" : "Recent patients"}>{results.map(row)}</CommandGroup>
            )}
          </CommandList>
          {!loading && full && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">Showing the first {PATIENT_PICKER_LIMIT} — keep typing to narrow</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default PatientCombobox;
