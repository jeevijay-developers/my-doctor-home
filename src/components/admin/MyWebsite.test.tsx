import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useProfile", () => {
  // Stable identity: MyWebsite reloads whenever `profile` changes, and a fresh
  // object on every render retriggers that effect forever.
  const profile = { id: "doctor-1", full_name: "Dr. Test", slug: "dr-test" };
  return {
    useProfile: () => ({ profile, loading: false, isStaff: false, can: () => false }),
  };
});

vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));

// LockedFeatureCard (rendered when the feature is locked) nests
// UpgradeCheckoutDialog, which independently calls the real usePlanAccess —
// mock it too so that path doesn't hit supabase.rpc.
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

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
        if (table === "services") {
          return chain({ data: [{ id: "service-1", name: "General Consultation", description: "Routine care", price: 500, type: "clinic", duration: 30, active: true, sort_order: 0 }] });
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
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    renderMyWebsite();
    expect(await screen.findByRole("button", { name: /upgrade now/i })).toBeInTheDocument();
  });

  it("shows the real Online Consultation toggle for a Premium doctor", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    renderMyWebsite();
    await screen.findByText(/online consultation/i);
    expect(screen.queryByRole("button", { name: /upgrade now/i })).not.toBeInTheDocument();
  });
});

describe("MyWebsite - Services editor", () => {
  it("renders service identity fields including the configurable service price", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    renderMyWebsite();

    fireEvent.click(screen.getByRole("button", { name: "Services" }));

    expect(await screen.findByDisplayValue("General Consultation")).toBeInTheDocument();
    expect(screen.getByText("Clinic")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByText("Price (₹)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
  });
});
