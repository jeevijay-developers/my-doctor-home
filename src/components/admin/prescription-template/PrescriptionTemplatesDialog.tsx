import type { ComponentProps } from "react";
import { useCallback, useRef, useState } from "react";
import { Copy, Pencil, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePractitioners } from "@/hooks/usePractitioners";
import type { usePrescriptionTemplates } from "@/hooks/usePrescriptionTemplates";
import { TEMPLATE_PRESETS, defaultTemplateConfig, presetLabel } from "@/lib/prescriptionTemplate/defaults";
import { LIMITS, type TemplateConfig } from "@/lib/prescriptionTemplate/types";
import type { PrescriptionTemplate } from "@/lib/prescriptionTemplate/resolve";
import TemplateEditor from "./TemplateEditor";
import { PrescriptionSlipCard } from "../PrescriptionSlip";

/** The clinic (or author doctor) profile the slip prints, as PrescriptionSlipCard takes it. */
type SlipProfile = ComponentProps<typeof PrescriptionSlipCard>["profile"];

type Api = ReturnType<typeof usePrescriptionTemplates>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: Api;
  /** The clinic profile (letterhead shown in the preview). */
  profile: SlipProfile;
  /** The clinic owner may manage every template; a doctor login only their own. */
  isOwner: boolean;
  myPractitionerId: string | null;
};

type Editing = { id?: string; name: string; preset: string | null; config: TemplateConfig; practitioner_id: string | null; is_default: boolean };

const drName = (name: string) => `Dr. ${name.trim().replace(/^dr\.?\s+/i, "")}`;

// Lists the clinic's prescription templates and opens the builder. Doctors build and edit their own.
const PrescriptionTemplatesDialog = ({ open, onOpenChange, api, profile, isOwner, myPractitionerId }: Props) => {
  const { templates, save, remove, makeDefault } = api;
  const { isMulti, active, byId } = usePractitioners();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<PrescriptionTemplate | null>(null);
  // Unsaved builder changes: leaving (Cancel, Escape, the close button, clicking outside) asks first.
  const dirty = useRef(false);
  const [confirmLeave, setConfirmLeave] = useState<(() => void) | null>(null);
  const onDirtyChange = useCallback((d: boolean) => { dirty.current = d; }, []);
  const leave = (action: () => void) => {
    if (editing && dirty.current) setConfirmLeave(() => action);
    else action();
  };
  const closeEditor = () => { dirty.current = false; setEditing(null); };

  const canEdit = (t: PrescriptionTemplate) => isOwner || (t.practitioner_id !== null && t.practitioner_id === myPractitionerId);
  // A doctor login's new templates are always their own; the owner of a multi-doctor clinic picks.
  const newScope = isOwner ? null : myPractitionerId;
  const doctors = isOwner && isMulti ? active.map((p) => ({ id: p.id, name: drName(p.display_name) })) : [];
  const scopeName = (t: PrescriptionTemplate) =>
    t.practitioner_id === null ? "Whole clinic" : byId(t.practitioner_id) ? drName(byId(t.practitioner_id)!.display_name) : "One doctor";

  const startNew = (presetKey: string) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.key === presetKey);
    setEditing({
      name: preset ? preset.label : "New template",
      preset: presetKey,
      config: preset ? preset.build() : defaultTemplateConfig(),
      practitioner_id: newScope,
      // A template you just made is the one you want to use; the previous default stays in the Template box.
      is_default: true,
    });
  };
  const edit = (t: PrescriptionTemplate) =>
    setEditing({ id: t.id, name: t.name, preset: t.preset, config: t.config, practitioner_id: t.practitioner_id, is_default: t.is_default });
  const duplicate = (t: PrescriptionTemplate) =>
    setEditing({
      name: `${t.name} (copy)`.slice(0, LIMITS.templateName), preset: t.preset, config: t.config,
      practitioner_id: isOwner ? t.practitioner_id : newScope, is_default: false,
    });

  const setDefault = async (t: PrescriptionTemplate) => {
    const err = await makeDefault(t.id);
    if (err) toast.error(err); else toast.success(`"${t.name}" is now the default`);
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    const err = await remove(deleting.id);
    setDeleting(null);
    if (err) toast.error(err); else toast.success("Template deleted");
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) onOpenChange(true);
          else leave(() => { closeEditor(); onOpenChange(false); });
        }}
      >
        <DialogContent className={`${editing ? "sm:max-w-6xl" : "sm:max-w-2xl"} max-h-[92vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>{editing ? (editing.id ? "Edit template" : "New template") : "Prescription templates"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Choose what your prescription shows and how it looks. The preview updates as you change things."
                : "Design how your prescriptions look and which fields they have. Prescriptions you already issued keep their own layout."}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <TemplateEditor
              key={editing.id ?? "new"}
              initial={editing}
              profile={profile}
              doctors={doctors}
              scopeLocked={!isOwner}
              onSave={async (input) => {
                const err = await save(input);
                if (!err) closeEditor();
                return err;
              }}
              onCancel={() => leave(closeEditor)}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Create a template — start from</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TEMPLATE_PRESETS.map((p) => (
                    <button
                      key={p.key} type="button" onClick={() => startNew(p.key)}
                      disabled={templates.length >= LIMITS.templatesPerClinic || (!isOwner && !myPractitionerId)}
                      className="text-left rounded-lg border p-3 hover:bg-secondary/60 disabled:opacity-50"
                    >
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{p.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Your templates</h3>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No templates yet. Your prescriptions use the standard layout until you create one.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {templates.map((t) => (
                      <li key={t.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium break-words">{t.name}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {t.is_default && <Badge>Default</Badge>}
                              <Badge variant="secondary">{scopeName(t)}</Badge>
                              {presetLabel(t.preset) && <Badge variant="outline">{presetLabel(t.preset)}</Badge>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {canEdit(t) && (
                              <Button type="button" variant="outline" size="sm" className="h-8" aria-label={`Edit ${t.name}`} onClick={() => edit(t)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                              </Button>
                            )}
                            <Button
                              type="button" variant="outline" size="sm" className="h-8" aria-label={`Duplicate ${t.name}`}
                              disabled={templates.length >= LIMITS.templatesPerClinic || (!isOwner && !myPractitionerId)}
                              onClick={() => duplicate(t)}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" /> Duplicate
                            </Button>
                            {canEdit(t) && !t.is_default && (
                              <Button type="button" variant="outline" size="sm" className="h-8" aria-label={`Make ${t.name} the default`} onClick={() => setDefault(t)}>
                                <Star className="h-3.5 w-3.5 mr-1" /> Make default
                              </Button>
                            )}
                            {canEdit(t) && (
                              <Button type="button" variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmLeave} onOpenChange={(o) => { if (!o) setConfirmLeave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>The changes you made to this template have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => { const go = confirmLeave; setConfirmLeave(null); go?.(); }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Prescriptions already issued with it are not changed; they keep the layout they were issued with.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PrescriptionTemplatesDialog;
