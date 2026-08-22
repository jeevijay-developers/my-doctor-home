import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BlogPage from "./BlogPage";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

vi.mock("./RichTextEditor", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="Content" value={value} readOnly />,
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", specialization: "Cardiology" }, can: () => true }),
}));

vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));

// LockedFeatureCard (rendered when the feature is locked) nests
// UpgradeCheckoutDialog, which independently calls the real usePlanAccess —
// mock it too so that path doesn't hit supabase.rpc.
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "real-doctor-jwt" } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }),
    },
  },
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ title: "T", excerpt: "E", content: "C", category: "General Health" }),
});

describe("BlogPage - AI writer auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, loading: false, rows: [], refetch: vi.fn() });
  });

  it("sends the doctor's real session access_token as the bearer, not the anon key", async () => {
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Heart health" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer real-doctor-jwt");
  });

  it("converts AI Markdown into HTML before passing it to the editor", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "T",
        excerpt: "E",
        content: "## Heading\n\n**bold**",
        category: "General Health",
      }),
    } as Response);

    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Heart health" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Content")).toHaveValue("<h2>Heading</h2>\n<p><strong>bold</strong></p>\n");
    });
    expect(screen.getByLabelText("Content")).not.toHaveValue("## Heading\n\n**bold**");
  });
});

describe("BlogPage - AI Blog Writer gating", () => {
  it("shows LockedFeatureCard instead of the AI writer inputs for a Basic-tier doctor", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, loading: false, rows: [], refetch: vi.fn() });
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByText(/generate patient-friendly health articles/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/top 10 tips/i)).not.toBeInTheDocument();
  });

  it("shows the real AI writer inputs for a Premium doctor", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, loading: false, rows: [], refetch: vi.fn() });
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByPlaceholderText(/top 10 tips/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade to premium|request upgrade/i })).not.toBeInTheDocument();
  });
});
