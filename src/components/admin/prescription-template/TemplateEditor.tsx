import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MIN_ACCENT_CONTRAST, contrastOnWhite, isHexColor, validateTemplateConfig, validateTemplateName } from "@/lib/prescriptionTemplate/config";
import { sampleSlip } from "@/lib/prescriptionTemplate/sample";
import { LIMITS, type Letterhead, type TemplateConfig } from "@/lib/prescriptionTemplate/types";
import type { TemplateInput } from "@/hooks/usePrescriptionTemplates";
import { PrescriptionSlipCard } from "../PrescriptionSlip";
import TemplateBlocksEditor from "./TemplateBlocksEditor";

/** The clinic (or author doctor) profile the slip prints, as PrescriptionSlipCard takes it. */
type SlipProfile = ComponentProps<typeof PrescriptionSlipCard>["profile"];

export type EditorDoctor = { id: string; name: string };

type Props = {
  initial: { id?: string; name: string; preset: string | null; config: TemplateConfig; practitioner_id: string | null; is_default: boolean };
  /** The clinic profile, so the preview shows the real letterhead. */
  profile: SlipProfile;
  /** Doctors the template can be scoped to (the owner of a multi-doctor clinic). Empty = no choice. */
  doctors: EditorDoctor[];
  /** A doctor login's template is always their own: the scope cannot be changed. */
  scopeLocked: boolean;
  onSave: (input: TemplateInput) => Promise<string | null>;
  onCancel: () => void;
  /** Told whether there are unsaved changes, so closing can ask before discarding them. */
  onDirtyChange?: (dirty: boolean) => void;
};

const SWATCHES = ["#1d4ed8", "#0f766e", "#7c3aed", "#b91c1c", "#c2410c", "#334155"];
const CLINIC_SCOPE = "__clinic";

const Toggle = ({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
    <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(!!c)} />
    {children}
  </label>
);

// Builds one template: name and scope, look (colour, title, letterhead), and the sections with a
// live preview that updates as you change anything.
const TemplateEditor = ({ initial, profile, doctors, scopeLocked, onSave, onCancel, onDirtyChange }: Props) => {
  const [name, setName] = useState(initial.name);
  const [scope, setScope] = useState<string | null>(initial.practitioner_id);
  const [isDefault, setIsDefault] = useState(initial.is_default);
  const [config, setConfig] = useState<TemplateConfig>(initial.config);
  const [saving, setSaving] = useState(false);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const preview = useMemo(() => sampleSlip(config, today), [config, today]);

  const set = (p: Partial<TemplateConfig>) => setConfig((c) => ({ ...c, ...p }));

  const initialState = useRef(JSON.stringify({ name: initial.name, scope: initial.practitioner_id, isDefault: initial.is_default, config: initial.config }));
  const dirty = useMemo(
    () => JSON.stringify({ name, scope, isDefault, config }) !== initialState.current,
    [name, scope, isDefault, config],
  );
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const tooLight = isHexColor(config.accent) && contrastOnWhite(config.accent) < MIN_ACCENT_CONTRAST;

  const save = async () => {
    const problem = validateTemplateName(name) ?? validateTemplateConfig(config);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const error = await onSave({
      id: initial.id, name, preset: initial.preset, config, practitioner_id: scope, is_default: isDefault,
    });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success("Template saved");
  };

  const mm = (key: "preprintedTopMm" | "preprintedBottomMm", label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`tpl-${key}`} className="text-xs">{label}</Label>
      <Input
        id={`tpl-${key}`} className="h-9" type="number" min={0} max={LIMITS.maxMm}
        value={config[key]}
        onChange={(e) => set({ [key]: Math.min(LIMITS.maxMm, Math.max(0, Number(e.target.value) || 0)) } as Partial<TemplateConfig>)}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6 min-w-0">
        <section className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" className="h-10" maxLength={LIMITS.templateName} placeholder="e.g. Dental case sheet" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {doctors.length > 0 && !scopeLocked && (
            <div className="space-y-1.5">
              <Label>Used by</Label>
              <Select value={scope ?? CLINIC_SCOPE} onValueChange={(v) => setScope(v === CLINIC_SCOPE ? null : v)}>
                <SelectTrigger className="h-10" aria-label="Used by"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLINIC_SCOPE}>Whole clinic</SelectItem>
                  {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Toggle id="tpl-default" checked={isDefault} onChange={setIsDefault}>Use as the default for new prescriptions</Toggle>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Look</h3>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-title">Title under the header (optional)</Label>
            <Input id="tpl-title" className="h-10" maxLength={LIMITS.title} placeholder="e.g. OPD CARD" value={config.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Accent colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c} type="button" aria-label={`Accent ${c}`} aria-pressed={config.accent === c}
                  onClick={() => set({ accent: c })}
                  className={`h-7 w-7 rounded-full border-2 ${config.accent === c ? "ring-2 ring-offset-2 ring-ring" : ""}`}
                  style={{ backgroundColor: c, borderColor: c }}
                />
              ))}
              <input
                type="color" aria-label="Custom accent colour" value={isHexColor(config.accent) ? config.accent : "#1d4ed8"}
                onChange={(e) => set({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
              />
            </div>
            {tooLight && (
              <p role="alert" className="text-xs text-destructive">
                This colour is too light to read on white paper, and the QR code may not scan. Choose a darker one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Letterhead</Label>
            <Select value={config.letterhead} onValueChange={(v: Letterhead) => set({ letterhead: v })}>
              <SelectTrigger className="h-10" aria-label="Letterhead"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Print my clinic header and footer</SelectItem>
                <SelectItem value="preprinted">I print on pre-printed stationery (leave space)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {config.letterhead === "preprinted" ? (
            <div className="grid grid-cols-2 gap-3">
              {mm("preprintedTopMm", "Space for header (mm)")}
              {mm("preprintedBottomMm", "Space for footer (mm)")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <Toggle id="tpl-h-qual" checked={config.header.qualifications} onChange={(v) => set({ header: { ...config.header, qualifications: v } })}>Show qualifications</Toggle>
              <Toggle id="tpl-h-reg" checked={config.header.registration} onChange={(v) => set({ header: { ...config.header, registration: v } })}>Show registration number</Toggle>
              <Toggle id="tpl-h-contact" checked={config.header.contact} onChange={(v) => set({ header: { ...config.header, contact: v } })}>Show phone and email</Toggle>
              <Toggle id="tpl-f-addr" checked={config.footer.address} onChange={(v) => set({ footer: { ...config.footer, address: v } })}>Show clinic address</Toggle>
              <Toggle id="tpl-f-qr" checked={config.footer.qr} onChange={(v) => set({ footer: { ...config.footer, qr: v } })}>Show website QR code</Toggle>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Sections and fields</h3>
          <p className="text-xs text-muted-foreground">
            Switch sections on or off, change their order, or add your own fields. A field left empty is not printed.
          </p>
          <TemplateBlocksEditor blocks={config.blocks} onChange={(blocks) => set({ blocks })} />
        </section>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1 h-10" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" className="flex-1 h-10 bg-royal hover:bg-royal/90" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save template"}
          </Button>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold mb-2">Preview</p>
        <div className="rounded-lg border bg-white overflow-hidden lg:sticky lg:top-0" aria-label="Template preview">
          <PrescriptionSlipCard profile={profile} prescription={preview} template={config} />
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
