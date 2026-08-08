import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BlogPage from "./BlogPage";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test", specialization: "Cardiology" } }),
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
  },
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ title: "T", excerpt: "E", content: "C", category: "General Health" }),
});

describe("BlogPage - AI writer auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the doctor's real session access_token as the bearer, not the anon key", async () => {
    render(<BlogPage />);
    fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Heart health" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer real-doctor-jwt");
  });
});
