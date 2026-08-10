import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { usePlanAccess } from "@/hooks/usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", slug: "dr-test" }, loading: false }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    eq: () => chain(resolved),
    order: () => Promise.resolve(resolved),
    single: () => Promise.resolve(resolved),
  });
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "website_settings") {
          return chain({ data: { id: "ws-1", doctor_id: "doctor-1", show_online_consultation: false } });
        }
        return chain({ data: [] });
      }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
    },
  };
});

function renderMyWebsite() {
  return render(
    <MemoryRouter>
      <MyWebsite />
    </MemoryRouter>
  );
}

describe("MyWebsite - Online Consultation gating", () => {
  it("shows LockedFeatureCard instead of the toggle for a Basic-tier doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    renderMyWebsite();
    expect(await screen.findByRole("button", { name: /upgrade now/i })).toBeInTheDocument();
  });

  it("shows the real Online Consultation toggle for a Premium doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    renderMyWebsite();
    await screen.findByText(/online consultation/i);
    expect(screen.queryByRole("button", { name: /upgrade now/i })).not.toBeInTheDocument();
  });
});
