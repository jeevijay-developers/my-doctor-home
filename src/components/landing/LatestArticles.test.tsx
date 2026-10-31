import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
// `rejectNext` returns a rejected promise outside the spy: vitest attaches its own handler to promises a spy returns,
// which would surface as an unhandled rejection unrelated to the component.
let rejectNext = false;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => { const r = rpc(...a); return rejectNext ? Promise.reject(new Error("missing")) : r; } },
}));
import LatestArticles from "./LatestArticles";

const art = (i: number) => ({
  id: `i${i}`, slug: `p${i}`, title: `Post ${i}`, excerpt: "x", category: "Heart Health", featured_image_url: null,
  published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 2, doctor_slug: "dr-a", doctor_name: "Anita Sharma",
  doctor_specialization: null, doctor_city: null, doctor_photo_url: null, total_count: 6,
});
const mount = () => render(<MemoryRouter><LatestArticles /></MemoryRouter>);
beforeEach(() => { rpc.mockReset(); rejectNext = false; });

describe("LatestArticles", () => {
  it("shows the newest articles with a link to the full hub", async () => {
    rpc.mockResolvedValue({ data: [art(1), art(2), art(3)], error: null });
    mount();
    expect(await screen.findByRole("heading", { name: /latest health articles/i })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: null, p_limit: 6, p_offset: 0 });
    expect(screen.getByRole("link", { name: /view all articles/i })).toHaveAttribute("href", "/health-articles");
  });
  it("renders nothing when there are fewer than 3 articles or the call fails", async () => {
    rpc.mockResolvedValue({ data: [art(1)], error: null });
    const a = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    const b = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(b.container).toBeEmptyDOMElement();
  });
  it("renders nothing and does not throw when the call rejects", async () => {
    rejectNext = true;
    const a = mount();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(a.container).toBeEmptyDOMElement();
  });
});
