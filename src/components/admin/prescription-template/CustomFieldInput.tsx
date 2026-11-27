import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PAIN_LABELS } from "@/lib/prescriptionTemplate/extra";
import { parseToothMap } from "@/lib/prescriptionTemplate/teeth";
import type { CustomBlock } from "@/lib/prescriptionTemplate/types";
import ToothChartInput from "./ToothChartInput";

type Props = {
  block: CustomBlock;
  value: unknown;
  /** undefined clears the answer. */
  onChange: (value: unknown) => void;
  idPrefix: string;
};

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`text-sm rounded-full border px-3 py-1.5 transition-colors ${
      on ? "bg-royal text-white border-royal" : "bg-background text-foreground border-border hover:bg-secondary"
    }`}
  >
    {children}
  </button>
);

// One input per custom field type. Choice fields are tap-to-toggle chips: tapping the chosen one again clears it.
const CustomFieldInput = ({ block, value, onChange, idPrefix }: Props) => {
  const id = `${idPrefix}-${block.id}`;
  const label = (
    <Label htmlFor={id} className="text-sm">
      {block.label}{block.required ? " *" : ""}
    </Label>
  );
  const group = (children: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label className="text-sm">{block.label}{block.required ? " *" : ""}</Label>
      <div role="group" aria-label={block.label} className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );

  switch (block.fieldType) {
    case "text":
      return (
        <div className="space-y-1.5">
          {label}
          <Input id={id} className="h-10" maxLength={200} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id} className="h-10" inputMode="decimal" maxLength={12}
            value={typeof value === "number" ? String(value) : typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9.-]/g, ""))}
          />
        </div>
      );
    case "textarea":
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea id={id} rows={3} maxLength={2000} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1.5">
          {label}
          <Input id={id} type="date" className="h-10" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)} />
        </div>
      );
    case "select":
      return group(
        block.options.map((o) => (
          <Chip key={o} on={value === o} onClick={() => onChange(value === o ? undefined : o)}>{o}</Chip>
        )),
      );
    case "multiselect": {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return group(
        block.options.map((o) => (
          <Chip
            key={o}
            on={chosen.includes(o)}
            onClick={() => onChange(chosen.includes(o) ? chosen.filter((c) => c !== o) : [...chosen, o])}
          >
            {o}
          </Chip>
        )),
      );
    }
    case "checkbox":
      return group(
        <>
          <Chip on={value === true} onClick={() => onChange(value === true ? undefined : true)}>Yes</Chip>
          <Chip on={value === false} onClick={() => onChange(value === false ? undefined : false)}>No</Chip>
        </>,
      );
    case "pain_scale":
      return group(
        PAIN_LABELS.map((p, i) => (
          <Chip key={p} on={value === i} onClick={() => onChange(value === i ? undefined : i)}>{i} · {p}</Chip>
        )),
      );
    case "tooth_chart":
      return (
        <div className="space-y-1.5">
          <Label className="text-sm">{block.label}{block.required ? " *" : ""}</Label>
          <ToothChartInput label={block.label} value={parseToothMap(value)} onChange={(next) => onChange(Object.keys(next).length ? next : undefined)} />
        </div>
      );
  }
};

export default CustomFieldInput;
