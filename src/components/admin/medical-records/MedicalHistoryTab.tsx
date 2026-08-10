// Combines the two "background" record types (surgeries/hospitalizations and
// family history) with a read-only summary of the patient's condition list
// (full CRUD for conditions lives on the Conditions tab — this tab is the
// broader chronological/background view).
import { useEffect, useState } from "react";
import { Scissors, Users2, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import RecordManager, { RecordItem } from "./RecordManager";

const STATUS_LABEL: Record<string, string> = {
  active: "Active", under_treatment: "Under Treatment", resolved: "Resolved", unknown: "Unknown",
};
const STATUS_CLASS: Record<string, string> = {
  active: "bg-destructive/10 text-destructive",
  under_treatment: "bg-warning/10 text-warning",
  resolved: "bg-success/10 text-success",
  unknown: "bg-secondary text-muted-foreground",
};

type Condition = { id: string; condition_name: string; status: string; diagnosis_date: string | null };

const MedicalHistoryTab = ({ patientId, doctorId, refreshKey, onChange }: {
  patientId: string; doctorId: string; refreshKey: number; onChange?: () => void;
}) => {
  const [conditions, setConditions] = useState<Condition[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("patient_conditions")
        .select("id, condition_name, status, diagnosis_date")
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("diagnosis_date", { ascending: false });
      setConditions((data || []) as Condition[]);
    };
    load();
  }, [patientId, refreshKey]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <Stethoscope className="h-4.5 w-4.5 text-royal" /> Condition Summary
          <Badge variant="secondary" className="text-[10px]">{conditions.length}</Badge>
        </h3>
        {conditions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No conditions recorded yet. Add them from the Conditions tab.</p>
        ) : (
          <Card className="border-border/60 shadow-none">
            <CardContent className="p-4 space-y-2">
              {conditions.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{c.condition_name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.diagnosis_date && <span className="text-xs text-muted-foreground">{c.diagnosis_date}</span>}
                    <Badge variant="secondary" className={`text-[10px] ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <RecordManager
        table="patient_surgeries"
        patientId={patientId}
        doctorId={doctorId}
        icon={Scissors}
        iconColorClass="text-ai-purple"
        title="Surgeries / Hospitalizations"
        addLabel="Add Surgery / Hospitalization"
        successLabel="Surgery / Hospitalization"
        orderBy="event_date"
        emptyTitle="No surgeries or hospitalizations recorded"
        emptyHint="Add past surgeries or hospital admissions"
        defaultValues={{ title: "", event_date: "", hospital: "", reason: "", outcome: "", notes: "" }}
        fields={[
          { key: "title", label: "Surgery / Hospitalization Name", type: "text", required: true, colSpan: 2 },
          { key: "event_date", label: "Date", type: "date" },
          { key: "hospital", label: "Hospital", type: "text" },
          { key: "reason", label: "Reason", type: "textarea", colSpan: 2 },
          { key: "outcome", label: "Outcome", type: "textarea", colSpan: 2 },
          { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
        ]}
        renderItem={(row: RecordItem) => ({
          heading: String(row.title),
          badges: [],
          lines: [
            ...(row.event_date ? [{ label: "Date", value: String(row.event_date) }] : []),
            ...(row.hospital ? [{ label: "Hospital", value: String(row.hospital) }] : []),
            ...(row.reason ? [{ label: "Reason", value: String(row.reason) }] : []),
            ...(row.outcome ? [{ label: "Outcome", value: String(row.outcome) }] : []),
          ],
        })}
        onChange={onChange}
      />

      <RecordManager
        table="patient_family_history"
        patientId={patientId}
        doctorId={doctorId}
        icon={Users2}
        iconColorClass="text-teal"
        title="Family Medical History"
        addLabel="Add Family History"
        successLabel="Family History Entry"
        orderBy="created_at"
        emptyTitle="No family history recorded"
        emptyHint="Add relevant conditions in the patient's family"
        defaultValues={{ family_member: "", relationship: "", condition: "", notes: "" }}
        fields={[
          { key: "family_member", label: "Family Member", type: "text", required: true, placeholder: "e.g. Mother" },
          { key: "relationship", label: "Relationship", type: "text", placeholder: "e.g. Biological mother" },
          { key: "condition", label: "Condition", type: "text", required: true, colSpan: 2 },
          { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
        ]}
        renderItem={(row: RecordItem) => ({
          heading: `${row.condition} — ${row.family_member}`,
          badges: [],
          lines: [
            ...(row.relationship ? [{ label: "Relationship", value: String(row.relationship) }] : []),
            ...(row.notes ? [{ label: "Notes", value: String(row.notes) }] : []),
          ],
        })}
        onChange={onChange}
      />
    </div>
  );
};

export default MedicalHistoryTab;
