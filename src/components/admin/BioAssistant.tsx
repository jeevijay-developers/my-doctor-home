import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BIO_MAX, analyzeBio, buildBioFromDetails, sanitizeBio, topicsFor,
} from "@/lib/doctorBio";

export interface BioAssistantContext {
  name?: string | null;
  specialization?: string | null;
  qualifications?: string | null;
  experience?: number | string | null;
  clinicName?: string | null;
  locality?: string | null;
  city?: string | null;
  services?: Array<string | null | undefined> | null;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  context: BioAssistantContext;
  disabled?: boolean;
  /** Prefix for element ids, so the block can appear twice on a page. */
  idPrefix: string;
  /** Extra guidance shown under the textarea, next to the counter. */
  helpText?: ReactNode;
  rows?: number;
}

type Pending = "fill" | "ai" | null;
type Tone = "professional" | "warm";

const ADVICE = "Mention your specialty, city and qualifications so patients searching on Google find you.";
const AI_TIMEOUT_MS = 35_000;

const aiErrorMessage = (status: number, serverMessage?: string): string => {
  if (status === 429) return "You have used all your AI bios for this hour. Try again later, or use Fill from my details.";
  if (status === 403) return "AI writing is not available for your account. You can still use Fill from my details.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 400) return serverMessage ? `Please check your details: ${serverMessage}.` : "Please check your details and try again.";
  if (status === 504) return "The AI took too long. Please try again.";
  return "The AI could not write your bio right now. Please try again in a moment, or use Fill from my details.";
};

/**
 * One bio editor for the owner's Profile, the Doctors form and a doctor login's own card: a plain-text
 * box, a deterministic "Fill from my details", an AI draft, Undo, and a live checklist of what helps a
 * bio show up in Google. Drafts only ever land in the box; saving stays with the caller.
 */
const BioAssistant = ({ value, onChange, context, disabled = false, idPrefix, helpText, rows = 5 }: Props) => {
  const uid = useId();
  const id = `${idPrefix}-bio`;
  const [previous, setPrevious] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>("professional");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const topics = useMemo(() => topicsFor(context.specialization), [context.specialization]);
  const services = useMemo(() => (context.services ?? []).filter((s): s is string => !!s && !!s.trim()).slice(0, 6), [context.services]);
  const analysis = useMemo(
    () => analyzeBio(value, {
      specialization: context.specialization, qualifications: context.qualifications,
      experienceYears: context.experience, city: context.city, locality: context.locality,
    }),
    [value, context.specialization, context.qualifications, context.experience, context.city, context.locality],
  );

  const apply = (next: string) => {
    setPrevious(value);
    onChange(next);
  };

  const doFill = () => {
    const draft = buildBioFromDetails({
      name: context.name, specialization: context.specialization, qualifications: context.qualifications,
      experienceYears: context.experience, clinicName: context.clinicName, locality: context.locality,
      city: context.city, services, conditions: picked,
    });
    if (!draft) {
      setError("Add your name or specialization first, then try again.");
      return;
    }
    setError(null);
    apply(sanitizeBio(draft));
    setStatus("Your bio was filled from your details. Review it, then save.");
  };

  const doAi = async () => {
    setError(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You appear to be offline. Check your connection and try again.");
      return;
    }
    if (!context.name?.trim() && !context.specialization?.trim()) {
      setError("Add your name or specialization first, then try again.");
      return;
    }
    setBusy(true);
    setStatus("Writing your bio...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError(aiErrorMessage(401));
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-bio-writer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: context.name ?? "",
          specialization: context.specialization ?? "",
          qualifications: context.qualifications ?? "",
          experienceYears: context.experience === "" ? null : context.experience ?? null,
          clinicName: context.clinicName ?? "",
          locality: context.locality ?? "",
          city: context.city ?? "",
          services,
          conditions: picked,
          tone,
          optionalNotes: notes.trim(),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(aiErrorMessage(res.status, typeof body?.error === "string" ? body.error : undefined));
        return;
      }
      const body = await res.json().catch(() => ({}));
      const bio = typeof body?.bio === "string" ? sanitizeBio(body.bio) : "";
      if (!bio) {
        setError("The AI did not return a bio. Please try again.");
        return;
      }
      apply(bio);
      setStatus("The AI wrote a draft. Read it, correct anything that is not true, then save.");
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      setError(timedOut ? "The AI took too long. Please try again." : "Could not reach the AI. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      setStatus((s) => (s === "Writing your bio..." ? "" : s));
    }
  };

  const request = (kind: Exclude<Pending, null>) => {
    if (value.trim()) setPending(kind);
    else if (kind === "fill") doFill();
    else void doAi();
  };

  const confirm = () => {
    const kind = pending;
    setPending(null);
    if (kind === "fill") doFill();
    else if (kind === "ai") void doAi();
  };

  const undo = () => {
    if (previous === null) return;
    onChange(previous);
    setPrevious(null);
    setStatus("Your previous bio was restored.");
  };

  const toggleTopic = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length >= 8 ? p : [...p, t]));

  const locked = disabled || busy;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Bio</Label>
        <Textarea id={id} rows={rows} value={value} maxLength={BIO_MAX} disabled={disabled || busy}
          aria-describedby={`${id}-help`} onChange={(e) => onChange(e.target.value)} />
        <div id={`${id}-help`} className="flex flex-wrap items-start justify-between gap-x-3 text-[11px] text-muted-foreground">
          <span>{helpText ?? "Shown on your public doctor page. Plain text only."}</span>
          <span className="tabular-nums" data-testid="bio-counter">{value.length}/{BIO_MAX}</span>
        </div>
      </div>

      {!disabled && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          {topics.length > 0 && (
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-medium text-foreground">Add conditions you treat (optional)</legend>
              <p className="text-[11px] text-muted-foreground">Tick only what you actually treat. You are responsible for what your bio says.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {topics.map((t, i) => (
                  <label key={t} htmlFor={`${uid}-t${i}`} className="inline-flex items-center gap-1.5 text-sm">
                    <input id={`${uid}-t${i}`} type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={picked.includes(t)} disabled={locked} onChange={() => toggleTopic(t)} />
                    {t}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor={`${id}-notes`} className="text-xs">Anything else that is true about you (optional, for the AI)</Label>
              <input id={`${id}-notes`} value={notes} maxLength={300} disabled={locked} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Fellowship in dermatosurgery, speaks Hindi and English"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-tone`} className="text-xs">Tone</Label>
              <select id={`${id}-tone`} value={tone} disabled={locked} onChange={(e) => setTone(e.target.value as Tone)}
                className="flex h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="professional">Professional</option>
                <option value="warm">Warm</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => request("fill")}>
              <Wand2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Fill from my details
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => request("ai")}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Write with AI
            </Button>
            {previous !== null && (
              <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={undo}>
                <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Undo
              </Button>
            )}
          </div>

          {pending && (
            <div role="alertdialog" aria-label="Replace your bio?" className="rounded-md bg-secondary p-3 text-sm">
              <p>This replaces the bio you have written. You can press Undo afterwards.</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" onClick={confirm}>Replace my bio</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>Keep my bio</Button>
              </div>
            </div>
          )}

          <p role="status" aria-live="polite" className="min-h-[1rem] text-xs text-muted-foreground">{status}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <section aria-label="Search checklist" className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">Search checklist</h4>
        <ul className="flex flex-wrap gap-1.5">
          {analysis.checks.map((c) => (
            <li key={c.key} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${c.ok ? "border-success/30 bg-success/15 text-success" : "border-border bg-muted/40 text-muted-foreground"}`}>
              {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
              <span className="sr-only">{c.ok ? "Done: " : "Missing: "}</span>
              {c.label}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">{ADVICE} {analysis.lengthHint}</p>
      </section>
    </div>
  );
};

export default BioAssistant;
