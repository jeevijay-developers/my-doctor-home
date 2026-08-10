import { Pill } from "lucide-react";
import RecordManager, { RecordItem } from "./RecordManager";

const MedicationsTab = ({ patientId, doctorId, onChange }: { patientId: string; doctorId: string; onChange?: () => void }) => (
  <RecordManager
    table="patient_medications"
    patientId={patientId}
    doctorId={doctorId}
    icon={Pill}
    iconColorClass="text-teal"
    title="Current Medications"
    addLabel="Add Medication"
    successLabel="Medication"
    orderBy="start_date"
    emptyTitle="No medications recorded"
    emptyHint="Add medicines the patient is currently taking or has taken"
    defaultValues={{
      medicine_name: "", dosage: "", frequency: "", start_date: "", end_date: "",
      purpose: "", status: "active", prescribed_by: "",
    }}
    fields={[
      { key: "medicine_name", label: "Medicine Name", type: "text", required: true, colSpan: 2 },
      { key: "dosage", label: "Dosage", type: "text", placeholder: "e.g. 500mg" },
      { key: "frequency", label: "Frequency", type: "text", placeholder: "e.g. Twice daily" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "status", label: "Status", type: "select", options: [
        { value: "active", label: "Active" },
        { value: "completed", label: "Completed" },
      ] },
      { key: "prescribed_by", label: "Prescribed By", type: "text" },
      { key: "purpose", label: "Purpose", type: "textarea", colSpan: 2 },
    ]}
    renderItem={(row: RecordItem) => ({
      heading: String(row.medicine_name),
      badges: [{
        label: row.status === "active" ? "Active" : "Completed",
        className: row.status === "active" ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground",
      }],
      lines: [
        ...(row.dosage ? [{ label: "Dosage", value: String(row.dosage) }] : []),
        ...(row.frequency ? [{ label: "Frequency", value: String(row.frequency) }] : []),
        ...(row.start_date ? [{ label: "Since", value: String(row.start_date) }] : []),
        ...(row.prescribed_by ? [{ label: "Prescribed by", value: String(row.prescribed_by) }] : []),
        ...(row.purpose ? [{ label: "Purpose", value: String(row.purpose) }] : []),
      ],
    })}
    onChange={onChange}
  />
);

export default MedicationsTab;
