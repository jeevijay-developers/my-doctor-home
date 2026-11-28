import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePractitioners } from "@/hooks/usePractitioners";

const h = vi.hoisted(() => ({
  settingsRow: {} as Record<string, unknown>,
  updates: [] as { table: string; payload: any }[],
  updateError: null as null | { message: string },
  toasts: [] as any[],
}));

vi.mock("@/hooks/useCustomPlan", () => ({ useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }) }));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "doctor-1", full_name: "Anita Sharma", clinic_name: "Sunrise Clinic", city: "Kota", specialization: "ENT", slug: "sunrise-clinic" };
  return { useProfile: () => ({ profile, loading: false, isStaff: false, can: () => true }) };
});
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: vi.fn() }));
vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: any) => { h.toasts.push(t); } }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string, resolved: any, onUpdate?: any): any =>
    Object.assign(Promise.resolve(resolved), {
      select: () => chain(table, resolved),
      eq: () => chain(table, resolved),
      order: () => chain(table, resolved),
      insert: () => chain(table, resolved),
      update: (payload: any) => {
        h.updates.push({ table, payload });
        return chain(table, { error: h.updateError });
      },
      single: () => Promise.resolve(resolved),
    });
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "website_settings") return chain(table, { data: { id: "ws-1", doctor_id: "doctor-1", ...h.settingsRow } });
        return chain(table, { data: [] });
      }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

const open = async () => {
  render(<MemoryRouter><MyWebsite /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /website settings/i }));
  return screen.findByLabelText("Page title");
};

describe("MyWebsite SEO section", () => {
  beforeEach(() => {
    h.settingsRow = {}; h.updates = []; h.updateError = null; h.toasts = [];
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    vi.mocked(usePractitioners).mockReturnValue({ primary: null, isMulti: false, active: [] } as any);
  });

  it("blank stored values are Automatic and are not pre-filled into the boxes", async () => {
    const title = (await open()) as HTMLInputElement;
    expect(title.value).toBe("");
    expect(title.placeholder).toMatch(/Anita Sharma|Dr\. Anita/);
    expect(screen.getAllByText("Automatic").length).toBe(2);
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("seo-preview-title").textContent).toMatch(/Doctylia/);
    expect(screen.getByText("doctylia.com/dr/sunrise-clinic")).toBeInTheDocument();
  });

  it("shows the generated-title notice and resets it with a direct write", async () => {
    h.settingsRow = { seo_title: "Dr. Anita Sharma - ENT in Kota | Doctylia" };
    await open();
    await screen.findByText(/generated automatically from the doctor's name/i);
    fireEvent.click(screen.getByRole("button", { name: "Reset title" }));
    await waitFor(() => expect(h.updates).toContainEqual({ table: "website_settings", payload: { seo_title: "" } }));
    await waitFor(() => expect((screen.getByLabelText("Page title") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByText(/generated automatically from the doctor's name/i)).not.toBeInTheDocument();
  });

  it("a failed reset keeps the value and reports the error", async () => {
    h.settingsRow = { seo_title: "My own title" };
    h.updateError = { message: "permission denied" };
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Reset to automatic" }));
    await waitFor(() => expect(h.toasts.some((t) => t.variant === "destructive" && /permission denied/.test(t.description))).toBe(true));
    expect((screen.getByLabelText("Page title") as HTMLInputElement).value).toBe("My own title");
  });

  it("custom values over the limits show a warning in words and still render", async () => {
    h.settingsRow = { seo_title: "T".repeat(80), seo_description: "short" };
    await open();
    await waitFor(() => expect(document.getElementById("seo-title-count")!.textContent).toMatch(/80 of 60 characters - too long/));
    expect(document.getElementById("seo-description-count")!.textContent).toMatch(/5 of 160 characters - aim for 120 to 160/);
    expect(screen.getByTestId("seo-preview-title").textContent!.length).toBeLessThanOrEqual(60);
  });

  it("team clinic preview uses the clinic-level title, not the doctor's name", async () => {
    vi.mocked(usePractitioners).mockReturnValue({
      primary: null, isMulti: true,
      active: [{ id: "a", slug: "a", display_name: "Anita Sharma", is_active: true, specialization: "ENT" }, { id: "b", slug: "b", display_name: "Raj Mehta", is_active: true, specialization: "Dental" }],
    } as any);
    h.settingsRow = { seo_title: "Dr. Anita Sharma - ENT in Kota | Doctylia" };
    await open();
    await waitFor(() => expect(screen.getByTestId("seo-preview-title").textContent).toMatch(/^Sunrise Clinic/));
  });
});
