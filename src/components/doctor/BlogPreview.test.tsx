import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BlogPreview from "./BlogPreview";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));

const db = vi.hoisted(() => ({ posts: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: db.posts }) }) }) }) }),
    }),
  },
}));

const post = (id: string, title: string) => ({
  id, slug: id, title, excerpt: "Short summary", content: "word ".repeat(300), category: "Heart",
  featured_image_url: null, published_at: "2026-10-01T10:00:00Z", created_at: "2026-10-01T10:00:00Z",
});

const renderBlog = () =>
  render(
    <MemoryRouter initialEntries={["/dr/asha"]}>
      <Routes>
        <Route path="/dr/:slug" element={<BlogPreview />} />
      </Routes>
    </MemoryRouter>,
  );

describe("BlogPreview", () => {
  beforeEach(() => {
    vi.mocked(useDoctorData).mockReturnValue({ profile: { id: "d1" }, settings: {} } as never);
  });

  it("shows a placeholder, not a vanished section, when switched on with no articles yet", async () => {
    db.posts = [];
    renderBlog();
    expect(await screen.findByText(/No articles yet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Written by the doctor");
  });

  it("features the newest article and lists the next ones", async () => {
    db.posts = [post("a", "Heart health basics"), post("b", "Sleep and the heart")];
    renderBlog();
    expect(await screen.findByRole("heading", { name: "Heart health basics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sleep and the heart/ })).toHaveAttribute("href", expect.stringContaining("/dr/asha/blog/"));
    expect(screen.getByRole("link", { name: /All articles/ })).toHaveAttribute("href", "/dr/asha/blog");
  });

  it("renders nothing when the doctor has switched articles off", () => {
    vi.mocked(useDoctorData).mockReturnValue({ profile: { id: "d1" }, settings: { show_blog: false } } as never);
    db.posts = [post("a", "Hidden")];
    const { container } = renderBlog();
    expect(container).toBeEmptyDOMElement();
  });
});
