import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import type { ClinicDoctorAccess, Practitioner } from "@/lib/practitioners/types";

// The clinic's doctors, shared by every admin page from ONE fetch (mounted once in
// AdminDashboard, inside ProfileProvider). `isMulti` is the single switch every
// multi-doctor UI path checks: a clinic that is not multi-doctor must render and
// request exactly what it did before practitioners existed.
export interface PractitionersState {
  practitioners: Practitioner[]; // all, primary first then sort_order
  active: Practitioner[]; // is_active
  bookable: Practitioner[]; // is_active && is_bookable
  primary: Practitioner | null;
  byId: (id: string | null | undefined) => Practitioner | undefined;
  access: ClinicDoctorAccess | null; // from get_clinic_doctor_access
  // A clinic with 2+ ACTIVE doctors is multi-doctor whatever its plan: after a downgrade its
  // doctors, bookings and logins remain. The plan only decides who may ADD / re-enable doctors.
  isMulti: boolean; // active.length >= 2 (independent of access)
  canAddDoctors: boolean; // !!access?.enabled
  overSeats: boolean; // access known and more bookable doctors than seats
  loading: boolean;
  refetch: () => Promise<void>;
}

const EMPTY: Practitioner[] = [];

// Outside the provider (e.g. a component rendered before /admin/* mounts) everything
// behaves as a single-doctor clinic.
const INERT: PractitionersState = {
  practitioners: EMPTY,
  active: EMPTY,
  bookable: EMPTY,
  primary: null,
  byId: () => undefined,
  access: null,
  isMulti: false,
  canAddDoctors: false,
  overSeats: false,
  loading: false,
  refetch: async () => {},
};

const REFETCH_DEBOUNCE_MS = 250;

const PractitionersContext = createContext<PractitionersState | null>(null);

// The RPC answers { error: 'FORBIDDEN' } (or fails outright) for a caller it refuses;
// both mean "no multi-doctor access", never a guess.
function toAccess(data: unknown, error: unknown): ClinicDoctorAccess | null {
  if (error || !data || typeof data !== "object" || "error" in (data as object)) return null;
  const a = data as Record<string, unknown>;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  // A malformed answer is "unknown", never a guess. seat_limit may be null (no limit known).
  if (typeof a.enabled !== "boolean" || !(a.seat_limit === null || num(a.seat_limit)) || !num(a.seats_used)) return null;
  return data as ClinicDoctorAccess;
}

export const PractitionersProvider = ({ children }: { children: ReactNode }) => {
  const { profile, loading: profileLoading } = useProfile();
  const clinicId = profile?.id ?? null;

  const [practitioners, setPractitioners] = useState<Practitioner[]>(EMPTY);
  const [access, setAccess] = useState<ClinicDoctorAccess | null>(null);
  const [loading, setLoading] = useState(true);

  // Drops answers that arrive after the clinic changed or a newer fetch started.
  const requestSeq = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!clinicId) {
      setPractitioners(EMPTY);
      setAccess(null);
      setLoading(profileLoading);
      return;
    }
    const [list, acc] = await Promise.all([
      supabase
        .from("practitioners")
        .select("*")
        .eq("doctor_id", clinicId)
        .order("is_primary", { ascending: false })
        .order("sort_order"),
      Promise.resolve(supabase.rpc("get_clinic_doctor_access", { _doctor_id: clinicId })).catch((e: unknown) => ({
        data: null,
        error: e,
      })),
    ]).catch(() => [null, null] as const);
    if (seq !== requestSeq.current) return;
    if (list && !list.error && Array.isArray(list.data)) {
      setPractitioners(list.data);
    } else {
      // A transient failure keeps the last good list rather than turning a multi-doctor clinic
      // into an empty (single-doctor) one.
      console.error("Could not load the clinic's doctors:", list?.error ?? "no response");
    }
    setAccess(acc ? toAccess(acc.data, acc.error) : null);
    setLoading(false);
  }, [clinicId, profileLoading]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Live: a doctor added, edited or deactivated on another device shows up here.
  // One save can fire several row events, so they are coalesced into one refetch.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (!clinicId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`practitioners-${clinicId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "practitioners", filter: `doctor_id=eq.${clinicId}` }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => refetchRef.current(), REFETCH_DEBOUNCE_MS);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [clinicId]);

  const value = useMemo<PractitionersState>(() => {
    const active = practitioners.filter((p) => p.is_active);
    const bookable = active.filter((p) => p.is_bookable);
    const primary = practitioners.find((p) => p.is_primary) ?? null;
    const map = new Map(practitioners.map((p) => [p.id, p]));
    return {
      practitioners,
      active,
      bookable,
      primary,
      byId: (id) => (id ? map.get(id) : undefined),
      access,
      isMulti: active.length >= 2,
      canAddDoctors: !!access?.enabled,
      overSeats: !!access && access.seat_limit != null && bookable.length > access.seat_limit,
      loading,
      refetch,
    };
  }, [practitioners, access, loading, refetch]);

  return <PractitionersContext.Provider value={value}>{children}</PractitionersContext.Provider>;
};

export const usePractitioners = (): PractitionersState => useContext(PractitionersContext) ?? INERT;
