import { LOWER_TEETH, TOOTH_STATUSES, UPPER_TEETH, toothStatusInfo } from "@/lib/prescriptionTemplate/teeth";
import type { ToothMap } from "@/lib/prescriptionTemplate/types";

// Printable tooth chart (FDI). Fixed colours, not theme tokens: the slip is always white paper.
const Row = ({ teeth, map, accent }: { teeth: readonly string[]; map: ToothMap; accent: string }) => (
  <div className="grid" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
    {teeth.map((t, i) => {
      const status = map[t];
      const info = status ? toothStatusInfo(status) : null;
      return (
        <div
          key={t}
          data-tooth={t}
          className="text-center leading-none py-[3px] border-t border-b border-gray-300"
          style={{
            backgroundColor: info?.bg ?? "#ffffff",
            borderLeft: i === 8 ? `2px solid ${accent}` : i === 0 ? "1px solid #d1d5db" : undefined,
            borderRight: i === 15 ? "1px solid #d1d5db" : "1px solid #e5e7eb",
          }}
        >
          <div className="text-[8px] text-gray-500">{t}</div>
          <div className="text-[9px] font-bold h-[11px]" style={{ color: info?.fg }}>{info?.code ?? ""}</div>
        </div>
      );
    })}
  </div>
);

export const ToothChartView = ({ value, accent }: { value: ToothMap; accent: string }) => (
  <div>
    <div className="space-y-1">
      <Row teeth={UPPER_TEETH} map={value} accent={accent} />
      <Row teeth={LOWER_TEETH} map={value} accent={accent} />
    </div>
    <p className="text-[10px] text-gray-500 mt-1.5 break-words">
      {TOOTH_STATUSES.map((s) => `${s.code} = ${s.label}`).join("  ·  ")}
    </p>
  </div>
);

export default ToothChartView;
