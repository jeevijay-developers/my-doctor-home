import { AlertTriangle } from "lucide-react";
import RecordManager, { RecordItem } from "./RecordManager";

const TYPE_LABEL: Record<string, string> = { drug: "Drug Allergy", food: "Food Allergy", other: "Other Allergy" };
const SEVERITY_CLASS: Record<string, string> = {
  mild: "bg-warning/10 text-warning",
  moderate: "bg-orange-500/10 text-orange-600",
  severe: "bg-destructive/10 text-destructive",
};

const AllergiesTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => (
  <RecordManager
    table="patient_allergies"
    patientId={patientId}
    doctorId={doctorId}
    icon={AlertTriangle}
    iconColorClass="text-destructive"
    title="Allergies"
    addLabel="Add Allergy"
    orderBy="created_at"
    emptyTitle="No allergies recorded"
    emptyHint="Add known drug, food or other allergies"
    defaultValues={{ allergy_type: "drug", allergy_name: "", reaction: "", severity: "mild", notes: "", is_active: true }}
    fields={[
      { key: "allergy_name", label: "Allergy Name", type: "text", required: true, placeholder: "e.g. Penicillin", colSpan: 2 },
      { key: "allergy_type", label: "Allergy Type", type: "select", options: [
        { value: "drug", label: "Drug Allergy" },
        { value: "food", label: "Food Allergy" },
        { value: "other", label: "Other Allergy" },
      ] },
      { key: "severity", label: "Severity", type: "select", options: [
        { value: "mild", label: "Mild" },
        { value: "moderate", label: "Moderate" },
        { value: "severe", label: "Severe" },
      ] },
      { key: "reaction", label: "Reaction", type: "text", placeholder: "e.g. Rash, swelling", colSpan: 2 },
      { key: "is_active", label: "Status", type: "boolean", trueLabel: "Active", falseLabel: "Inactive" },
      { key: "notes", label: "Notes", type: "textarea", colSpan: 2 },
    ]}
    renderItem={(row: RecordItem) => ({
      heading: String(row.allergy_name),
      badges: [
        { label: TYPE_LABEL[String(row.allergy_type)] || "Other Allergy", className: "bg-secondary text-muted-foreground" },
        { label: String(row.severity).charAt(0).toUpperCase() + String(row.severity).slice(1), className: SEVERITY_CLASS[String(row.severity)] },
        ...(row.is_active === false ? [{ label: "Inactive", className: "bg-secondary text-muted-foreground" }] : []),
      ],
      lines: [
        ...(row.reaction ? [{ label: "Reaction", value: String(row.reaction) }] : []),
        ...(row.notes ? [{ label: "Notes", value: String(row.notes) }] : []),
      ],
    })}
    onChange={onChange}
  />
);

export default AllergiesTab;
