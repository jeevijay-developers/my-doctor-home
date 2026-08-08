// Quick-glance snapshot: the three things a doctor needs to see immediately
// (allergies, active conditions, current medications) plus the most recent visit.
import { useEffect, useState } from "react";
import { AlertTriangle, Stethoscope, Pill, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Row = Record<string, unknown>;

const OverviewTab = ({ patientId, refreshKey }: { patientId: string; refreshKey: number }) => {
  const [allergies, setAllergies] = useState<Row[]>([]);
  const [conditions, setConditions] = useState<Row[]>([]);
  const [medications, setMedications] = useState<Row[]>([]);
  const [lastVisit, setLastVisit] = useState<Row | null>(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: al }, { data: co }, { data: me }, { data: vi }] = await Promise.all([
        supabase.from("patient_allergies").select("*").eq("patient_id", patientId).is("deleted_at", null).eq("is_active", true),
        supabase.from("patient_conditions").select("*").eq("patient_id", patientId).is("deleted_at", null).in("status", ["active", "under_treatment"]),
        supabase.from("patient_medications").select("*").eq("patient_id", patientId).is("deleted_at", null).eq("status", "active"),
        supabase.from("patient_visits").select("*").eq("patient_id", patientId).is("deleted_at", null).order("visit_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setAllergies(al || []);
      setConditions(co || []);
      setMedications(me || []);
      setLastVisit(vi || null);
    };
    load();
  }, [patientId, refreshKey]);

  return (
    <div className="space-y-6">
      {allergies.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4">
            <h3 className="font-heading font-semibold text-sm text-destructive flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" /> Active Allergies — Check Before Prescribing
            </h3>
            <div className="flex flex-wrap gap-2">
              {allergies.map((a) => (
                <Badge key={String(a.id)} variant="secondary" className="bg-destructive/10 text-destructive text-xs">
                  {String(a.allergy_name)}{a.reaction ? ` · ${String(a.reaction)}` : ""}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
              <Stethoscope className="h-4 w-4 text-royal" /> Active Conditions
            </h3>
            {conditions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active conditions</p>
            ) : (
              <ul className="space-y-1.5">
                {conditions.map((c) => (
                  <li key={String(c.id)} className="text-sm text-foreground flex items-center justify-between gap-2">
                    <span>{String(c.condition_name)}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.status === "active" ? "Active" : "Under Treatment"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
              <Pill className="h-4 w-4 text-teal" /> Current Medications
            </h3>
            {medications.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active medications</p>
            ) : (
              <ul className="space-y-1.5">
                {medications.map((m) => (
                  <li key={String(m.id)} className="text-sm text-foreground">
                    {String(m.medicine_name)}
                    {m.dosage ? <span className="text-muted-foreground"> · {String(m.dosage)}</span> : null}
                    {m.frequency ? <span className="text-muted-foreground"> · {String(m.frequency)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-none">
        <CardContent className="p-4">
          <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-warning" /> Most Recent Visit
          </h3>
          {!lastVisit ? (
            <p className="text-xs text-muted-foreground">No visits logged yet</p>
          ) : (
            <div className="text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{String(lastVisit.visit_date)}</span>
                {lastVisit.consultation_type ? <Badge variant="secondary" className="text-[10px]">{String(lastVisit.consultation_type)}</Badge> : null}
              </div>
              {lastVisit.diagnosis ? <p className="text-muted-foreground text-xs">Diagnosis: {String(lastVisit.diagnosis)}</p> : null}
              {lastVisit.reason_for_visit ? <p className="text-muted-foreground text-xs">Reason: {String(lastVisit.reason_for_visit)}</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;
