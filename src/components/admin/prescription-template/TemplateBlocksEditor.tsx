import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cleanOptions, newCustomBlock, placementsFor } from "@/lib/prescriptionTemplate/config";
import { VITAL_META } from "@/lib/prescriptionTemplate/vitals";
import {
  ADVICE_KEYS, ADVICE_LABELS, BUILTIN_BLOCK_LABELS, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, INFO_FIELD_KEYS,
  INFO_FIELD_LABELS, LIMITS, PLACEMENT_LABELS, VITAL_KEYS, isCustomBlock,
  type AdviceKey, type Block, type CustomBlock, type CustomFieldType, type CustomPlacement, type InfoFieldKey, type VitalKey,
} from "@/lib/prescriptionTemplate/types";

type Props = { blocks: Block[]; onChange: (next: Block[]) => void };

const needsOptions = (t: CustomFieldType) => t === "select" || t === "multiselect";

// Short note on where a custom field is printed, for the section list.
const placementNote = (b: CustomBlock, blocks: Block[]) => {
  if (b.placement === "section") return "";
  const hostOn = blocks.some((x) => x.type === b.placement && x.enabled);
  return ` · ${PLACEMENT_LABELS[b.placement].toLowerCase()}${hostOn ? "" : " (hidden: that section is off)"}`;
};

// The settings of one custom field: name, type, where it goes, choices and whether it must be answered.
const CustomFieldEditor = ({ block, onChange }: { block: CustomBlock; onChange: (patch: Partial<CustomBlock>) => void }) => {
  // The raw text is kept here so a trailing newline survives while typing; only clean choices are saved.
  const [optionsText, setOptionsText] = useState(block.options.join("\n"));
  const places = placementsFor(block.fieldType);
  return (
    <div className="mt-2 space-y-3 rounded-md border bg-secondary/30 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${block.id}-label`} className="text-xs">Field name</Label>
          <Input id={`${block.id}-label`} className="h-9" maxLength={LIMITS.label} value={block.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={block.fieldType}
            // A type that does not fit the chosen place (a tooth chart in the patient box) moves the field to its own section.
            onValueChange={(v: CustomFieldType) => onChange({ fieldType: v, ...(placementsFor(v).includes(block.placement) ? {} : { placement: "section" as const }) })}
          >
            <SelectTrigger className="h-9" aria-label={`Type of ${block.label || "field"}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOM_FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Where it appears</Label>
        <Select value={block.placement} onValueChange={(v: CustomPlacement) => onChange({ placement: v })}>
          <SelectTrigger className="h-9" aria-label={`Where ${block.label || "field"} appears`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {places.map((p) => <SelectItem key={p} value={p}>{PLACEMENT_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {needsOptions(block.fieldType) && (
        <div className="space-y-1">
          <Label htmlFor={`${block.id}-options`} className="text-xs">Choices (one per line, at least two)</Label>
          <Textarea
            id={`${block.id}-options`} rows={4}
            value={optionsText}
            onChange={(e) => { setOptionsText(e.target.value); onChange({ options: cleanOptions(e.target.value.split("\n")) }); }}
          />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={block.required} onCheckedChange={(c) => onChange({ required: !!c })} />
        Must be filled in before saving
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={block.carryForward} onCheckedChange={(c) => onChange({ carryForward: !!c })} />
        Fill in from the patient's last prescription (for histories, allergies)
      </label>
    </div>
  );
};

// A tick-list of the rows a built-in section offers (patient box rows, vitals, kinds of advice).
function FieldPicker<K extends string>({
  keys, selected, label, onChange, columns = 2, children,
}: {
  keys: readonly K[]; selected: K[]; label: (k: K) => string; onChange: (next: K[]) => void; columns?: 2 | 3; children?: ReactNode;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border bg-secondary/30 p-3">
      <div className={`grid grid-cols-1 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-x-4 gap-y-1.5`}>
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={selected.includes(k)}
              // Keeps the section's own order whatever order the boxes are ticked in.
              onCheckedChange={(c) => onChange(keys.filter((x) => (x === k ? !!c : selected.includes(x))))}
            />
            {label(k)}
          </label>
        ))}
      </div>
      {children}
    </div>
  );
}

// The ordered list of sections: switch on/off, move, choose their rows, add custom fields (as a section of their
// own or inside a built-in one), rename/retype/remove them.
const TemplateBlocksEditor = ({ blocks, onChange }: Props) => {
  const [open, setOpen] = useState<string | null>(null);
  const [newType, setNewType] = useState<CustomFieldType>("text");
  const customCount = blocks.filter(isCustomBlock).length;
  const full = customCount >= LIMITS.customFields || blocks.length >= LIMITS.blocks;

  const patch = (id: string, p: Partial<Block>) => onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const addField = (placement: CustomPlacement = "section", type: CustomFieldType = newType) => {
    const b = newCustomBlock(blocks, type, CUSTOM_FIELD_TYPE_LABELS[type], placement);
    if (needsOptions(type)) b.options = ["Option 1", "Option 2"];
    onChange([...blocks, b]);
    setOpen(b.id);
  };
  const addHere = (where: Exclude<CustomPlacement, "section">) => (
    <Button type="button" variant="outline" size="sm" className="h-8" disabled={full} onClick={() => addField(where, where === "advice" ? "textarea" : "text")}>
      <Plus className="h-3.5 w-3.5 mr-1" /> Add your own field here
    </Button>
  );

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {blocks.map((b, i) => {
          const name = isCustomBlock(b) ? b.label || "Untitled field" : BUILTIN_BLOCK_LABELS[b.type];
          const hasSettings = b.type === "patient_info" || b.type === "vitals" || b.type === "advice" || isCustomBlock(b);
          return (
            <li key={b.id} className="rounded-lg border bg-card p-2.5">
              <div className="flex items-center gap-2">
                <Switch checked={b.enabled} onCheckedChange={(c) => patch(b.id, { enabled: c })} aria-label={`Show ${name}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${b.enabled ? "" : "text-muted-foreground line-through"}`}>{name}</p>
                  {isCustomBlock(b) && (
                    <p className="text-[11px] text-muted-foreground">
                      {CUSTOM_FIELD_TYPE_LABELS[b.fieldType]}{b.required ? " · required" : ""}{b.carryForward ? " · carried forward" : ""}{placementNote(b, blocks)}
                    </p>
                  )}
                </div>
                <div className="flex items-center">
                  {hasSettings && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Edit ${name}`} aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Move ${name} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {isCustomBlock(b) && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" aria-label={`Remove ${name}`} onClick={() => onChange(blocks.filter((x) => x.id !== b.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {open === b.id && b.type === "patient_info" && (
                <FieldPicker<InfoFieldKey> keys={INFO_FIELD_KEYS} selected={b.fields} label={(k) => INFO_FIELD_LABELS[k]} onChange={(fields) => patch(b.id, { fields })}>
                  {addHere("patient_info")}
                </FieldPicker>
              )}
              {open === b.id && b.type === "vitals" && (
                <FieldPicker<VitalKey>
                  keys={VITAL_KEYS} selected={b.fields} columns={3}
                  label={(k) => VITAL_META[k].label} onChange={(fields) => patch(b.id, { fields })}
                >
                  {addHere("vitals")}
                </FieldPicker>
              )}
              {open === b.id && b.type === "advice" && (
                <FieldPicker<AdviceKey> keys={ADVICE_KEYS} selected={b.fields} columns={3} label={(k) => ADVICE_LABELS[k]} onChange={(fields) => patch(b.id, { fields })}>
                  {addHere("advice")}
                </FieldPicker>
              )}
              {open === b.id && isCustomBlock(b) && (
                <CustomFieldEditor block={b} onChange={(p) => patch(b.id, p)} />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="space-y-1">
          <Label className="text-xs">Add a field</Label>
          <Select value={newType} onValueChange={(v: CustomFieldType) => setNewType(v)}>
            <SelectTrigger className="h-9 w-48" aria-label="New field type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOM_FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" className="h-9" disabled={full} onClick={() => addField()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add field
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        To put a field inside the patient details, vitals or advice, open that section's settings (pencil) and choose
        "Add your own field here", or change "Where it appears" on any field.
      </p>
    </div>
  );
};

export default TemplateBlocksEditor;
