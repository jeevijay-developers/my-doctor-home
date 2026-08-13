import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "./SettingsPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { useProfile } from "@/hooks/useProfile";

// Settings now defaults to the Profile tab unless ?tab= says otherwise (see
// SettingsPage.tsx) — these tests exercise the Subscription tab's content,
// so they need to request it explicitly rather than relying on it being the
// default.
const renderSettingsPage = () => render(<SettingsPage />, {
  wrapper: ({ children }) => <MemoryRouter initialEntries={["/admin/settings?tab=subscription"]}>{children}</MemoryRouter>,
});

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
  },
}));

const baseProfile = { id: "doctor-1", full_name: "Dr. Test" };

describe("SettingsPage subscription cards", () => {
  it("trial doctor: Premium marked current via trial, Pro has no CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "trial", plan_tier: "free" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, appointmentsCap: 0, appointmentsUsed: 0, nearCap: false, loading: false });
    renderSettingsPage();
    expect(screen.getByText(/included via your trial/i)).toBeInTheDocument();
    expect(screen.getByText(/what you'll have after your trial ends/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /upgrade now/i })).toHaveLength(0);
  });

  it("active Pro doctor: Pro marked current, Premium shows a CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "active", plan_tier: "pro" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false });
    renderSettingsPage();
    expect(screen.getAllByText(/current plan/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /upgrade now/i })).toHaveLength(1);
  });

  it("expired doctor: neither card says Current Plan, both show a CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "expired", plan_tier: "free" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false });
    renderSettingsPage();
    expect(screen.queryByText(/^current plan$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your access level/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /upgrade now/i })).toHaveLength(2);
  });
});
