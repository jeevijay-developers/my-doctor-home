import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/components/landing/LandingNavbar", () => ({ default: () => <nav data-testid="nav" /> }));
vi.mock("@/components/landing/LandingFooter", () => ({ default: () => <footer /> }));

import HealthArticlesHub from "./HealthArticlesHub";

const art = (i: number, extra = {}) => ({
  id: `id${i}`, slug: `post-${i}`, title: `Post ${i}`, excerpt: `Excerpt ${i}`, category: "Heart Health",
  featured_image_url: null, published_at: "2026-10-01T00:00:00Z", updated_at: null, reading_minutes: 4,
  doctor_slug: "dr-a", doctor_name: "Anita Sharma", doctor_specialization: "Cardiologist", doctor_city: "Kota",
  doctor_photo_url: null, total_count: 30, ...extra,
});
const facets = [{ slug: "heart-health", label: "Heart Health", post_count: 30 }];

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/health-articles" element={<HealthArticlesHub />} />
        <Route path="/health-articles/:category" element={<HealthArticlesHub />} />
      </Routes>
    </MemoryRouter>,
  );
const robots = () => document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content;

beforeEach(() => {
  rpc.mockReset();
  document.head.innerHTML = "";
  rpc.mockImplementation(async (fn: string) => ({ data: fn === "search_blog_posts" ? [art(1), art(2)] : facets, error: null }));
});

describe("HealthArticlesHub", () => {
  it("lists articles, linking to the doctor's canonical article and profile", async () => {
    renderAt("/health-articles");
    expect(await screen.findByRole("heading", { level: 1, name: "Health Articles by Doctors" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post 1/ })).toHaveAttribute("href", "/dr/dr-a/blog/post-1");
    expect(screen.getAllByRole("link", { name: /Dr\. Anita Sharma/ })[0]).toHaveAttribute("href", "/dr/dr-a");
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: null, p_limit: 12, p_offset: 0 });
    await waitFor(() => expect(robots()).toContain("index, follow"));
    expect(document.title).toBe("Health Articles Written by Doctors in India | Doctylia");
  });

  it("uses the category and page from the URL", async () => {
    renderAt("/health-articles/heart-health?page=2");
    expect(await screen.findByRole("heading", { level: 1, name: "Heart Health Articles by Doctors" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", { p_query: null, p_category: "heart-health", p_limit: 12, p_offset: 12 });
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/health-articles/heart-health");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/health-articles/heart-health?page=3");
  });

  it("noindexes free-text searches", async () => {
    renderAt("/health-articles?q=diabetes");
    expect(await screen.findByText('Results for "diabetes"')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("search_blog_posts", expect.objectContaining({ p_query: "diabetes" }));
    await waitFor(() => expect(robots()).toBe("noindex, follow"));
  });

  it("shows an empty state and an error state", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === "search_blog_posts" ? [] : [], error: null }));
    const first = renderAt("/health-articles");
    expect(await screen.findByText(/No articles yet/i)).toBeInTheDocument();
    first.unmount();

    rpc.mockImplementation(async (fn: string) => (fn === "search_blog_posts" ? { data: null, error: { message: "x" } } : { data: [], error: null }));
    renderAt("/health-articles");
    expect(await screen.findByText(/Couldn't load articles/i)).toBeInTheDocument();
  });
});
