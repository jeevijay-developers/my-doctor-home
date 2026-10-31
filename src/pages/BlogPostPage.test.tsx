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
  qualifications: "MBBS, MD",
};

const createPost = (content: string, extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

function renderPost(content: string, extra: Record<string, unknown> = {}) {
  fromMock.mockImplementation((table: string) => {
    const data = table === "profiles" ? doctor : createPost(content, extra);
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

describe("BlogPostPage authorship and disclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a 'Written by' byline that links to the doctor's page", async () => {
    renderPost("<p>Body</p>");
    const byline = await screen.findByText(/Written by Dr. Example Doctor/);
    expect(byline.closest("a")).toHaveAttribute("href", "/dr/dr-example");
    expect(screen.queryByText(/Reviewed by/)).not.toBeInTheDocument();
    expect(screen.getByText(/General medicine · MBBS, MD/)).toBeInTheDocument();
  });

  it("discloses AI assistance only when the post is flagged ai_assisted", async () => {
    const { unmount } = renderPost("<p>Body</p>", { ai_assisted: true });
    expect(await screen.findByText("Drafted with AI assistance, reviewed and published by Dr. Example Doctor.")).toBeInTheDocument();
    unmount();
    renderPost("<p>Body</p>", { ai_assisted: false });
    await screen.findByText(/Written by Dr. Example Doctor/);
    expect(screen.queryByText(/Drafted with AI assistance/)).not.toBeInTheDocument();
  });

  it("carries the general-education note", async () => {
    renderPost("<p>Body</p>");
    expect(await screen.findByText("This article is for general education and is not a substitute for personal medical advice.")).toBeInTheDocument();
  });
});
