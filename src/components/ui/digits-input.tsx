import * as React from "react";
import { Input } from "@/components/ui/input";

export type DigitsInputProps = React.ComponentProps<typeof Input>;

function filterDigits(value: string) {
  return value.replace(/\D+/g, "");
}

// Drop-in replacement for <Input> on fields that are digits-only by nature
// (age, OTP, pincode, quantity, duration, phone via PhoneInput). Strips any
// non-digit character on every change — typed, pasted, or autofilled — so it
// never renders in the field, rather than being caught only on submit.
export const DigitsInput = React.forwardRef<HTMLInputElement, DigitsInputProps>(
  ({ onChange, inputMode = "numeric", type = "text", ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type={type}
      inputMode={inputMode}
      onChange={(e) => {
        const filtered = filterDigits(e.target.value);
        if (filtered !== e.target.value) e.target.value = filtered;
        onChange?.(e);
      }}
    />
  ),
);
DigitsInput.displayName = "DigitsInput";
