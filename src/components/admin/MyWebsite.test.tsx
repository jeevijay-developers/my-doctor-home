import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePractitioners } from "@/hooks/usePractitioners";

// Every query-builder call, per table, so tests can check filters and writes.
const calls = vi.hoisted(() => [] as { table: string; method: string; args: unknown[] }[]);

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
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: vi.fn() }));

const SINGLE = { primary: null, isMulti: false };
beforeEach(() => {
  calls.length = 0;
  vi.mocked(usePractitioners).mockReturnValue(SINGLE as any);
});

// LockedFeatureCard (rendered when the feature is locked) nests
// UpgradeCheckoutDialog, which independently calls the real usePlanAccess —
// mock it too so that path doesn't hit supabase.rpc.
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string, resolved: any): any => {
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain(table, resolved);
    };
    return Object.assign(Promise.resolve(resolved), {
      select: record("select"),
      eq: record("eq"),
      order: record("order"),
      update: record("update"),
      insert: record("insert"),
      single: () => Promise.resolve(resolved),
    });
  };
  const hours = [1, 2].map((d) => ({
    id: `wh-${d}`, day_of_week: d, is_open: true, start_time: "09:00", end_time: "13:00", start_time_2: null, end_time_2: null,
  }));
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "website_settings") {
          return chain(table, { data: { id: "ws-1", doctor_id: "doctor-1", show_online_consultation: false } });
        }
        if (table === "services") {
          return chain(table, { data: [{ id: "service-1", name: "General Consultation", description: "Routine care", price: 500, type: "clinic", duration: 30, active: true, sort_order: 0 }] });
        }
        if (table === "working_hours") return chain(table, { data: hours, error: null });
        return chain(table, { data: [] });
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

describe("MyWebsite - Working Hours and practitioners", () => {
  const lockedFeatures = () =>
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
  const eqs = (table: string) => calls.filter((c) => c.table === table && c.method === "eq").map((c) => c.args);

  it("before the main doctor is known, loads hours by clinic only (today's behaviour)", async () => {
    lockedFeatures();
    renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /working hours/i }));
    expect(await screen.findByText("Monday")).toBeInTheDocument();
    expect(eqs("working_hours")).toEqual([["doctor_id", "doctor-1"]]);
  });

  it("single-doctor clinic: the main doctor arriving later does not refetch (and overwrite) the hours", async () => {
    lockedFeatures();
    const { rerender } = renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /working hours/i }));
    expect(await screen.findByText("Monday")).toBeInTheDocument();
    const hoursReads = () => calls.filter((c) => c.table === "working_hours" && c.method === "select").length;
    expect(hoursReads()).toBe(1);

    vi.mocked(usePractitioners).mockReturnValue({ primary: { id: "pr-1", is_primary: true }, isMulti: false } as any);
    rerender(<MemoryRouter><MyWebsite /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 30));
    expect(hoursReads()).toBe(1);
  });

  it("single-doctor clinic: loads the main doctor's hours and saves them as before", async () => {
    lockedFeatures();
    vi.mocked(usePractitioners).mockReturnValue({ primary: { id: "pr-1", is_primary: true }, isMulti: false } as any);
    renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /working hours/i }));
    expect(await screen.findByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(eqs("working_hours")).toContainEqual(["practitioner_id", "pr-1"]);
    expect(eqs("working_hours")).toContainEqual(["doctor_id", "doctor-1"]);

    calls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(calls.some((c) => c.table === "working_hours" && c.method === "update")).toBe(true));
    const updates = calls.filter((c) => c.table === "working_hours" && c.method === "update");
    expect(updates).toHaveLength(2);
    expect(updates[0].args[0]).toEqual({ is_open: true, start_time: "09:00", end_time: "13:00", start_time_2: null, end_time_2: null });
    expect(eqs("working_hours")).toContainEqual(["id", "wh-1"]);
  });

  it("multi-doctor clinic: points to the Doctors page, hides the grid and does not save hours", async () => {
    lockedFeatures();
    vi.mocked(usePractitioners).mockReturnValue({ primary: { id: "pr-1", is_primary: true }, isMulti: true } as any);
    renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /working hours/i }));
    expect(await screen.findByText((_, el) => el?.tagName === "P" && /each doctor's hours are set on the doctors page/i.test(el.textContent ?? ""))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /doctors page/i })).toHaveAttribute("href", "/admin/doctors");
    expect(screen.queryByText("Monday")).not.toBeInTheDocument();
    // The clinic-wide slot length stays here.
    expect(screen.getByText(/appointment slot duration/i)).toBeInTheDocument();

    await screen.findByRole("button", { name: /^save$/i });
    calls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(calls.some((c) => c.table === "website_settings" && c.method === "update")).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((c) => c.table === "working_hours" && c.method === "update")).toBe(false);
  });
});
