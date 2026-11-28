import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProfilePage from "./ProfilePage";

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  canEdit: true,
  profile: {} as Record<string, unknown>,
  refetch: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("./DoctorPaymentOnboarding", () => ({ default: () => null }));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, refetch: h.refetch, can: (k: string) => (k === "profile.edit" ? h.canEdit : true) }),
}));
vi.mock("@/integrations/supabase/client", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = (result: unknown): any => {
    const p = Promise.resolve(result);
    return Object.assign(p, { select: () => chain(result), eq: () => chain(result), neq: () => chain(result), order: () => chain(result), maybeSingle: () => Promise.resolve({ data: null }) });
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "x" } }) }) },
      from: (table: string) => {
        if (table === "services") return chain({ data: [{ name: "Acne treatment" }, { name: "Hair fall consultation" }], error: null });
        return { update: (v: Record<string, unknown>) => { h.updates.push(v); return chain({ error: null }); }, select: () => chain({ data: null }) };
      },
    },
  };
});

const BASE = {
  id: "c1", full_name: "Dr. Meera Shah", specialization: "Dermatologist", qualifications: "MBBS, MD", experience_years: 12,
  phone: "", clinic_name: "Shah Skin Clinic", city: "Kota", state: "Rajasthan", address: "", locality: "Talwandi", bio: "",
  slug: "dr-meera-shah", slug_locked: false,
};
const renderPage = (variant: "single" | "multi" = "single") =>
  render(<MemoryRouter><ProfilePage variant={variant} /></MemoryRouter>);
const box = () => screen.getByLabelText(/^bio/i) as HTMLTextAreaElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.updates = []; h.canEdit = true; h.profile = { ...BASE };
});

describe("ProfilePage bio", () => {
  it.each(["single", "multi"] as const)("%s layout shows the bio box with the saved bio", (variant) => {
    h.profile = { ...BASE, bio: "Existing saved bio that is long enough." };
    renderPage(variant);
    expect(box().value).toBe("Existing saved bio that is long enough.");
  });

  it("multi layout no longer points the owner to the Doctors page", () => {
    renderPage("multi");
    expect(screen.queryByRole("link", { name: /doctors page/i })).toBeNull();
    expect(screen.getByText(/write your bio below/i)).toBeInTheDocument();
  });

  it("Fill from my details uses the form values and the clinic's services, then Save sends the sanitised bio in the main update", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /fill from my details/i })).toBeInTheDocument());
    // Let the services query resolve.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: /fill from my details/i }));
    expect(box().value).toContain("Dr. Meera Shah is a Dermatologist in Talwandi, Kota with 12+ years of experience (MBBS, MD).");
    expect(box().value).toContain("Shah Skin Clinic");
    expect(box().value).toContain("Acne treatment and Hair fall consultation");

    fireEvent.change(box(), { target: { value: "<b>Hello</b> **world** bio text that is long enough for google to list." } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => expect(h.updates.length).toBeGreaterThanOrEqual(1));
    const main = h.updates[0];
    expect(main.bio).toBe("Hello world bio text that is long enough for google to list.");
    // slug logic untouched: name unchanged, so no slug in the payload.
    expect(main).not.toHaveProperty("slug");
  });

  it("an emptied bio is saved as null", async () => {
    h.profile = { ...BASE, bio: "Something that was here before." };
    renderPage();
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => expect(h.updates.length).toBeGreaterThanOrEqual(1));
    expect(h.updates[0].bio).toBeNull();
  });

  it("staff without profile.edit see the bio read-only with no helpers and no Save", () => {
    h.canEdit = false;
    renderPage();
    expect(box()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /fill from my details/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save profile/i })).toBeNull();
  });

  it("a name change still re-derives the slug alongside the bio", async () => {
    renderPage();
    fireEvent.change(screen.getByDisplayValue("Dr. Meera Shah"), { target: { value: "Dr. Asha Rao" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => expect(h.updates.length).toBeGreaterThanOrEqual(1));
    expect(h.updates[0].slug).toBe("dr-asha-rao");
  });
});
