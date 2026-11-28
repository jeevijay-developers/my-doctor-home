import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Loader2, MapPin, UserCheck, Users, WifiOff } from "lucide-react";
import { estimateWaitMinutes, formatWait } from "@/lib/queue";
import { doctorDisplayName, formatDoctorName } from "@/lib/seo/doctorSeo";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { useOldSlugRedirect } from "@/hooks/useOldSlugRedirect";

type QueueDoctor = {
  id: string;
  full_name: string | null;
  clinic_name: string | null;
  specialization?: string | null;
  qualifications?: string | null;
  profile_photo_url?: string | null;
  city?: string | null;
};

type PublicQueue = {
  now_serving: number | null;
  /** Masked, e.g. "Aaryan K." — the server never sends the full name. */
  now_serving_name?: string | null;
  next_up: number[];
  waiting: number;
  done: number;
  avg_minutes: number | null;
  updated_at: string;
};

const POLL_MS = 5000;
// Without a successful refresh for this long the numbers are no longer trustworthy.
const STALE_AFTER_MS = 20000;

/**
 * Polls one queue every POLL_MS while the tab is visible. Without a practitioner the request
 * is exactly the single-doctor one ({ _doctor_id }); with one it adds _practitioner_id.
 */
const useQueuePoll = (doctorId: string | null, practitionerId?: string) => {
  const [queue, setQueue] = useState<PublicQueue | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const requestSeq = useRef(0);

  // A different doctor is a different queue: never show the previous one's numbers.
  useEffect(() => {
    setQueue(null);
    setLastOkAt(null);
  }, [doctorId, practitionerId]);

  const refresh = useCallback(async () => {
    if (!doctorId) return;
    const seq = ++requestSeq.current;
    const args: Record<string, string> = { _doctor_id: doctorId };
    if (practitionerId) args._practitioner_id = practitionerId;
    const { data, error } = await (supabase as any).rpc("get_public_queue", args);
    if (seq !== requestSeq.current) return;       // a newer request already answered
    if (error || !data) return;                    // keep the last numbers; staleness is shown below
    setQueue(data as PublicQueue);
    setLastOkAt(Date.now());
  }, [doctorId, practitionerId]);

  useEffect(() => {
    if (!doctorId) return;
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [doctorId, refresh]);

  return { queue, lastOkAt };
};

// Waiting-room screen: open /dr/<slug>/queue on a TV or tablet. It shows queue NUMBERS
// only (no names, phones or complaints), so it is safe for anyone in the room to see.
// Visitors have no read access to appointments, so it polls one narrow function.
const QueueDisplay = () => {
  const { slug } = useParams<{ slug: string }>();
  const redirectOldSlug = useOldSlugRedirect();
  const [params] = useSearchParams();
  const doctorSlug = params.get("doctor");
  const [doctor, setDoctor] = useState<QueueDoctor | null>(null);
  // The doctor list arrives after the clinic; polling does not wait for it (see below).
  const [practitioners, setPractitioners] = useState<PublicPractitioner[]>([]);
  const [listDone, setListDone] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const prev = document.title;
    document.title = "Live Queue | Doctylia";
    return () => { document.title = prev; };
  }, []);

  // A TV is left on all day: keep the screen awake where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (wl && document.visibilityState === "visible") {
          const l = await wl.request("screen");
          if (cancelled) { l.release?.(); return; }
          lock = l;
        }
      } catch { /* unsupported or denied: the screen may dim, nothing breaks */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // Find the clinic. A network error is NOT "not found": keep retrying until it answers.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const find = async () => {
      const { data, error } = await supabase
        .from("profiles").select("id, full_name, clinic_name, specialization, qualifications, profile_photo_url, city").eq("slug", slug).eq("onboarding_completed", true).maybeSingle();
      if (cancelled) return;
      if (error) { timer = setTimeout(find, POLL_MS); return; }
      if (!data) { if (await redirectOldSlug(slug)) return; if (!cancelled) setNotFound(true); return; }
      // Show the clinic (and start its queue) at once; the doctor list follows. A failed lookup
      // (retried once) never breaks the screen: it then shows the clinic's single queue.
      setDoctor(data as any);
      const clinicId = (data as any).id as string;
      for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
        try {
          const res = await supabase.rpc("get_public_practitioners", { _doctor_id: clinicId });
          if (cancelled) return;
          if (!res.error) {
            setPractitioners(Array.isArray(res.data) ? (res.data as unknown as PublicPractitioner[]) : []);
            setListDone(true);
            return;
          }
          if (attempt === 1) console.error("get_public_practitioners failed", res.error);
        } catch (e) {
          if (attempt === 1) console.error("get_public_practitioners failed", e);
        }
        if (attempt === 0) await new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000); });
      }
      if (!cancelled) setListDone(true);
    };
    find();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug, redirectOldSlug]);

  // ?doctor=<slug> picks one doctor; otherwise a clinic with 2+ doctors gets a panel each;
  // otherwise exactly the single-doctor screen and request.
  const chosen = doctorSlug ? practitioners.find((p) => p.slug === doctorSlug) ?? null : null;
  const showPanels = !chosen && practitioners.length >= 2;
  // A ?doctor= link must know the doctor's id first; otherwise the clinic's queue is polled straight away.
  const waitingForList = !!doctorSlug && !listDone;
  const { queue, lastOkAt } = useQueuePoll(doctor && !showPanels && !waitingForList ? doctor.id : null, chosen?.id);

  // Re-evaluate staleness between polls.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Clinic not found.</div>;
  }
  if (doctor && showPanels) {
    return <ClinicQueuePanels doctor={doctor} practitioners={practitioners} now={now} />;
  }
  if (!doctor || !queue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-royal" />
        <span className="text-sm text-muted-foreground">Connecting to the clinic…</span>
      </div>
    );
  }

  const stale = lastOkAt == null || now - lastOkAt > STALE_AFTER_MS;
  const est = estimateWaitMinutes(queue.waiting, queue.avg_minutes, queue.now_serving != null);
  const doctorName = chosen ? formatDoctorName(chosen.display_name) : doctorDisplayName(doctor);
  const photo = chosen ? chosen.photo_url : doctor.profile_photo_url;
  const subtitle = [chosen ? chosen.specialization : doctor.specialization, chosen ? chosen.qualifications : doctor.qualifications].map((v) => v?.trim()).filter(Boolean).join(" · ");
  const place = [doctor.clinic_name?.trim(), doctor.city?.trim()].filter(Boolean).join(", ");
  const clock = new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const [firstNext, ...laterNext] = queue.next_up;
  const hasWait = est != null && queue.waiting > 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-navy to-[#06124a] text-white flex flex-col p-5 sm:p-8 lg:p-12 gap-8">
      {stale && (
        <div role="alert" className="fixed top-0 inset-x-0 z-10 bg-warning text-black py-3 px-4 flex items-center justify-center gap-2 font-semibold">
          <WifiOff className="h-5 w-5" /> Live updates paused. Numbers below may be out of date. Please ask at the reception.
        </div>
      )}

      {/* Who you are waiting for */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          {photo ? (
            <img src={photo} alt="" className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover ring-2 ring-white/20 shrink-0" />
          ) : (
            <span className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white/10 ring-2 ring-white/20 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0 text-left">
            {doctorName && <h1 className="font-heading font-bold text-2xl sm:text-4xl leading-tight truncate">{doctorName}</h1>}
            {subtitle && <p className="text-white/70 text-sm sm:text-lg truncate">{subtitle}</p>}
            {place && (
              <p className="text-white/60 text-xs sm:text-base mt-0.5 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{place}</span>
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading font-bold text-2xl sm:text-4xl tabular-nums">{clock}</div>
          <div className="mt-1 inline-flex items-center gap-2 text-xs sm:text-sm text-white/70">
            <span className={`h-2 w-2 rounded-full ${stale ? "bg-warning" : "bg-success animate-pulse"}`} /> Live queue
          </div>
        </div>
      </header>

      <div className={`flex-1 flex flex-col items-center justify-center gap-8 text-center transition-opacity ${stale ? "opacity-40" : ""}`}>
        <section aria-live="polite" className="w-full max-w-3xl rounded-3xl bg-white/5 ring-1 ring-white/10 px-6 py-8 sm:py-12">
          <div className="text-white/70 uppercase tracking-[0.25em] text-sm sm:text-base">Now serving</div>
          <div className="font-heading font-extrabold text-[7rem] sm:text-[11rem] leading-none text-spark-bright mt-2">
            {queue.now_serving != null ? `#${queue.now_serving}` : "—"}
          </div>
          {queue.now_serving != null && queue.now_serving_name && (
            <p className="mt-3 font-heading font-bold text-3xl sm:text-5xl text-white break-words">{queue.now_serving_name}</p>
          )}
          {queue.now_serving == null && <p className="text-white/60 mt-3">Waiting for the next patient</p>}
        </section>

        <section aria-live="polite" className="space-y-3">
          <div className="text-white/70 uppercase tracking-[0.25em] text-sm">Next</div>
          <div className="flex gap-3 justify-center flex-wrap items-center">
            {firstNext == null ? (
              <span className="text-white/50">No one is waiting</span>
            ) : (
              <>
                <span className="font-heading font-bold text-4xl sm:text-6xl bg-white/15 ring-2 ring-spark-bright/60 rounded-2xl px-6 py-3">#{firstNext}</span>
                {laterNext.map((n) => (
                  <span key={n} className="font-heading font-bold text-2xl sm:text-4xl bg-white/10 rounded-2xl px-5 py-3 text-white/90">#{n}</span>
                ))}
              </>
            )}
          </div>
        </section>
      </div>

      <footer className={`grid grid-cols-3 gap-3 sm:gap-6 max-w-3xl w-full mx-auto transition-opacity ${stale ? "opacity-40" : ""}`}>
        <div aria-label={`${queue.waiting} waiting`} className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3 sm:p-5 text-center">
          <Users className="h-5 w-5 mx-auto text-white/60" aria-hidden="true" />
          <div className="font-heading font-bold text-3xl sm:text-5xl mt-1">{queue.waiting}</div>
          <div className="text-white/70 text-xs sm:text-base">waiting</div>
        </div>
        <div aria-label={`${queue.done} seen today`} className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3 sm:p-5 text-center">
          <UserCheck className="h-5 w-5 mx-auto text-white/60" aria-hidden="true" />
          <div className="font-heading font-bold text-3xl sm:text-5xl mt-1">{queue.done}</div>
          <div className="text-white/70 text-xs sm:text-base">seen today</div>
        </div>
        <div
          aria-label={hasWait ? `About ${formatWait(est)} for the last in line` : "No wait"}
          className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-3 sm:p-5 text-center"
        >
          <Clock className="h-5 w-5 mx-auto text-white/60" aria-hidden="true" />
          <div className="font-heading font-bold text-2xl sm:text-4xl mt-2 sm:mt-3">{hasWait ? formatWait(est) : "No wait"}</div>
          <div className="text-white/70 text-xs sm:text-base">{hasWait ? "for the last in line" : "right now"}</div>
        </div>
      </footer>
    </main>
  );
};

// Layout tiers for a clinic with 2+ doctors: the grid and type scale with the doctor count so the
// screen is always filled and still readable from across a waiting room.
//   2-3 doctors: one column each, huge numbers     4: 2x2     5-6: 3 columns     7+: 4 columns, compact
const panelLayout = (n: number) => {
  const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
  const tier = n <= 3 ? "large" : n <= 6 ? "medium" : "compact";
  return { cols, tier } as const;
};

const TIER = {
  large:   { number: "text-[8rem] sm:text-[10rem] xl:text-[14rem]", name: "text-3xl xl:text-5xl", sub: "text-lg xl:text-2xl", label: "text-sm xl:text-lg", next: "text-4xl xl:text-6xl", nextMore: "text-2xl xl:text-4xl", servedName: "text-3xl xl:text-5xl", stat: "text-lg xl:text-2xl", avatar: "h-20 w-20 xl:h-28 xl:w-28", pad: "p-6 xl:p-10", moreNext: 4 },
  medium:  { number: "text-[6rem] sm:text-[7rem] xl:text-[9rem]",   name: "text-2xl xl:text-3xl", sub: "text-base xl:text-lg", label: "text-xs xl:text-base", next: "text-3xl xl:text-5xl", nextMore: "text-xl xl:text-3xl", servedName: "text-2xl xl:text-4xl", stat: "text-base xl:text-xl", avatar: "h-14 w-14 xl:h-20 xl:w-20", pad: "p-5 xl:p-7", moreNext: 3 },
  compact: { number: "text-[4.5rem] sm:text-[5rem] xl:text-[6.5rem]", name: "text-xl xl:text-2xl", sub: "text-sm xl:text-base", label: "text-xs xl:text-sm", next: "text-2xl xl:text-4xl", nextMore: "text-lg xl:text-2xl", servedName: "text-lg xl:text-2xl", stat: "text-sm xl:text-lg", avatar: "h-12 w-12 xl:h-14 xl:w-14", pad: "p-4 xl:p-5", moreNext: 2 },
} as const;

const initials = (name: string) =>
  name.replace(/^dr\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

// One panel per doctor for a clinic with 2+ doctors. Same privacy rule: queue numbers plus the
// masked name of the patient in the room, nothing else.
const ClinicQueuePanels = ({ doctor, practitioners, now }: { doctor: QueueDoctor; practitioners: PublicPractitioner[]; now: number }) => {
  const clinicName = doctor.clinic_name?.trim();
  const city = doctor.city?.trim();
  const clock = new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const { cols, tier } = panelLayout(practitioners.length);
  return (
    <main className="min-h-screen bg-gradient-to-b from-navy to-[#06124a] text-white flex flex-col p-4 sm:p-6 lg:p-8 gap-4 sm:gap-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 text-left">
          {clinicName && <h1 className="font-heading font-bold text-2xl sm:text-4xl leading-tight truncate">{clinicName}</h1>}
          {city && (
            <p className="text-white/60 text-sm sm:text-base mt-0.5 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{city}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="font-heading font-bold text-2xl sm:text-4xl tabular-nums">{clock}</div>
          <div className="mt-1 inline-flex items-center gap-2 text-xs sm:text-sm text-white/70">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live queue
          </div>
        </div>
      </header>
      <div
        data-testid="queue-grid"
        data-tier={tier}
        style={{ ["--cols" as string]: cols }}
        className="flex-1 grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] auto-rows-fr"
      >
        {practitioners.map((p) => (
          <DoctorQueuePanel key={p.id} clinicId={doctor.id} practitioner={p} now={now} tier={tier} />
        ))}
      </div>
    </main>
  );
};

const DoctorQueuePanel = ({ clinicId, practitioner, now, tier }: { clinicId: string; practitioner: PublicPractitioner; now: number; tier: keyof typeof TIER }) => {
  const { queue, lastOkAt } = useQueuePoll(clinicId, practitioner.id);
  const t = TIER[tier];
  const name = formatDoctorName(practitioner.display_name);
  const headingId = `queue-panel-${practitioner.id}`;
  const stale = queue != null && (lastOkAt == null || now - lastOkAt > STALE_AFTER_MS);
  const [firstNext, ...laterNext] = queue?.next_up ?? [];
  const serving = queue?.now_serving != null;
  const est = queue ? estimateWaitMinutes(queue.waiting, queue.avg_minutes, serving) : null;
  const hasWait = est != null && !!queue && queue.waiting > 0;
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-3xl ring-1 flex flex-col gap-4 text-center min-w-0 transition-colors ${t.pad} ${serving ? "bg-white/10 ring-spark-bright/40" : "bg-white/5 ring-white/10"}`}
    >
      <div className="flex items-center justify-center gap-3 min-w-0">
        {practitioner.photo_url ? (
          <img src={practitioner.photo_url} alt="" className={`${t.avatar} rounded-full object-cover ring-2 ring-white/20 shrink-0`} />
        ) : (
          <span className={`${t.avatar} rounded-full bg-white/10 ring-2 ring-white/20 shrink-0 flex items-center justify-center font-heading font-bold text-white/80`} aria-hidden="true">
            {initials(name)}
          </span>
        )}
        <div className="min-w-0 text-left">
          <h2 id={headingId} className={`font-heading font-bold leading-tight break-words ${t.name}`}>{name}</h2>
          {practitioner.specialization?.trim() && <p className={`text-white/70 truncate ${t.sub}`}>{practitioner.specialization.trim()}</p>}
        </div>
      </div>
      {queue == null ? (
        <p className="flex-1 text-white/60 flex items-center justify-center gap-2" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Connecting…
        </p>
      ) : (
        <div className={`flex-1 flex flex-col justify-between gap-4 transition-opacity ${stale ? "opacity-60" : ""}`}>
          {stale && (
            <p role="alert" className="bg-warning text-black rounded-xl py-2 px-3 font-semibold flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4" aria-hidden="true" /> Updates paused. Please ask at the reception.
            </p>
          )}
          <div aria-live="polite" className="flex-1 flex flex-col items-center justify-center">
            <div className={`text-white/70 uppercase tracking-[0.2em] ${t.label}`}>Now serving</div>
            <div className={`font-heading font-extrabold leading-none mt-1 ${t.number} ${serving ? "text-spark-bright" : "text-white/25"}`}>
              {serving ? `#${queue.now_serving}` : "—"}
            </div>
            {serving && queue.now_serving_name ? (
              <p className={`mt-2 font-heading font-bold break-words ${t.servedName}`}>{queue.now_serving_name}</p>
            ) : !serving ? (
              <p className={`mt-1 text-white/50 ${t.sub}`}>Waiting for the next patient</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className={`text-white/70 uppercase tracking-[0.2em] ${t.label}`}>Next</div>
            <div className="flex gap-2 justify-center flex-wrap items-center">
              {firstNext == null ? (
                <span className={`text-white/50 ${t.sub}`}>No one is waiting</span>
              ) : (
                <>
                  <span className={`font-heading font-bold bg-white/15 ring-2 ring-spark-bright/60 rounded-2xl px-4 py-1.5 ${t.next}`}>#{firstNext}</span>
                  {laterNext.slice(0, t.moreNext).map((n) => (
                    <span key={n} className={`font-heading font-bold bg-white/10 rounded-2xl px-3 py-1.5 text-white/90 ${t.nextMore}`}>#{n}</span>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className={`flex items-center justify-center gap-x-5 gap-y-1 flex-wrap text-white/75 border-t border-white/10 pt-3 ${t.stat}`}>
            <span aria-label={`${queue.waiting} waiting`} className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden="true" /> {queue.waiting} waiting
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" /> {hasWait ? `~${formatWait(est)}` : "No wait"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};

export default QueueDisplay;

