import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, WifiOff } from "lucide-react";
import { estimateWaitMinutes, formatWait } from "@/lib/queue";

type PublicQueue = {
  now_serving: number | null;
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
  const [doctor, setDoctor] = useState<{ id: string; full_name: string | null; clinic_name: string | null } | null>(null);
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
        .from("profiles").select("id, full_name, clinic_name").eq("slug", slug).eq("onboarding_completed", true).maybeSingle();
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

  return (
    <main className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-6 text-center gap-8">
      {stale && (
        <div role="alert" className="fixed top-0 inset-x-0 bg-warning text-black py-3 px-4 flex items-center justify-center gap-2 font-semibold">
          <WifiOff className="h-5 w-5" /> Live updates paused. Numbers below may be out of date. Please ask at the reception.
        </div>
      )}
      <header>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl">{doctor.clinic_name || (doctor.full_name ? `Dr. ${doctor.full_name}` : "Clinic")}</h1>
        <p className="text-white/60 text-sm mt-1">Live queue</p>
      </header>

      <div className={stale ? "opacity-40 transition-opacity space-y-8" : "space-y-8 transition-opacity"}>
        <section aria-live="polite" className="space-y-2">
          <div className="text-white/70 uppercase tracking-widest text-sm">Now serving</div>
          <div className="font-heading font-bold text-[7rem] sm:text-[10rem] leading-none text-spark-bright">
            {queue.now_serving != null ? `#${queue.now_serving}` : "—"}
          </div>
        </section>

        <section aria-live="polite" className="space-y-2">
          <div className="text-white/70 uppercase tracking-widest text-sm">Next</div>
          <div className="flex gap-3 justify-center flex-wrap">
            {queue.next_up.length === 0 ? (
              <span className="text-white/50">No one is waiting</span>
            ) : (
              queue.next_up.map((n) => (
                <span key={n} className="font-heading font-bold text-3xl sm:text-5xl bg-white/10 rounded-2xl px-5 py-3">#{n}</span>
              ))
            )}
          </div>
        </section>

        <footer className="flex items-center gap-6 text-white/80 text-sm sm:text-base flex-wrap justify-center">
          <span className="flex items-center gap-2"><Users className="h-4 w-4" /> {queue.waiting} waiting</span>
          <span>{queue.done} seen today</span>
          {est != null && queue.waiting > 0 && <span>About {formatWait(est)} for the last in line</span>}
        </footer>
      </div>
    </main>
  );
};

export default QueueDisplay;
