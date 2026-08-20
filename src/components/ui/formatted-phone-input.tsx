import * as React from "react";
import { Input } from "@/components/ui/input";

export type FormattedPhoneInputProps = React.ComponentProps<typeof Input>;

function filterFormattedPhone(value: string) {
  return value.replace(/[^\d+\-\s]/g, "");
}

// For phone fields whose placeholder invites a "+91 98765 43210"-style entry
// (leading +, spaces) rather than a bare digit string — as opposed to
// PhoneInput, which is digits-only for fields with no country-code prefix in
// the UI. Blocks letters and other punctuation but keeps +, spaces and dashes
// typable as formatting; existing submit-time validators (isValidIndianPhone,
// etc.) already strip these before checking digits, so they're unaffected.
export const FormattedPhoneInput = React.forwardRef<HTMLInputElement, FormattedPhoneInputProps>(
  ({ onChange, type = "tel", inputMode = "tel", ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type={type}
      inputMode={inputMode}
      onChange={(e) => {
        const filtered = filterFormattedPhone(e.target.value);
        if (filtered !== e.target.value) e.target.value = filtered;
        onChange?.(e);
      }}
    />
  ),
);
FormattedPhoneInput.displayName = "FormattedPhoneInput";
