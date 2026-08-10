import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BlogPage from "./BlogPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", specialization: "Cardiology" } }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));

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
  },
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ title: "T", excerpt: "E", content: "C", category: "General Health" }),
});

describe("BlogPage - AI writer auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
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
});

describe("BlogPage - AI Blog Writer gating", () => {
  it("shows LockedFeatureCard instead of the AI writer inputs for a Basic-tier doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByRole("button", { name: /request upgrade/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/top 10 tips/i)).not.toBeInTheDocument();
  });

  it("shows the real AI writer inputs for a Premium doctor", async () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    expect(await screen.findByPlaceholderText(/top 10 tips/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request upgrade/i })).not.toBeInTheDocument();
  });
});
