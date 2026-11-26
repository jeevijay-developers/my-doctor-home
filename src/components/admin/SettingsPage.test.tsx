import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "./SettingsPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import { toast } from "sonner";

// website_settings writes, and what the next one answers.
const ws = vi.hoisted(() => ({
  updates: [] as { values: unknown; eq: unknown[] }[],
  next: { error: null } as { error: { message: string } | null },
  row: { clinical_visibility: "shared" } as Record<string, unknown> | null,
}));

// Settings now defaults to the Profile tab unless ?tab= says otherwise (see
// SettingsPage.tsx) — these tests exercise the Subscription tab's content,
// so they need to request it explicitly rather than relying on it being the
// default.
const renderSettingsPage = () => render(<SettingsPage />, {
  wrapper: ({ children }) => <MemoryRouter initialEntries={["/admin/settings?tab=subscription"]}>{children}</MemoryRouter>,
});

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({
  useFeatureAccess: () => ({ rows: [], hasFeature: () => false, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: vi.fn() }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: vi.fn(() => ({ isMulti: false, primary: null })) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any = { data: null, error: null }): any => {
    const promise = Promise.resolve(resolved);
    return Object.assign(promise, {
      select: () => chain(resolved),
      eq: () => chain(resolved),
      order: () => chain(resolved),
      maybeSingle: () => Promise.resolve(resolved),
      single: () => Promise.resolve(resolved),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: () => chain(resolved),
    });
  };
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table !== "website_settings") return chain();
        const row = { data: ws.row, error: null };
        return Object.assign(chain(row), {
          update: (values: unknown) => ({
            eq: (...eq: unknown[]) => {
              ws.updates.push({ values, eq });
              return Promise.resolve(ws.next);
            },
          }),
        });
      }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
    },
  };
});

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
    expect(screen.getAllByRole("button", { name: /upgrade to premium/i })).toHaveLength(1);
  });

  it("expired doctor: neither card says Current Plan, both show a CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "expired", plan_tier: "free" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false });
    renderSettingsPage();
    expect(screen.queryByText(/^current plan$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your access level/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /reactivate/i }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("SettingsPage clinical visibility (multi-doctor)", () => {
  const renderAccount = () => render(<SettingsPage />, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={["/admin/settings?tab=account"]}>{children}</MemoryRouter>,
  });
  const asOwner = (extra: Record<string, unknown> = {}) =>
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "active", plan_tier: "premium" }, loading: false, isStaff: false, role: "owner", can: () => false, ...extra } as any);
  const multi = (isMulti: boolean) => vi.mocked(usePractitioners).mockReturnValue({ isMulti, primary: { id: "pr-1" } } as any);

  beforeEach(() => {
    ws.updates.length = 0;
    ws.next = { error: null };
    ws.row = { clinical_visibility: "shared" };
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, appointmentsCap: 0, appointmentsUsed: 0, nearCap: false, loading: false });
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("is hidden in a single-doctor clinic", () => {
    asOwner();
    multi(false);
    renderAccount();
    expect(screen.queryByText(/doctors' access to records/i)).not.toBeInTheDocument();
  });

  it("is hidden for staff, even in a multi-doctor clinic", () => {
    asOwner({ isStaff: true, role: "staff" });
    multi(true);
    renderAccount();
    expect(screen.queryByText(/doctors' access to records/i)).not.toBeInTheDocument();
  });

  it("is hidden for a doctor login (not the owner)", () => {
    asOwner({ isStaff: true, role: "doctor" });
    multi(true);
    renderAccount();
    expect(screen.queryByText(/doctors' access to records/i)).not.toBeInTheDocument();
  });

  it("owner in a multi-doctor clinic can switch to own patients only", async () => {
    asOwner();
    multi(true);
    renderAccount();
    expect(await screen.findByText(/doctors' access to records/i)).toBeInTheDocument();
    expect(screen.getByText(/allergies and history/i)).toBeInTheDocument();
    const shared = screen.getByRole("radio", { name: /shared/i });
    await waitFor(() => expect(shared).toBeChecked());
    fireEvent.click(screen.getByRole("radio", { name: /own patients only/i }));
    fireEvent.click(screen.getByRole("button", { name: /save access/i }));
    await waitFor(() => expect(ws.updates).toHaveLength(1));
    expect(ws.updates[0]).toEqual({ values: { clinical_visibility: "treating" }, eq: ["doctor_id", "doctor-1"] });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("shows the owner-only message when the database refuses", async () => {
    asOwner();
    multi(true);
    ws.next = { error: { message: 'OWNER_ONLY: only the clinic owner can change clinical_visibility' } };
    renderAccount();
    await screen.findByText(/doctors' access to records/i);
    fireEvent.click(screen.getByRole("radio", { name: /own patients only/i }));
    fireEvent.click(screen.getByRole("button", { name: /save access/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only the clinic owner can do this."));
  });
});
