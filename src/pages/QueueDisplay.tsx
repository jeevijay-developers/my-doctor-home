import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Loader2, MapPin, UserCheck, Users, WifiOff } from "lucide-react";
import { estimateWaitMinutes, formatWait } from "@/lib/queue";
import { doctorDisplayName } from "@/lib/seo/doctorSeo";

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

// Waiting-room screen: open /dr/<slug>/queue on a TV or tablet. It shows queue NUMBERS
// only (no names, phones or complaints), so it is safe for anyone in the room to see.
// Visitors have no read access to appointments, so it polls one narrow function.
const QueueDisplay = () => {
  const { slug } = useParams<{ slug: string }>();
  const [doctor, setDoctor] = useState<QueueDoctor | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [queue, setQueue] = useState<PublicQueue | null>(null);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);

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
      if (!data) setNotFound(true); else setDoctor(data as any);
    };
    find();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug]);

  const refresh = useCallback(async (doctorId: string) => {
    const seq = ++requestSeq.current;
    const { data, error } = await (supabase as any).rpc("get_public_queue", { _doctor_id: doctorId });
    if (seq !== requestSeq.current) return;       // a newer request already answered
    if (error || !data) return;                    // keep the last numbers; staleness is shown below
    setQueue(data as PublicQueue);
    setLastOkAt(Date.now());
  }, []);

  useEffect(() => {
    if (!doctor) return;
    refresh(doctor.id);
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(doctor.id); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(doctor.id); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [doctor, refresh]);

  // Re-evaluate staleness between polls.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Clinic not found.</div>;
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
  const doctorName = doctorDisplayName(doctor);
  const subtitle = [doctor.specialization, doctor.qualifications].map((v) => v?.trim()).filter(Boolean).join(" · ");
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
          {doctor.profile_photo_url ? (
            <img src={doctor.profile_photo_url} alt="" className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-cover ring-2 ring-white/20 shrink-0" />
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

export default QueueDisplay;
