import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { createTableMock } from "@/test/tableMock";
import { PractitionersProvider, usePractitioners } from "./usePractitioners";

const mock = vi.hoisted(() => ({ current: null as any, clinicId: "clinic-1" as string | null }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: mock.clinicId ? { id: mock.clinicId } : null, loading: false }),
}));

const prac = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  doctor_id: "clinic-1",
  display_name: `Dr ${id}`,
  is_primary: false,
  is_active: true,
  is_bookable: true,
  sort_order: 0,
  ...over,
});

const ACCESS = { enabled: true, has_feature: true, seat_limit: 3, seats_used: 2, extra_seats: 1, seat_max: 10, seat_price: null };

const wrapper = ({ children }: { children: ReactNode }) => <PractitionersProvider>{children}</PractitionersProvider>;

describe("usePractitioners", () => {
  beforeEach(() => {
    mock.current = createTableMock();
    mock.clinicId = "clinic-1";
    mock.current.tables.practitioners = { data: [prac("a", { is_primary: true }), prac("b", { sort_order: 1 })], error: null };
    mock.current.rpcs.get_clinic_doctor_access = () => ACCESS;
  });
  afterEach(() => vi.useRealTimers());

  it("isMulti stays true when access.enabled is false (lapsed plan) with 2 active doctors", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ ...ACCESS, enabled: false, seat_limit: 1 });
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toHaveLength(2);
    expect(result.current.access?.enabled).toBe(false);
    expect(result.current.isMulti).toBe(true);
    expect(result.current.canAddDoctors).toBe(false);
    expect(result.current.overSeats).toBe(true);
  });

  it("canAddDoctors follows access.enabled and overSeats is false within the limit", async () => {
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canAddDoctors).toBe(true);
    expect(result.current.overSeats).toBe(false);
  });

  it("isMulti is true when enabled with 2 active doctors", async () => {
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMulti).toBe(true);
    expect(mock.current.rpc).toHaveBeenCalledWith("get_clinic_doctor_access", { _doctor_id: "clinic-1" });
    const q = mock.current.opsOf("practitioners")[0];
    expect(mock.current.hasOp(q, "eq", "doctor_id", "clinic-1")).toBe(true);
  });

  it("isMulti is false with only one active doctor", async () => {
    mock.current.tables.practitioners = { data: [prac("a", { is_primary: true }), prac("b", { is_active: false })], error: null };
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.practitioners).toHaveLength(2);
    expect(result.current.active.map((p) => p.id)).toEqual(["a"]);
    expect(result.current.isMulti).toBe(false);
  });

  it("primary is the is_primary row and byId finds a doctor", async () => {
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.primary?.id).toBe("a");
    expect(result.current.byId("b")?.id).toBe("b");
    expect(result.current.byId(null)).toBeUndefined();
  });

  it("bookable excludes doctors that are not bookable", async () => {
    mock.current.tables.practitioners = {
      data: [prac("a", { is_primary: true }), prac("b", { is_bookable: false }), prac("c", { is_active: false })],
      error: null,
    };
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookable.map((p) => p.id)).toEqual(["a"]);
  });

  it("access null with a single active doctor is not multi", async () => {
    mock.current.tables.practitioners = { data: [prac("a", { is_primary: true })], error: null };
    mock.current.rpcs.get_clinic_doctor_access = () => ({ error: "FORBIDDEN" });
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMulti).toBe(false);
  });

  it("treats an access error or a failed RPC as no access", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ error: "FORBIDDEN" });
    const a = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.access).toBeNull();
    // access unknown, but two active doctors in the list still make it a multi-doctor clinic
    expect(a.result.current.isMulti).toBe(true);
    expect(a.result.current.canAddDoctors).toBe(false);
    expect(a.result.current.overSeats).toBe(false);

    mock.current.rpcs.get_clinic_doctor_access = () => ({ data: null, error: { message: "down" } });
    const b = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.access).toBeNull();
    expect(b.result.current.isMulti).toBe(true);
  });

  it("a transient list failure keeps the last good list and is logged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toHaveLength(2);

    mock.current.tables.practitioners = { data: null, error: { message: "network down" } };
    await act(async () => { await result.current.refetch(); });
    expect(result.current.active).toHaveLength(2);
    expect(result.current.isMulti).toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("malformed access fields are treated as unknown, and a null seat_limit is never over seats", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ ...ACCESS, seat_limit: "3" });
    const a = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.access).toBeNull();
    expect(a.result.current.overSeats).toBe(false);

    mock.current.rpcs.get_clinic_doctor_access = () => ({ ...ACCESS, seat_limit: null });
    const b = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.overSeats).toBe(false);
    expect(b.result.current.canAddDoctors).toBe(true);
  });

  it("subscribes to the clinic's practitioner changes and refetches debounced", async () => {
    const { result, unmount } = renderHook(() => usePractitioners(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock.current.client.channel).toHaveBeenCalledWith("practitioners-clinic-1");
    const ch = mock.current.client.channel.mock.results[0].value;
    const [event, opts, handler] = ch.on.mock.calls[0];
    expect(event).toBe("postgres_changes");
    expect(opts).toMatchObject({ table: "practitioners", filter: "doctor_id=eq.clinic-1" });

    const before = mock.current.opsOf("practitioners").length;
    vi.useFakeTimers();
    act(() => {
      handler();
      handler();
      handler();
    });
    expect(mock.current.opsOf("practitioners").length).toBe(before);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(mock.current.opsOf("practitioners").length).toBe(before + 1);
    vi.useRealTimers();

    unmount();
    expect(mock.current.client.removeChannel).toHaveBeenCalled();
  });

  it("outside the provider it returns the inert state without throwing", async () => {
    const { result } = renderHook(() => usePractitioners());
    expect(result.current.isMulti).toBe(false);
    expect(result.current.practitioners).toEqual([]);
    expect(result.current.active).toEqual([]);
    expect(result.current.bookable).toEqual([]);
    expect(result.current.primary).toBeNull();
    expect(result.current.access).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.byId("a")).toBeUndefined();
    await expect(result.current.refetch()).resolves.toBeUndefined();
    expect(mock.current.client.from).not.toHaveBeenCalled();
  });
});
