import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NextSlot } from "@/lib/doctorSite/nextAvailableLabel";

/** doctor (practitioner) id -> next free clinic slot, or null when that doctor has none in the window. */
export type NextByDoctor = Record<string, NextSlot | null>;

export const NEXT_AVAILABLE_POLL_MS = 60_000;
/** Cards and the booking picker both ask on the same page: calls inside this window share one answer. */
const SHARE_MS = 10_000;

type Row = { practitioner_id: string; next_date: string | null; next_time: string | null };
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Row[] | null; error: unknown }> };

const inflight = new Map<string, Promise<NextByDoctor>>();
const recent = new Map<string, { at: number; value: NextByDoctor }>();

/** Test helper: forget shared answers between tests. */
export const resetNextAvailableCache = () => {
  inflight.clear();
  recent.clear();
};

// get_public_next_available is a new RPC and not in the generated types yet (regenerate after the
// migration is applied), hence the cast. Throws on any failure so callers keep their last value.
const load = (clinicId: string): Promise<NextByDoctor> => {
  const fresh = recent.get(clinicId);
  if (fresh && Date.now() - fresh.at < SHARE_MS) return Promise.resolve(fresh.value);
  const pending = inflight.get(clinicId);
  if (pending) return pending;
  const p = (async () => {
    const res = await (supabase as unknown as RpcClient).rpc("get_public_next_available", { _doctor_id: clinicId, _days: 14 });
    if (!res || res.error || !Array.isArray(res.data)) throw new Error("next available unavailable");
    const out: NextByDoctor = {};
    for (const r of res.data) {
      if (!r?.practitioner_id) continue;
      out[r.practitioner_id] = r.next_date && r.next_time ? { date: r.next_date, time: r.next_time } : null;
    }
    recent.set(clinicId, { at: Date.now(), value: out });
    return out;
  })().finally(() => inflight.delete(clinicId));
  inflight.set(clinicId, p);
  return p;
};

/**
 * The next free slot of every bookable doctor, from ONE call. Polls every 60 s while the tab is
 * visible and refreshes when it becomes visible again. A failed call keeps the last value (or
 * nothing at all): the chips simply do not show. `now` ticks with each poll so "Tomorrow" turns
 * into "Today" after midnight IST without a reload.
 */
export function useNextAvailableByDoctor(clinicId: string | null | undefined, enabled: boolean) {
  const [next, setNext] = useState<NextByDoctor>({});
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!clinicId || !enabled) return;
    let cancelled = false;
    const run = () => {
      setNow(new Date());
      load(clinicId).then(
        (v) => { if (!cancelled) setNext(v); },
        () => { /* keep the last value */ },
      );
    };
    run();
    const timer = window.setInterval(() => { if (!document.hidden) run(); }, NEXT_AVAILABLE_POLL_MS);
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clinicId, enabled]);

  return { next, now };
}
