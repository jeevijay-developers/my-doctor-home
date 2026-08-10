// Computed client-side from the existing tables rather than stored as its own
// synced table — a chronological view built by merging visits, conditions,
// medications, allergies, surgeries, documents and prescriptions by date
// avoids a duplicate table that could drift out of sync with its sources.
import { useEffect, useMemo, useState } from "react";
import { History, CalendarClock, Stethoscope, Pill, AlertTriangle, Scissors, FileText, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

type Event = { date: string; label: string; detail?: string; icon: LucideIcon; colorClass: string };

const TimelineTab = ({ patientId }: { patientId: string }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [visits, conditions, medications, allergies, surgeries, documents, prescriptions] = await Promise.all([
        supabase.from("patient_visits").select("visit_date, consultation_type, diagnosis").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("patient_conditions").select("diagnosis_date, condition_name").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("patient_medications").select("start_date, medicine_name").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("patient_allergies").select("created_at, allergy_name").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("patient_surgeries").select("event_date, title").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("patient_documents").select("document_date, document_name").eq("patient_id", patientId).is("deleted_at", null),
        supabase.from("prescriptions").select("date, diagnosis").eq("patient_id", patientId),
      ]);

      const list: Event[] = [];
      for (const v of visits.data || []) {
        list.push({ date: v.visit_date, label: "Clinic Visit", detail: v.consultation_type || v.diagnosis || undefined, icon: CalendarClock, colorClass: "bg-warning/10 text-warning" });
      }
      for (const c of conditions.data || []) {
        if (c.diagnosis_date) list.push({ date: c.diagnosis_date, label: "Condition Diagnosed", detail: c.condition_name, icon: Stethoscope, colorClass: "bg-royal/10 text-royal" });
      }
      for (const m of medications.data || []) {
        if (m.start_date) list.push({ date: m.start_date, label: "Medication Started", detail: m.medicine_name, icon: Pill, colorClass: "bg-teal/10 text-teal" });
      }
      for (const a of allergies.data || []) {
        list.push({ date: a.created_at.slice(0, 10), label: "Allergy Recorded", detail: a.allergy_name, icon: AlertTriangle, colorClass: "bg-destructive/10 text-destructive" });
      }
      for (const s of surgeries.data || []) {
        if (s.event_date) list.push({ date: s.event_date, label: "Surgery / Hospitalization", detail: s.title, icon: Scissors, colorClass: "bg-ai-purple/10 text-ai-purple" });
      }
      for (const d of documents.data || []) {
        list.push({ date: d.document_date, label: "Report Uploaded", detail: d.document_name, icon: FileText, colorClass: "bg-ai-purple/10 text-ai-purple" });
      }
      for (const p of prescriptions.data || []) {
        list.push({ date: p.date, label: "Prescription Created", detail: p.diagnosis || undefined, icon: ClipboardList, colorClass: "bg-success/10 text-success" });
      }

      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setEvents(list);
      setLoading(false);
    };
    load();
  }, [patientId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const year = e.date.slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(e);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="space-y-3">
      <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
        <History className="h-4.5 w-4.5 text-royal" /> Medical Timeline
      </h3>

      {loading ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
      ) : events.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <History className="h-9 w-9 mx-auto mb-2 opacity-20 text-royal" />
            <p className="text-sm text-muted-foreground font-medium">Nothing to show yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Timeline builds automatically as visits, conditions, prescriptions and documents are added</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([year, yearEvents]) => (
            <div key={year}>
              <div className="text-sm font-heading font-bold text-primary mb-2">{year}</div>
              <div className="space-y-0.5">
                {yearEvents.map((e, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${e.colorClass}`}>
                        <e.icon className="h-3.5 w-3.5" />
                      </div>
                      {i < yearEvents.length - 1 && <div className="w-0.5 flex-1 bg-border min-h-[16px]" />}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-sm text-foreground">{e.label}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{e.date}</span>
                      </div>
                      {e.detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineTab;
