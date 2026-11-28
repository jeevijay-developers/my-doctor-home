import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BlogPostPage from "./BlogPostPage";

const h = vi.hoisted(() => ({ rpc: vi.fn(), post: null as unknown, related: [] as unknown[] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        eq: chain,
        neq: chain,
        order: chain,
        limit: () => Promise.resolve({ data: h.related }),
        single: () => Promise.resolve({ data: table === "profiles" ? clinic : h.post }),
      });
      return q;
    },
  },
}));
vi.mock("@/components/doctor/Footer", () => ({ default: () => <footer /> }));

const clinic = {
  id: "c1", slug: "city-clinic", clinic_name: "City Clinic", display_name: "Owner Person", full_name: null, city: "Kota",
  onboarding_completed: true, profile_photo_url: "https://cdn.example/owner.jpg", specialization: "Owner specialty", qualifications: "MBBS",
};
const dr = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, display_name: name, slug: `${id}-slug`, specialization: "Cardiology", photo_url: null, bio: null, directory_listed: true, ...over,
});
const TEAM = [
  dr("a", "Asha Rao", { photo_url: "https://cdn.example/asha.jpg", bio: "Asha treats <b>hearts</b>.\n\nShe also teaches." }),
  dr("b", "Vikram Shah", { specialization: "Skin" }),
];
const mkPost = (practitioner_id: string | null, extra: Record<string, unknown> = {}) => ({
  id: "post-1", doctor_id: "c1", title: "Heart tips", content: "<p>Body</p>", excerpt: null, category: null,
  featured_image_url: null, published_at: "2026-08-22T00:00:00.000Z", created_at: "2026-08-22T00:00:00.000Z",
  is_published: true, practitioner_id, ai_assisted: false, ...extra,
});
const rel = (id: string, title: string, practitioner_id: string | null) => ({
  id, title, practitioner_id, featured_image_url: null, category: null, published_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", slug: null,
});

const renderPost = () =>
  render(
    <MemoryRouter initialEntries={["/dr/city-clinic/blog/post-1"]}>
      <Routes><Route path="/dr/:slug/blog/:postId" element={<BlogPostPage />} /></Routes>
    </MemoryRouter>,
  );

describe("BlogPostPage in a team clinic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: TEAM, error: null });
    h.related = [];
    h.post = mkPost("a");
  });

  it("uses the real author everywhere: byline avatar, author box, booking card, never the owner", async () => {
    renderPost();
    const box = (await screen.findByRole("region", { name: "About the author" }));
    await within(box).findByText("About Dr. Asha Rao");
    expect(within(box).getByText("Cardiology")).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: "View profile" })).toHaveAttribute("href", "/dr/city-clinic/doctor/a-slug");
    expect(within(box).getByRole("link", { name: /Their articles/ })).toHaveAttribute("href", "/dr/city-clinic/blog?author=a-slug");
    expect(within(box).getByRole("img", { name: "Dr. Asha Rao" })).toHaveAttribute("src", "https://cdn.example/asha.jpg");
    // the byline names the author, and nothing credits the owner's name or photo
    expect(screen.getByRole("link", { name: /By Dr\. Asha Rao/ })).toBeInTheDocument();
    expect(screen.queryByText(/Owner Person/)).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://cdn.example/owner.jpg"]')).toBeNull();
    // the booking card is the author's, and goes to their page
    const bookLinks = screen.getAllByRole("link", { name: /Book appointment/ });
    expect(bookLinks.length).toBeGreaterThan(0);
    bookLinks.forEach((l) => expect(l).toHaveAttribute("href", "/dr/city-clinic/doctor/a-slug#booking"));
  });

  it("shows the author's short bio as plain text, never markup", async () => {
    const { container } = renderPost();
    const box = await screen.findByRole("region", { name: "About the author" });
    await within(box).findByText("About Dr. Asha Rao");
    expect(within(box).getByText("Asha treats <b>hearts</b>. She also teaches.")).toBeInTheDocument();
    expect(container.querySelector("section[aria-label='About the author'] b")).toBeNull();
  });

  it("names the author in the 'More from' heading and lists their posts first", async () => {
    h.related = [rel("r1", "Skin care", "b"), rel("r2", "Heart diet", "a"), rel("r3", "Heart sleep", "a"), rel("r4", "Heart stress", "a")];
    renderPost();
    expect(await screen.findByRole("heading", { name: "More from Dr. Asha Rao" })).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "More from Dr. Asha Rao" }).closest("section")!;
    expect(within(section).getAllByRole("heading", { level: 3 }).map((e) => e.textContent)).toEqual(["Heart diet", "Heart sleep", "Heart stress"]);
  });

  it("fills with other posts, under a neutral heading, when the author has fewer than three", async () => {
    h.related = [rel("r1", "Skin care", "b"), rel("r2", "Heart diet", "a"), rel("r4", "Clinic news", null)];
    renderPost();
    const heading = await screen.findByRole("heading", { name: "More health articles" });
    const section = heading.closest("section")!;
    expect(within(section).getAllByRole("heading", { level: 3 }).map((e) => e.textContent)).toEqual(["Heart diet", "Skin care", "Clinic news"]);
  });

  it("falls back to the clinic when the post names no doctor", async () => {
    h.post = mkPost(null);
    renderPost();
    const box = await screen.findByRole("region", { name: "About the author" });
    await within(box).findByText("About City Clinic");
    expect(screen.getByText("Written by City Clinic")).toBeInTheDocument();
    expect(screen.getAllByText(/talk it through with one of our doctors/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Owner Person/)).not.toBeInTheDocument();
    screen.getAllByRole("link", { name: /Book appointment/ }).forEach((l) => expect(l).toHaveAttribute("href", "/dr/city-clinic#booking"));
  });

  it("falls back to the clinic when the author was deactivated", async () => {
    h.post = mkPost("gone");
    renderPost();
    expect(await screen.findByText("Written by City Clinic")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View profile" })).not.toBeInTheDocument();
  });

  it("credits an unlisted author by name with no profile link, and books through the clinic", async () => {
    h.rpc.mockResolvedValue({ data: [TEAM[0], dr("b", "Vikram Shah", { directory_listed: false, bio: "Skin specialist." })], error: null });
    h.post = mkPost("b");
    renderPost();
    const box = await screen.findByRole("region", { name: "About the author" });
    await within(box).findByText("About Dr. Vikram Shah");
    expect(within(box).queryByRole("link", { name: "View profile" })).not.toBeInTheDocument();
    expect(within(box).queryByRole("link", { name: /About Dr\. Vikram Shah/ })).not.toBeInTheDocument();
    expect(within(box).getByText("Skin specialist.")).toBeInTheDocument();
    screen.getAllByRole("link", { name: /Book appointment/ }).forEach((l) => expect(l).toHaveAttribute("href", "/dr/city-clinic#booking"));
  });

  it("an author without photo or bio shows initials and no bio paragraph", async () => {
    h.post = mkPost("b");
    renderPost();
    const box = await screen.findByRole("region", { name: "About the author" });
    await within(box).findByText("About Dr. Vikram Shah");
    expect(within(box).getByText("VS")).toBeInTheDocument();
    expect(within(box).queryByRole("img")).not.toBeInTheDocument();
  });

  it("encodes an author slug with special characters in links", async () => {
    h.rpc.mockResolvedValue({ data: [dr("a", "Asha Rao", { slug: "o'neil & co" }), TEAM[1]], error: null });
    renderPost();
    const box = await screen.findByRole("region", { name: "About the author" });
    await within(box).findByText("About Dr. Asha Rao");
    expect(within(box).getByRole("link", { name: /Their articles/ })).toHaveAttribute("href", "/dr/city-clinic/blog?author=o'neil%20%26%20co");
    expect(within(box).getByRole("link", { name: "View profile" })).toHaveAttribute("href", "/dr/city-clinic/doctor/o'neil%20%26%20co");
  });

  it("names the author in the AI disclosure", async () => {
    h.post = mkPost("a", { ai_assisted: true });
    renderPost();
    expect(await screen.findByText(/reviewed and published by Dr\. Asha Rao/)).toBeInTheDocument();
  });
});

describe("BlogPostPage in a single-doctor clinic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: [TEAM[0]], error: null });
    h.post = mkPost(null);
    h.related = [rel("r1", "Skin care", "b"), rel("r2", "Heart diet", "a"), rel("r3", "x", null), rel("r4", "y", null)];
  });

  it("is unchanged: the owner is the author, with the first three related posts in date order", async () => {
    renderPost();
    expect(await screen.findByText("Written by Dr. Owner Person")).toBeInTheDocument();
    expect(screen.getByText("About Dr. Owner Person")).toBeInTheDocument();
    const heading = await screen.findByRole("heading", { name: "More from Dr. Owner Person" });
    await waitFor(() => expect(within(heading.closest("section")!).getAllByRole("heading", { level: 3 }).map((e) => e.textContent)).toEqual(["Skin care", "Heart diet", "x"]));
    screen.getAllByRole("link", { name: /Book appointment/ }).forEach((l) => expect(l).toHaveAttribute("href", "/dr/city-clinic#booking"));
  });
});
