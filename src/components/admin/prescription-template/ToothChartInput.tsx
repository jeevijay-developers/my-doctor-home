import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LOWER_TEETH, TOOTH_STATUSES, UPPER_TEETH } from "@/lib/prescriptionTemplate/teeth";
import type { ToothMap, ToothStatus } from "@/lib/prescriptionTemplate/types";

type Props = { value: ToothMap; onChange: (next: ToothMap) => void; label: string };

// Pick a status, then tap teeth to mark them. Tapping a tooth that already has that status clears it.
const ToothChartInput = ({ value, onChange, label }: Props) => {
  const [brush, setBrush] = useState<ToothStatus>("decayed");

  const tap = (tooth: string) => {
    const next = { ...value };
    if (next[tooth] === brush) delete next[tooth];
    else next[tooth] = brush;
    onChange(next);
  };

  const row = (teeth: readonly string[]) => (
    <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
      {teeth.map((t, i) => {
        const status = value[t];
        const info = status ? TOOTH_STATUSES.find((s) => s.key === status) : null;
        return (
          <button
            key={t}
            type="button"
            aria-label={`${label} tooth ${t}${info ? `, ${info.label}` : ""}`}
            aria-pressed={!!info}
            onClick={() => tap(t)}
            className={`min-w-0 rounded-sm border text-center leading-none py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${i === 8 ? "ml-1" : ""}`}
            style={{ backgroundColor: info?.bg ?? "hsl(var(--background))", color: info?.fg, borderColor: info ? info.fg : undefined }}
          >
            <span className="block text-[9px] text-muted-foreground" style={info ? { color: info.fg } : undefined}>{t}</span>
            <span className="block text-[10px] font-bold h-3">{info?.code ?? ""}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2">
      <div role="group" aria-label={`${label}: status to mark`} className="flex flex-wrap gap-1.5">
        {TOOTH_STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={brush === s.key}
            onClick={() => setBrush(s.key)}
            className={`text-xs rounded-full border px-2.5 py-1 ${brush === s.key ? "ring-2 ring-offset-1 ring-ring font-semibold" : ""}`}
            style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.fg }}
          >
            {s.code} · {s.label}
          </button>
        ))}
        {Object.keys(value).length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange({})}>
            Clear chart
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[520px] space-y-1.5">
          {row(UPPER_TEETH)}
          {row(LOWER_TEETH)}
        </div>
      </div>
    </div>
  );
};

export default ToothChartInput;
