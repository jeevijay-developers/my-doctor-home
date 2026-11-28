import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import BlogListPage from "./BlogListPage";

const h = vi.hoisted(() => ({ rpc: vi.fn(), posts: [] as unknown[], profile: null as unknown }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        eq: chain,
        single: () => Promise.resolve({ data: table === "profiles" ? h.profile : null }),
        order: () => Promise.resolve({ data: h.posts }),
      });
      return q;
    },
  },
}));
vi.mock("@/components/doctor/Footer", () => ({ default: () => <footer /> }));

const clinic = {
  id: "c1", slug: "city-clinic", clinic_name: "City Clinic", full_name: "Asha Rao", display_name: "Asha Rao", city: "Kota",
  specialization: "Cardiology", profile_photo_url: "https://cdn.example/owner.jpg", onboarding_completed: true,
};
const dr = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, display_name: name, slug: id, specialization: "Cardiology", photo_url: null, directory_listed: true, ...over,
});
const post = (id: string, title: string, practitioner_id: string | null, category: string | null = null) => ({
  id, title, practitioner_id, category, content: "<p>x</p>", excerpt: null, featured_image_url: null,
  published_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", is_published: true, slug: null,
});

const Search = () => <p data-testid="search">{useLocation().search}</p>;
const renderList = (search = "") =>
  render(
    <MemoryRouter initialEntries={[`/dr/city-clinic/blog${search}`]}>
      <Routes>
        <Route path="/dr/:slug/blog" element={<><BlogListPage /><Search /></>} />
      </Routes>
    </MemoryRouter>,
  );

const TEAM = [dr("asha", "Asha Rao"), dr("vikram", "Vikram Shah", { specialization: "Skin" })];

describe("BlogListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.profile = clinic;
    h.posts = [post("p1", "Heart tips", "asha", "Heart"), post("p2", "Skin care", "vikram", "Skin"), post("p3", "Clinic news", null)];
    h.rpc.mockResolvedValue({ data: TEAM, error: null });
    document.head.querySelector('meta[property="og:image"]')?.remove();
  });

  describe("team clinic", () => {
    it("uses the clinic name instead of the owner in the headline copy, title and byline", async () => {
      renderList();
      expect(await screen.findByText("Clear, practical health guidance from the doctors at City Clinic.")).toBeInTheDocument();
      expect(screen.getByText("Written by the doctors at City Clinic")).toBeInTheDocument();
      expect(screen.queryByText(/Written by Dr\. Asha Rao/)).not.toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe("Health Articles · City Clinic | Doctylia"));
    });

    it("does not share the owner's photo as the page image", async () => {
      renderList();
      await screen.findByText("Written by the doctors at City Clinic");
      expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "").toBe("");
    });

    it("names the clinic in the JSON-LD collection and the breadcrumb", async () => {
      const { container } = renderList();
      await screen.findByText("Written by the doctors at City Clinic");
      const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
      const blog = ld["@graph"][0];
      expect(blog.name).toBe("Health Articles from City Clinic");
      expect(blog.author).toMatchObject({ "@type": "MedicalClinic", name: "City Clinic" });
      expect(ld["@graph"][1].itemListElement[0].name).toBe("City Clinic");
    });

    it("bylines each card with its real author, and the clinic for a clinic post", async () => {
      renderList();
      await screen.findByText("Written by the doctors at City Clinic");
      const cards = await screen.findAllByRole("link", { name: /Read Article/ });
      expect(cards).toHaveLength(3);
      expect(within(cards[0]).getByText("By Dr. Asha Rao")).toBeInTheDocument();
      expect(within(cards[1]).getByText("By Dr. Vikram Shah")).toBeInTheDocument();
      expect(within(cards[2]).getByText("By City Clinic")).toBeInTheDocument();
    });

    it("offers author chips (All, each doctor with posts, Clinic) with counts", async () => {
      renderList();
      const group = await screen.findByRole("group", { name: "Filter articles by author" });
      expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "All authors(3)", "Dr. Asha Rao(1)", "Dr. Vikram Shah(1)", "Clinic(1)",
      ]);
      expect(within(group).getByRole("button", { name: /All authors/ })).toHaveAttribute("aria-pressed", "true");
    });

    it("filters by ?author=<slug>, and the chip updates the URL", async () => {
      renderList("?author=vikram");
      expect(await screen.findByText("Written by Dr. Vikram Shah")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Heart tips" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Skin care" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Dr\. Vikram Shah/ })).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: /Dr\. Asha Rao/ }));
      expect(screen.getByTestId("search")).toHaveTextContent("?author=asha");
      expect(await screen.findByRole("heading", { name: "Heart tips" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Skin care" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /All authors/ }));
      expect(screen.getByTestId("search")).toHaveTextContent("");
      expect(screen.getByRole("heading", { name: "Clinic news" })).toBeInTheDocument();
    });

    it("the Clinic chip shows posts without a doctor", async () => {
      renderList("?author=clinic");
      expect(await screen.findByText("Written by the doctors at City Clinic")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Heart tips" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Clinic news" })).toBeInTheDocument();
    });

    it("an unknown ?author shows everything instead of an empty page", async () => {
      renderList("?author=ghost");
      expect(await screen.findByRole("heading", { name: "Heart tips" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Skin care" })).toBeInTheDocument();
    });

    it("a post of a deactivated doctor falls back to the clinic", async () => {
      h.posts = [post("p1", "Heart tips", "asha"), post("p9", "Old post", "gone")];
      renderList();
      await screen.findByText("Written by the doctors at City Clinic");
      const cards = await screen.findAllByRole("link", { name: /Read Article/ });
      expect(within(cards[1]).getByText("By City Clinic")).toBeInTheDocument();
    });

    it("category chips narrow within the chosen author", async () => {
      h.posts = [post("p1", "Heart tips", "asha", "Heart"), post("p4", "Diet", "asha", "Food"), post("p2", "Skin care", "vikram", "Skin")];
      renderList("?author=asha");
      await screen.findByRole("heading", { name: "Heart tips" });
      await waitFor(() => {
        const cats = screen.getByLabelText("Filter articles by category");
        expect(within(cats).getAllByRole("button").map((b) => b.textContent)).toEqual(["All Articles", "Heart", "Food"]);
      });
    });
  });

  describe("single-doctor clinic", () => {
    beforeEach(() => {
      h.rpc.mockResolvedValue({ data: [dr("asha", "Asha Rao")], error: null });
      h.posts = [post("p1", "Heart tips", null, "Heart")];
    });

    it("keeps the doctor-centred copy, title and photo", async () => {
      renderList();
      expect(await screen.findByText("Clear, practical health guidance from Dr. Asha Rao, Cardiology.")).toBeInTheDocument();
      expect(screen.getByText("Written by Dr. Asha Rao")).toBeInTheDocument();
      expect(document.title).toBe("Health Articles · Dr. Asha Rao | Doctylia");
      expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://cdn.example/owner.jpg");
    });

    it("has no author chips and no per-card byline", async () => {
      renderList();
      await screen.findByRole("heading", { name: "Heart tips" });
      expect(screen.queryByRole("group", { name: "Filter articles by author" })).not.toBeInTheDocument();
      expect(screen.queryByText(/^By /)).not.toBeInTheDocument();
    });

    it("keeps working when the doctor lookup fails", async () => {
      h.rpc.mockRejectedValue(new Error("down"));
      renderList();
      expect(await screen.findByText("Written by Dr. Asha Rao")).toBeInTheDocument();
    });
  });
});
