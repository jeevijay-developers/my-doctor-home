// Combines the three "background" record types (conditions, surgeries/
// hospitalizations, and family history) into one chronological/background
// view — there is no separate Conditions tab; full add/edit/delete for
// conditions lives here.
import { Scissors, Users2, Stethoscope } from "lucide-react";
import RecordManager, { RecordItem } from "./RecordManager";

const CONDITION_STATUS_LABEL: Record<string, string> = {
  active: "Active", under_treatment: "Under Treatment", resolved: "Resolved", unknown: "Unknown",
};
const CONDITION_STATUS_CLASS: Record<string, string> = {
  active: "bg-destructive/10 text-destructive",
  under_treatment: "bg-warning/10 text-warning",
  resolved: "bg-success/10 text-success",
  unknown: "bg-secondary text-muted-foreground",
};

const MedicalHistoryTab = ({ patientId, doctorId, onChange }: {
  patientId: string; doctorId: string; onChange?: () => void;
}) => {
  return (
    <div className="space-y-8">
      <RecordManager
        table="patient_conditions"
        patientId={patientId}
        doctorId={doctorId}
        icon={Stethoscope}
        iconColorClass="text-royal"
        title="Medical Conditions"
        addLabel="Add Medical Condition"
        successLabel="Medical Condition"
        orderBy="diagnosis_date"
        emptyTitle="No conditions recorded"
        emptyHint="Add the patient's diagnosed conditions to build their problem list"
        defaultValues={{ condition_name: "", diagnosis_date: "", treatment_history: "", status: "active", notes: "" }}
        fields={[
          { key: "condition_name", label: "Condition / Disease", type: "text", required: true, placeholder: "e.g. Type 2 Diabetes", colSpan: 2 },
          { key: "diagnosis_date", label: "Diagnosis Date / Since", type: "date" },
          { key: "status", label: "Current Status", type: "select", options: [
            { value: "active", label: "Active" },
            { value: "under_treatment", label: "Under Treatment" },
            { value: "resolved", label: "Resolved" },
            { value: "unknown", label: "Unknown" },
          ] },
          { key: "treatment_history", label: "Treatment History", type: "textarea", colSpan: 2 },
          { key: "notes", label: "Additional Notes", type: "textarea", colSpan: 2 },
        ]}
        renderItem={(row: RecordItem) => ({
          heading: String(row.condition_name),
          badges: [{ label: CONDITION_STATUS_LABEL[String(row.status)] || "Unknown", className: CONDITION_STATUS_CLASS[String(row.status)] }],
          lines: [
            ...(row.diagnosis_date ? [{ label: "Since", value: String(row.diagnosis_date) }] : []),
            ...(row.treatment_history ? [{ label: "Treatment", value: String(row.treatment_history) }] : []),
            ...(row.notes ? [{ label: "Notes", value: String(row.notes) }] : []),
          ],
        })}
        onChange={onChange}
      />

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
