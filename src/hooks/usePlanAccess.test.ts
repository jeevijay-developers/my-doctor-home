import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePlanAccess } from "./usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1" }, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";

describe("usePlanAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns isPremium=true and no cap numbers for a premium doctor", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: true, appointments_used: 0, appointments_cap: 0 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPremium).toBe(true);
    expect(result.current.nearCap).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith("get_appointment_cap_usage", { _doctor_id: "doctor-1" });
  });

  it("computes nearCap at >= 90% usage for a basic doctor", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 460, appointments_cap: 500 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPremium).toBe(false);
    expect(result.current.appointmentsUsed).toBe(460);
    expect(result.current.appointmentsCap).toBe(500);
    expect(result.current.nearCap).toBe(true);
  });

  it("nearCap is false comfortably under the threshold", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 100, appointments_cap: 500 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.nearCap).toBe(false);
  });

  it("reports an unlimited custom plan for a non-premium doctor: no cap, never 'near cap'", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 480, appointments_cap: 0, appointments_unlimited: true, standard_cap: 100 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isPremium).toBe(false);
    expect(result.current.appointmentsUnlimited).toBe(true);
    expect(result.current.standardCap).toBe(100);
    expect(result.current.nearCap).toBe(false);
  });

  it("uses the custom limit as the cap and keeps the standard limit for the plan cards", async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ is_premium: false, appointments_used: 280, appointments_cap: 300, appointments_unlimited: false, standard_cap: 100 }],
      error: null,
    });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.appointmentsCap).toBe(300);
    expect(result.current.standardCap).toBe(100);
    expect(result.current.nearCap).toBe(true); // 280 / 300
  });

  it("re-reads straight away when the custom plan changes, so the meter never lags the plan", async () => {
    const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValue({ data: [{ is_premium: false, appointments_used: 10, appointments_cap: 100, appointments_unlimited: false, standard_cap: 100 }], error: null });
    const { result } = renderHook(() => usePlanAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.appointmentsCap).toBe(100);

    rpc.mockResolvedValue({ data: [{ is_premium: false, appointments_used: 10, appointments_cap: 0, appointments_unlimited: true, standard_cap: 100 }], error: null });
    window.dispatchEvent(new Event("doctylia:custom-plan-changed"));
    await waitFor(() => expect(result.current.appointmentsUnlimited).toBe(true));
  });
});
