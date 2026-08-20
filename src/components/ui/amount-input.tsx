import * as React from "react";
import { Input } from "@/components/ui/input";

export type AmountInputProps = React.ComponentProps<typeof Input>;

function filterDecimal(value: string) {
  let v = value.replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  return v;
}

// Currency/quantity entry as text+inputMode="decimal" rather than
// type="number", which avoids the native number input's e/E/+/- exponent
// characters entirely. Strips anything but digits and a single decimal point
// on every change (typed, pasted, or autofilled).
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ onChange, inputMode = "decimal", type = "text", ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type={type}
      inputMode={inputMode}
      onChange={(e) => {
        const filtered = filterDecimal(e.target.value);
        if (filtered !== e.target.value) e.target.value = filtered;
        onChange?.(e);
      }}
    />
  ),
);
AmountInput.displayName = "AmountInput";
