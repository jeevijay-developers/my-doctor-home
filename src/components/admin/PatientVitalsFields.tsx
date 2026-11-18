import { Label } from "@/components/ui/label";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GENDER_OPTIONS, type VitalsErrors } from "@/lib/patientIntake";

type Props = {
  idPrefix: string;
  age: string;
  gender: string;
  weight: string;
  onChange: (patch: { age?: string; gender?: string; weight?: string }) => void;
  errors?: VitalsErrors;
};

// Age, gender and weight, identical on the Add Appointment and Add Patient forms.
const PatientVitalsFields = ({ idPrefix, age, gender, weight, onChange, errors = {} }: Props) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-age`}>Age <span className="text-destructive">*</span></Label>
      <DigitsInput id={`${idPrefix}-age`} maxLength={3} value={age} placeholder="Years" onChange={(e) => onChange({ age: e.target.value })} aria-invalid={!!errors.age} className="h-10" />
      {errors.age && <p className="text-[11px] text-destructive">{errors.age}</p>}
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-gender`}>Gender <span className="text-destructive">*</span></Label>
      <Select value={gender} onValueChange={(v) => onChange({ gender: v })}>
        <SelectTrigger id={`${idPrefix}-gender`} aria-label="Gender" aria-invalid={!!errors.gender} className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {errors.gender && <p className="text-[11px] text-destructive">{errors.gender}</p>}
    </div>
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-weight`}>Weight <span className="text-muted-foreground text-xs font-normal">(kg, optional)</span></Label>
      <AmountInput id={`${idPrefix}-weight`} maxLength={5} value={weight} placeholder="e.g. 62" onChange={(e) => onChange({ weight: e.target.value })} aria-invalid={!!errors.weight} className="h-10" />
      {errors.weight && <p className="text-[11px] text-destructive">{errors.weight}</p>}
    </div>
  </div>
);

export default PatientVitalsFields;
