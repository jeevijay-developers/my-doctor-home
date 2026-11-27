import { PAIN_LABELS } from "@/lib/prescriptionTemplate/extra";

// Printable 0-5 pain scale with the chosen level filled in.
export const PainScaleView = ({ value, accent }: { value: number; accent: string }) => (
  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${PAIN_LABELS.length}, minmax(0, 1fr))` }}>
    {PAIN_LABELS.map((label, i) => {
      const on = i === value;
      return (
        <div
          key={label}
          data-pain-level={i}
          data-selected={on ? "true" : undefined}
          className="text-center rounded border px-0.5 py-1"
          style={{
            // Browsers drop backgrounds when printing unless asked not to; the thick border keeps the
            // chosen level visible even then.
            borderColor: on ? accent : "#d1d5db",
            borderWidth: on ? 3 : 1,
            backgroundColor: on ? accent : "#ffffff",
            color: on ? "#ffffff" : "#4b5563",
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          } as React.CSSProperties}
        >
          <div className="text-[11px] font-bold leading-none">{i}</div>
          <div className="text-[8.5px] leading-tight mt-0.5">{label}</div>
        </div>
      );
    })}
  </div>
);

export default PainScaleView;
