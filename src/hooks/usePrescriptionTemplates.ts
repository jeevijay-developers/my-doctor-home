import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseTemplateRow, type PrescriptionTemplate } from "@/lib/prescriptionTemplate/resolve";
import type { TemplateConfig } from "@/lib/prescriptionTemplate/types";

export type TemplateInput = {
  id?: string;
  name: string;
  preset: string | null;
  config: TemplateConfig;
  /** null = the whole clinic. */
  practitioner_id: string | null;
  is_default: boolean;
};

const EMPTY: PrescriptionTemplate[] = [];

const table = () => supabase.from("prescription_templates");

const friendly = (message: string | undefined) =>
  message?.includes("TEMPLATE_LIMIT") ? "You can keep at most 20 templates. Delete one first." : "Could not save the template.";

// The clinic's prescription templates. A failed load (for example the migration is not applied
// yet) means "no templates": prescriptions then use the standard slip, and nothing breaks.
export function usePrescriptionTemplates(clinicId: string | null | undefined) {
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>(EMPTY);
  const [loading, setLoading] = useState(!!clinicId);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    if (!clinicId) { setTemplates(EMPTY); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await table().select("*").eq("doctor_id", clinicId).order("created_at");
    if (mine !== seq.current) return;
    if (error || !Array.isArray(data)) {
      if (error) console.warn("Could not load prescription templates:", error.message ?? error);
      setTemplates(EMPTY);
    } else {
      setTemplates(data.map(parseTemplateRow).filter((t): t is PrescriptionTemplate => t !== null));
    }
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { void reload(); }, [reload]);

  // Resolves to an error message, or null on success.
  const save = useCallback(async (input: TemplateInput): Promise<string | null> => {
    if (!clinicId) return "Could not save the template.";
    const row = {
      name: input.name.trim(),
      preset: input.preset,
      config: input.config,
      is_default: input.is_default,
      practitioner_id: input.practitioner_id,
    };
    const { error } = input.id
      ? await table().update(row).eq("id", input.id)
      : await table().insert({ ...row, doctor_id: clinicId });
    if (error) return friendly(error.message);
    await reload();
    return null;
  }, [clinicId, reload]);

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await table().delete().eq("id", id);
    if (error) return "Could not delete the template.";
    await reload();
    return null;
  }, [reload]);

  const makeDefault = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await table().update({ is_default: true }).eq("id", id);
    if (error) return "Could not change the default template.";
    await reload();
    return null;
  }, [reload]);

  return { templates, loading, reload, save, remove, makeDefault };
}
