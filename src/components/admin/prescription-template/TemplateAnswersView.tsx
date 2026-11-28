import { formatExtraValue, isEmptyValue, parseExtra } from "@/lib/prescriptionTemplate/extra";
import { parseToothMap } from "@/lib/prescriptionTemplate/teeth";
import { VITAL_KEYS, SYS_COMPLAINT, SYS_SYMPTOMS, isCustomBlock, sysVitalKey, type TemplateConfig } from "@/lib/prescriptionTemplate/types";
import { VITAL_META, formatVital } from "@/lib/prescriptionTemplate/vitals";
import { Label } from "@/components/ui/label";
import ToothChartView from "../prescription-slip/ToothChartView";
import PainScaleView from "../prescription-slip/PainScaleView";

type Props = { config: TemplateConfig; extra: unknown };

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);

// The answers typed on the prescription itself (complaint, symptoms, vitals, and the template's own fields),
// read-only, for the prescription's side panel. Shows nothing for a prescription without any (every
// prescription written before templates existed).
const TemplateAnswersView = ({ config, extra }: Props) => {
  const values = parseExtra(extra);
  const complaint = text(values[SYS_COMPLAINT]);
  const symptoms = text(values[SYS_SYMPTOMS]);
  const vitals = VITAL_KEYS.filter((k) => !isEmptyValue(values[sysVitalKey(k)]));
  const answered = config.blocks.filter(isCustomBlock).filter((b) => !isEmptyValue(values[b.id]));
  if (!complaint && !symptoms && vitals.length === 0 && answered.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="template-answers">
      {complaint && (
        <div>
          <Label className="text-xs text-muted-foreground">Complaint</Label>
          <p className="text-sm text-foreground mt-1 whitespace-pre-line break-words">{complaint}</p>
        </div>
      )}
      {symptoms && (
        <div>
          <Label className="text-xs text-muted-foreground">Symptoms</Label>
          <p className="text-sm text-foreground mt-1 whitespace-pre-line break-words">{symptoms}</p>
        </div>
      )}
      {vitals.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Vitals</Label>
          <p className="text-sm text-foreground mt-1">
            {vitals.map((k) => `${VITAL_META[k].chip}: ${formatVital(k, values[sysVitalKey(k)])}`).join("  ·  ")}
          </p>
        </div>
      )}
      {answered.map((b) => (
        <div key={b.id}>
          <Label className="text-xs text-muted-foreground">{b.label}</Label>
          {b.fieldType === "tooth_chart" || b.fieldType === "pain_scale" ? (
            // The chart and scale use fixed print colours, so they sit on white in dark mode too.
            <div className="mt-1 rounded-md bg-white p-2">
              {b.fieldType === "tooth_chart" ? (
                <ToothChartView value={parseToothMap(values[b.id])} accent={config.accent} />
              ) : (
                <PainScaleView value={Number(values[b.id])} accent={config.accent} />
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground mt-1 whitespace-pre-line break-words">{formatExtraValue(b, values[b.id])}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default TemplateAnswersView;
