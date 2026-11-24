import type { ReactNode } from "react";

interface NameButtonProps {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

// The only clickable element inside an otherwise non-clickable list row/card
// (Appointments, Patients, Prescriptions) — a real <button> so it's reachable
// by Tab and activates on Enter/Space, with its own hover/focus styling
// instead of the whole row acting as a button.
const NameButton = ({ onClick, className = "", children }: NameButtonProps) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`text-left rounded-sm hover:text-royal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${className}`}
  >
    {children}
  </button>
);

export default NameButton;
