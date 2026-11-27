import { formatExtraValue, isEmptyValue, parseExtra } from "@/lib/prescriptionTemplate/extra";
import { parseToothMap } from "@/lib/prescriptionTemplate/teeth";
import { isCustomBlock, type TemplateConfig } from "@/lib/prescriptionTemplate/types";
import { Label } from "@/components/ui/label";
import ToothChartView from "../prescription-slip/ToothChartView";
import PainScaleView from "../prescription-slip/PainScaleView";

type Props = { config: TemplateConfig; extra: unknown };

// The answers to a template's own fields, read-only, for the prescription's side panel. Shows nothing
// for a prescription without answers (every prescription written before templates existed).
const TemplateAnswersView = ({ config, extra }: Props) => {
  const values = parseExtra(extra);
  const answered = config.blocks.filter(isCustomBlock).filter((b) => !isEmptyValue(values[b.id]));
  if (answered.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="template-answers">
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
