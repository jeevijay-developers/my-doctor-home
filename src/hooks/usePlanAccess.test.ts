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
});
