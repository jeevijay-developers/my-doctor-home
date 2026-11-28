import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BlogPostPage from "./BlogPostPage";

const h = vi.hoisted(() => ({ fromMock: vi.fn(), rpc: vi.fn(), jsonLd: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: h.fromMock, rpc: h.rpc } }));
vi.mock("@/components/doctor/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/lib/seo/blogSeo", async (orig) => {
  const m = await orig<typeof import("@/lib/seo/blogSeo")>();
  return {
    ...m,
    buildBlogPostJsonLd: (input: Parameters<typeof m.buildBlogPostJsonLd>[0]) => {
      h.jsonLd(input);
      return m.buildBlogPostJsonLd(input);
    },
  };
});

const clinic = {
  id: "clinic-1", slug: "city-clinic", display_name: "City Clinic", clinic_name: "City Clinic", full_name: null,
  onboarding_completed: true, profile_photo_url: null, specialization: "General", qualifications: "MBBS",
};
const team = [
  { id: "p-1", display_name: "Asha Rao", slug: "asha-rao", specialization: "Cardiology", photo_url: null, directory_listed: true },
  { id: "p-2", display_name: "Dr. Ravi", slug: "ravi", specialization: "Skin", photo_url: null, directory_listed: false },
];

const post = (practitioner_id: string | null) => ({
  id: "post-1", doctor_id: clinic.id, title: "Heart tips", content: "<p>Body</p>", excerpt: null, category: null,
  featured_image_url: null, published_at: "2026-08-22T00:00:00.000Z", created_at: "2026-08-22T00:00:00.000Z",
  is_published: true, practitioner_id,
});

function renderPost(practitionerId: string | null) {
  h.fromMock.mockImplementation((table: string) => {
    const data = table === "profiles" ? clinic : post(practitionerId);
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, { select: chain, eq: chain, neq: chain, order: chain, limit: () => Promise.resolve({ data: [] }), single: () => Promise.resolve({ data }) });
    return q;
  });
  return render(
    <MemoryRouter initialEntries={["/dr/city-clinic/blog/post-1"]}>
      <Routes><Route path="/dr/:slug/blog/:postId" element={<BlogPostPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("BlogPostPage author byline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: team, error: null });
  });

  it("links the byline to a listed practitioner and passes practitioner + team size to the JSON-LD builder", async () => {
    renderPost("p-1");
    const link = await screen.findByRole("link", { name: /by dr\. asha rao/i });
    expect(link).toHaveAttribute("href", "/dr/city-clinic/doctor/asha-rao");
    await waitFor(() => {
      const last = h.jsonLd.mock.calls.at(-1)?.[0];
      expect(last?.clinicTeamSize).toBe(2);
      expect(last?.practitioner).toMatchObject({ display_name: "Asha Rao", slug: "asha-rao" });
    });
    expect(h.rpc).toHaveBeenCalledWith("get_public_practitioners", { _doctor_id: "clinic-1" });
  });

  it("shows plain text for an unlisted practitioner", async () => {
    renderPost("p-2");
    expect(await screen.findByText(/by dr\. ravi/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /by dr\. ravi/i })).not.toBeInTheDocument();
  });

  it("credits the clinic, not its owner, for a clinic-level post at a clinic with 2+ doctors", async () => {
    renderPost(null);
    expect(await screen.findByText(/written by city clinic/i)).toBeInTheDocument();
    expect(screen.queryByText(/written by dr\. city clinic/i)).not.toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("get_public_practitioners", { _doctor_id: "clinic-1" });
    expect(h.jsonLd.mock.calls.at(-1)?.[0].practitioner ?? null).toBeNull();
  });

  it("keeps the owner byline for a clinic-level post when the clinic has one doctor", async () => {
    h.rpc.mockResolvedValue({ data: [team[0]], error: null });
    renderPost(null);
    expect(await screen.findByText(/written by dr\. city clinic/i)).toBeInTheDocument();
  });

  it("falls back to the clinic byline when the practitioners call fails", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderPost("p-1");
    expect(await screen.findByText(/written by dr\. city clinic/i)).toBeInTheDocument();
    expect(screen.queryByText(/by dr\. asha rao/i)).not.toBeInTheDocument();
  });
});
