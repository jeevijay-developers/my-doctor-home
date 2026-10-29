import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_APPOINTMENTS_LIMIT, type LimitMode } from "@/lib/customPlan";

type Props = {
  mode: LimitMode;
  numberText: string;
  onModeChange: (mode: LimitMode) => void;
  onNumberChange: (text: string) => void;
  /** Label for "no change": "Keep current" for a doctor, "Standard limit" for a reviewer. */
  keepLabel: string;
  /** One sentence under the heading, e.g. what the doctor has right now. */
  hint: string;
  /** Already unlimited: asking for unlimited again would be a no-op. */
  unlimitedDisabled?: boolean;
  /** Shown when the typed number is not usable. */
  invalid?: boolean;
  disabled?: boolean;
};

// The monthly appointment limit is a number, not an on/off feature, so it gets its own control:
// keep the tier's standard limit, set a number, or go unlimited. Shared by the doctor's request
// dialog and the superadmin's approve/edit dialogs so both speak the same way.
const AppointmentsLimitControl = ({
  mode, numberText, onModeChange, onNumberChange, keepLabel, hint, unlimitedDisabled, invalid, disabled,
}: Props) => {
  const id = useId();
  const option = (value: LimitMode, label: string, isDisabled = false) => (
    <Button
      type="button"
      size="sm"
      variant={mode === value ? "default" : "outline"}
      className={`h-9 text-xs ${mode === value ? "bg-royal hover:bg-royal/90" : ""}`}
      aria-pressed={mode === value}
      title={isDisabled ? "Already included in your plan" : undefined}
      disabled={disabled || isDisabled}
      onClick={() => onModeChange(value)}
    >
      {label}
    </Button>
  );

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="rounded-lg border border-border p-3 space-y-2">
      <div>
        <div id={`${id}-label`} className="text-sm font-medium text-foreground">Monthly appointments</div>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {option("keep", keepLabel)}
        {option("number", "Set a number")}
        {option("unlimited", "Unlimited", unlimitedDisabled)}
      </div>
      {mode === "number" && (
        <div className="space-y-1">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_APPOINTMENTS_LIMIT}
            step={1}
            value={numberText}
            disabled={disabled}
            onChange={(e) => onNumberChange(e.target.value)}
            aria-label="Appointments per month"
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
            placeholder="e.g. 300"
            className="h-9 w-40"
          />
          {invalid && (
            <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
              Enter a whole number from 1 to {MAX_APPOINTMENTS_LIMIT}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AppointmentsLimitControl;
