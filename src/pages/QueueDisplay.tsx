import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users } from "lucide-react";
import { estimateWaitMinutes, formatWait } from "@/lib/queue";

type PublicQueue = {
  now_serving: number | null;
  next_up: number[];
  waiting: number;
  done: number;
  avg_minutes: number | null;
  updated_at: string;
};

// Waiting-room screen: open /dr/<slug>/queue on a TV or tablet. It shows queue NUMBERS
// only (no names, phones or complaints), so it is safe for anyone in the room to see.
// Visitors have no read access to appointments, so it polls one narrow function.
const QueueDisplay = () => {
  const { slug } = useParams<{ slug: string }>();
  const [doctor, setDoctor] = useState<{ id: string; full_name: string | null; clinic_name: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [queue, setQueue] = useState<PublicQueue | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = "Live Queue | Doctylia";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles").select("id, full_name, clinic_name").eq("slug", slug).eq("onboarding_completed", true).maybeSingle();
      if (cancelled) return;
      if (!data) setNotFound(true); else setDoctor(data as any);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!doctor) return;
    let cancelled = false;
    const refresh = async () => {
      const { data, error } = await (supabase as any).rpc("get_public_queue", { _doctor_id: doctor.id });
      if (cancelled) return;
      if (error || !data) { setOffline(true); return; }
      setOffline(false);
      setQueue(data as PublicQueue);
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [doctor]);

  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Clinic not found.</div>;
  }
  if (!doctor || !queue) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-royal" /></div>;
  }

  const est = estimateWaitMinutes(queue.waiting, queue.avg_minutes, queue.now_serving != null);

  return (
    <main className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-6 text-center gap-8">
      <header>
        <h1 className="font-heading font-bold text-2xl sm:text-3xl">{doctor.clinic_name || (doctor.full_name ? `Dr. ${doctor.full_name}` : "Clinic")}</h1>
        <p className="text-white/60 text-sm mt-1">Live queue</p>
      </header>

      <section aria-live="polite" className="space-y-2">
        <div className="text-white/70 uppercase tracking-widest text-sm">Now serving</div>
        <div className="font-heading font-bold text-[7rem] sm:text-[10rem] leading-none text-spark">
          {queue.now_serving != null ? `#${queue.now_serving}` : "—"}
        </div>
      </section>

      <section className="space-y-2">
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
      {offline && <p className="text-warning text-xs">Reconnecting…</p>}
    </main>
  );
};

export default QueueDisplay;
