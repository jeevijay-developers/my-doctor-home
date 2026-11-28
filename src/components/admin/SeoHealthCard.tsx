import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, CircleDashed, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SEO_STATUS_LABEL, computeSeoHealth, isSeoNudgeDismissed, setSeoNudgeDismissed,
  type SeoHealthInput, type SeoItem,
} from "@/lib/seoHealth";

type Counts = NonNullable<SeoHealthInput["counts"]>;
type Settings = NonNullable<SeoHealthInput["settings"]>;

// A failed lookup is "not known", never zero: the check is then left out of the score.
async function head(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    return error || typeof count !== "number" ? null : count;
  } catch {
    return null;
  }
}

const LEVEL_TEXT = { low: "Needs work", fair: "Getting there", good: "Looking good" } as const;
const LEVEL_STROKE = { low: "stroke-destructive", fair: "stroke-warning", good: "stroke-success" } as const;

const ScoreRing = ({ score, level }: { score: number; level: keyof typeof LEVEL_TEXT }) => {
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`Search visibility score ${score} out of 100, ${LEVEL_TEXT[level]}`}>
      <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-secondary" />
        <circle
          cx="36" cy="36" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          className={LEVEL_STROKE[level]} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-heading text-xl font-bold tabular-nums text-foreground" aria-hidden="true">{score}</span>
    </div>
  );
};

const Row = ({ item }: { item: SeoItem }) => {
  const done = item.status === "pass" || item.status === "auto";
  return (
    <li className="flex items-start gap-3 py-2.5">
      {done
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground break-words">
          {item.label}
          <span className="ml-2 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">{SEO_STATUS_LABEL[item.status]}</span>
        </p>
        {item.detail && <p className="text-xs text-muted-foreground break-words">{item.detail}</p>}
        {!done && item.status !== "unknown" && <p className="mt-0.5 text-xs text-muted-foreground">{item.howToFix}</p>}
      </div>
      {!done && item.status !== "unknown" && (
        <Link to={item.route} className="shrink-0 py-1 text-sm font-medium text-royal hover:underline" aria-label={`Fix: ${item.label}`}>Fix</Link>
      )}
    </li>
  );
};

// Dashboard card for the owner (and staff who may edit the website or profile): a 0-100 "Search visibility"
// score, the three most valuable next steps and the full checklist. Hidden for doctor logins. Only the
// "next steps" part can be dismissed (per clinic, in this browser); the card itself always stays.
const SeoHealthCard = () => {
  const { profile, isStaff, role, can } = useProfile();
  const { active } = usePractitioners();
  const clinicId = profile?.id ?? null;
  const allowed = role !== "doctor" && (!isStaff || !!can?.("website.edit") || !!can?.("profile.edit"));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [open, setOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => (clinicId ? isSeoNudgeDismissed(clinicId) : false));
  useEffect(() => { if (clinicId) setNudgeDismissed(isSeoNudgeDismissed(clinicId)); }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !allowed) return;
    let cancelled = false;
    const cnt = (table: string, apply: (q: any) => any = (q) => q) =>
      head(apply((supabase as any).from(table).select("id", { count: "exact", head: true }).eq("doctor_id", clinicId)));
    (async () => {
      const [settingsRes, pricedServices, reviews, publishedPosts, galleryPhotos, openDays] = await Promise.all([
        Promise.resolve((supabase as any).from("website_settings").select("seo_title, seo_description, hero_photo_url").eq("doctor_id", clinicId).maybeSingle())
          .then((r: any) => (r?.error ? null : r?.data ?? null), () => null),
        cnt("services", (q) => q.eq("active", true).gt("price", 0)),
        cnt("reviews", (q) => q.eq("is_visible", true)),
        cnt("blog_posts", (q) => q.eq("is_published", true)),
        cnt("gallery_photos"),
        cnt("working_hours", (q) => q.eq("is_open", true)),
      ]);
      if (cancelled) return;
      setSettings(settingsRes);
      setCounts({ pricedServices, reviews, publishedPosts, galleryPhotos, openDays });
    })();
    return () => { cancelled = true; };
  }, [clinicId, allowed]);

  const health = useMemo(
    () => computeSeoHealth({ profile: (profile as SeoHealthInput["profile"]) ?? null, settings, doctors: active as any[], counts }),
    [profile, settings, active, counts],
  );

  if (!clinicId || !allowed) return null;

  const toggleNudge = (dismissed: boolean) => { setSeoNudgeDismissed(clinicId, dismissed); setNudgeDismissed(dismissed); };

  return (
    <Card role="region" aria-label="Search visibility">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-heading">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Search visibility
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={health.score} level={health.level} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{LEVEL_TEXT[health.level]}: {health.score} out of 100</p>
            <p className="text-xs text-muted-foreground">
              Google decides rankings. These are the things you control to help patients find your clinic.
            </p>
          </div>
        </div>

        {health.nextActions.length > 0 && (nudgeDismissed ? (
          <button type="button" className="text-sm font-medium text-royal hover:underline" onClick={() => toggleNudge(false)}>
            Show next steps
          </button>
        ) : (
          <div className="relative rounded-lg border border-border bg-secondary/40 p-3 pr-11">
            <p className="text-sm font-semibold text-foreground">Do these next</p>
            <ol className="mt-1.5 space-y-1.5">
              {health.nextActions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="min-w-0 break-words text-foreground">{a.label}</span>
                  <Link to={a.route} className="font-medium text-royal hover:underline" aria-label={`Fix: ${a.label}`}>Fix</Link>
                </li>
              ))}
            </ol>
            <button
              type="button" aria-label="Hide next steps"
              className="absolute right-1.5 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60"
              onClick={() => toggleNudge(true)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        {health.nextActions.length === 0 && health.score >= 100 && (
          <p className="text-sm text-foreground">Everything on the list is done. Keep adding reviews and articles over time.</p>
        )}

        <div>
          <button
            type="button" aria-expanded={open} aria-controls="seo-checklist"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-royal hover:underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide full checklist" : "See full checklist"}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {open && (
            <div id="seo-checklist" className="space-y-3">
              {health.groups.map((g) => (
                <section key={g.group} aria-label={g.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h3>
                  <ul className="divide-y divide-border">
                    {g.items.map((i) => <Row key={i.id} item={i} />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SeoHealthCard;
