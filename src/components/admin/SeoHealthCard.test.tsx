import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SeoHealthCard from "./SeoHealthCard";

const h = vi.hoisted(() => ({
  role: "owner" as string, isStaff: false, granted: [] as string[], clinicId: "c1", active: [] as any[], profile: {} as any,
  counts: {} as Record<string, number | null>, settings: null as any,
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, role: h.role, isStaff: h.isStaff, can: (k: string) => h.granted.includes(k) }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ active: h.active }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: any = { _f: [] as string[] };
      q.select = (_c: string, opts?: any) => { q._head = !!opts?.head; return q; };
      q.eq = () => q; q.gt = () => q;
      q.maybeSingle = () => Promise.resolve({ data: h.settings, error: null });
      q.then = (res: any, rej: any) => {
        const n = h.counts[table];
        return Promise.resolve(n === undefined ? { count: 0, error: null } : n === null ? { count: null, error: { message: "x" } } : { count: n, error: null }).then(res, rej);
      };
      return q;
    },
  },
}));

const bio = "b".repeat(80);
const fullProfile = { id: "c1", clinic_name: "Sunrise", full_name: "A S", city: "Kota", address: "1 Rd", clinic_phone: "99", google_maps_url: "https://maps.google.com/x", profile_photo_url: "p", bio, slug: "sunrise" };
const renderIt = () => render(<MemoryRouter><SeoHealthCard /></MemoryRouter>);
const doc = (n: number, o: any = {}) => ({ id: `d${n}`, display_name: `Dr ${n}`, photo_url: "x", bio, is_active: true, slug: `d${n}`, ...o });

describe("SeoHealthCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(h, { role: "owner", isStaff: false, granted: [], active: [], profile: { ...fullProfile }, settings: { hero_photo_url: "h" },
      counts: { services: 2, reviews: 4, blog_posts: 0, gallery_photos: 1, working_hours: 5 } });
  });

  it("shows the score with a text label, the guidance note and the top actions", async () => {
    renderIt();
    const region = screen.getByRole("region", { name: /search visibility/i });
    await waitFor(() => expect(region).toHaveTextContent(/Looking good: 92 out of 100|out of 100/));
    expect(region).toHaveTextContent("Google decides rankings");
    const fix = await screen.findByRole("link", { name: /fix: at least one published health article/i });
    expect(fix).toHaveAttribute("href", "/admin/blog");
    expect(screen.getByRole("img", { name: /score \d+ out of 100/i })).toBeInTheDocument();
  });

  it("never tells a team clinic to fix its address by hand (it switches automatically)", async () => {
    h.active = [doc(1), doc(2)];
    h.profile = { ...fullProfile, slug: "dr-a-s" };
    renderIt();
    expect(screen.queryByRole("link", { name: /fix: .*website address/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /see full checklist/i }));
    expect(await screen.findByText(/Switches automatically/)).toBeInTheDocument();
  });

  it("expands the full checklist", async () => {
    renderIt();
    const btn = screen.getByRole("button", { name: /see full checklist/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Clinic details")).toBeInTheDocument();
    expect(screen.getByText("Google Maps link")).toBeInTheDocument();
  });

  it("dismisses only the next-steps part, per clinic, and can bring it back", async () => {
    renderIt();
    await screen.findByText("Do these next");
    fireEvent.click(screen.getByRole("button", { name: /hide next steps/i }));
    expect(screen.queryByText("Do these next")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /search visibility/i })).toBeInTheDocument();
    expect(window.localStorage.getItem("doctylia:seo-nudge-dismissed:c1")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /show next steps/i }));
    expect(screen.getByText("Do these next")).toBeInTheDocument();
  });

  it("renders nothing for doctor logins and for staff without website/profile edit", () => {
    h.role = "doctor";
    const a = renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    a.unmount();
    Object.assign(h, { role: "staff", isStaff: true, granted: ["website.view"] });
    const b = renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    b.unmount();
    h.granted = ["profile.edit"];
    renderIt();
    expect(screen.getByRole("region", { name: /search visibility/i })).toBeInTheDocument();
  });

  it("copes with no data: profile with only an id, failed lookups", async () => {
    h.profile = { id: "c1" };
    h.settings = null;
    h.counts = { services: null, reviews: null, blog_posts: null, gallery_photos: null, working_hours: null };
    renderIt();
    expect(await screen.findByText(/Needs work: \d+ out of 100/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^fix:/i }).length).toBe(3);
  });

  it("9+ doctors: lists names compactly in the checklist and sends doctor fixes to the Doctors page", async () => {
    h.active = Array.from({ length: 9 }, (_, i) => doc(i, { bio: "" }));
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /see full checklist/i }));
    expect(await screen.findByText(/and 6 more/)).toBeInTheDocument();
    const fixes = screen.getAllByRole("link", { name: /fix: every doctor has a bio/i });
    expect(fixes[0]).toHaveAttribute("href", "/admin/doctors");
  });
});
