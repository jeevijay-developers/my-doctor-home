import { Stethoscope } from "lucide-react";
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

const ConditionsTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => (
  <RecordManager
    table="patient_conditions"
    patientId={patientId}
    doctorId={doctorId}
    icon={Stethoscope}
    iconColorClass="text-royal"
    title="Medical Conditions"
    addLabel="Add Medical Condition"
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
      badges: [{ label: STATUS_LABEL[String(row.status)] || "Unknown", className: STATUS_CLASS[String(row.status)] }],
      lines: [
        ...(row.diagnosis_date ? [{ label: "Since", value: String(row.diagnosis_date) }] : []),
        ...(row.treatment_history ? [{ label: "Treatment", value: String(row.treatment_history) }] : []),
        ...(row.notes ? [{ label: "Notes", value: String(row.notes) }] : []),
      ],
    })}
    onChange={onChange}
  />
);

export default ConditionsTab;
