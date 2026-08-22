import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BlogPostPage from "./BlogPostPage";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("@/components/doctor/BlogImagePlaceholder", () => ({
  default: () => <div data-testid="blog-image-placeholder" />,
}));

vi.mock("@/components/doctor/Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));

const doctor = {
  id: "doctor-1",
  slug: "dr-example",
  display_name: "Example Doctor",
  full_name: null,
  onboarding_completed: true,
  profile_photo_url: null,
  specialization: "General medicine",
};

const createPost = (content: string) => ({
  id: "post-1",
  doctor_id: doctor.id,
  title: "Health article",
  content,
  excerpt: null,
  category: null,
  featured_image_url: null,
  published_at: "2026-08-22T00:00:00.000Z",
  created_at: "2026-08-22T00:00:00.000Z",
  is_published: true,
});

function renderPost(content: string) {
  fromMock.mockImplementation((table: string) => {
    const data = table === "profiles" ? doctor : createPost(content);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ single: vi.fn().mockResolvedValue({ data }) }),
            single: vi.fn().mockResolvedValue({ data }),
          }),
          single: vi.fn().mockResolvedValue({ data }),
        }),
      }),
    };
  });

  return render(
    <MemoryRouter initialEntries={["/dr/dr-example/blog/post-1"]}>
      <Routes>
        <Route path="/dr/:slug/blog/:postId" element={<BlogPostPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("BlogPostPage article content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed stored Markdown as semantic article elements", async () => {
    renderPost("## Care plan **today** 1. Book a visit 2. Follow up ---");

    await waitFor(() => expect(screen.getByRole("heading", { name: /Care plan/ })).toBeInTheDocument());

    const article = screen.getByRole("heading", { name: /Care plan/ }).closest("article");
    expect(article?.querySelector("h2")).toHaveTextContent("Care plan today");
    expect(article?.querySelector("strong")).toHaveTextContent("today");
    expect(article?.querySelector("ol")).toBeInTheDocument();
    expect(article?.querySelectorAll("ol > li")).toHaveLength(2);
    expect(article?.querySelector("hr")).toBeInTheDocument();
  });

  it("keeps stored HTML intact while preserving the iframe allowance", async () => {
    renderPost('<h2>Existing heading</h2><p><strong>Existing HTML</strong></p><iframe src="https://example.com" allow="fullscreen"></iframe>');

    await waitFor(() => expect(screen.getByRole("heading", { name: "Existing heading" })).toBeInTheDocument());

    const article = screen.getByRole("heading", { name: "Existing heading" }).closest("article");
    expect(article?.querySelector("strong")).toHaveTextContent("Existing HTML");
    expect(article?.querySelector("iframe")).toHaveAttribute("allow", "fullscreen");
  });
});