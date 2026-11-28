import { useEffect, useState } from "react";
import { useNextAvailableByDoctor } from "@/hooks/useNextAvailableByDoctor";
import { isSlotPast } from "@/lib/doctorSite/nextAvailableLabel";
import type { NextAvailable } from "@/lib/doctorSite/nextAvailable";

type State = { status: "loading" } | { status: "found"; slot: NextAvailable } | { status: "none" };

/** How long the hero card shows its skeleton before settling for "Pick a time" (lookup failed or slow). */
const GIVE_UP_MS = 4000;

/**
 * Earliest free clinic slot of ONE doctor, for the hero's quick-book card on that doctor's page.
 * Same shape as useNextAvailable; does nothing until both ids are known.
 */
export function useDoctorNextSlot(clinicId: string | undefined, doctorId: string | undefined): State {
  const enabled = Boolean(clinicId && doctorId);
  const { next, now } = useNextAvailableByDoctor(clinicId, enabled);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!enabled || !doctorId) return { status: "loading" };
  if (doctorId in next) {
    const slot = next[doctorId];
    if (!slot || isSlotPast(slot, now)) return { status: "none" };
    const [y, m, d] = slot.date.split("-").map(Number);
    return { status: "found", slot: { date: new Date(y, m - 1, d), dateKey: slot.date, time: slot.time.slice(0, 5) } };
  }
  return gaveUp ? { status: "none" } : { status: "loading" };
}
