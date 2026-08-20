import * as React from "react";
import { DigitsInput, type DigitsInputProps } from "@/components/ui/digits-input";

// Digits-only phone entry — accepts up to 12 digits so an optional 91 country
// prefix still fits. Existing submit-time checks (isValidIndianPhone /
// phoneErrorMessage in @/lib/phone) remain the source of truth for validity;
// this only stops non-digit characters from ever being typed or pasted in.
export const PhoneInput = React.forwardRef<HTMLInputElement, DigitsInputProps>(
  ({ maxLength = 12, ...props }, ref) => <DigitsInput {...props} ref={ref} maxLength={maxLength} />,
);
PhoneInput.displayName = "PhoneInput";
