import "@/components/doctor/__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PractitionerPage from "./PractitionerPage";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({
  DoctorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDoctorData: vi.fn(),
}));
vi.mock("@/components/doctor/BookingWidget", () => ({ default: () => <div data-testid="booking-widget" /> }));
vi.mock("@/components/doctor/Navbar", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/doctor/BottomActionBar", () => ({ default: () => <div data-testid="bottom-bar" /> }));
vi.mock("@/components/doctor/ClinicDetails", () => ({ default: () => <section data-testid="clinic-details" /> }));
vi.mock("@/components/doctor/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/doctor/DoctorThemeProvider", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/doctor/motion/SmoothScroll", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/doctor/motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));

const db = vi.hoisted(() => ({ posts: [] as unknown[], calls: [] as Array<[string, unknown[]]> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      const chain = (name: string) => (...a: unknown[]) => {
        db.calls.push([name, a]);
        return q;
      };
      Object.assign(q, {
        select: chain("select"),
        eq: chain("eq"),
        order: chain("order"),
        limit: () => Promise.resolve({ data: db.posts }),
        insert: () => Promise.resolve({ error: null }),
      });
      return q;
    },
  },
}));

const hour = (practitioner_id: string, day: number, start: string, end: string) => ({
  day_of_week: day, is_open: true, start_time: start, end_time: end, start_time_2: null, end_time_2: null, practitioner_id,
});
const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "General Physician", qualifications: "MBBS",
  experience_years: 10, bio: "Asha has treated families for a decade.", photo_url: null, registration_number: "REG-1",
  consultation_fee: null, slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0,
  directory_listed: true, review_count: 0, avg_rating: null, ...over,
});
const DR_A = doc({});
const DR_B = doc({ id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", specialization: "Cardiologist", consultation_fee: 1200, is_primary: false });

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "c1", slug: "dr-a", full_name: "Asha Rao", clinic_name: "City Clinic", city: "Kota", consultation_fee: 750, plan_status: "active" },
    settings: {},
    services: [],
    servicePractitioners: [],
    reviews: [],
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_A, DR_B],
    allWorkingHours: [hour("pa", 1, "09:00:00", "13:00:00"), hour("pb", 2, "15:00:00", "18:00:00")],
    rawWorkingHours: [hour("pa", 1, "09:00:00", "13:00:00"), hour("pb", 2, "15:00:00", "18:00:00")],
    isMultiDoctor: true,
    isTeamClinic: true,
    hasFeature: () => true,
    loading: false,
    ...over,
  } as never);

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dr/:slug/doctor/:doctorSlug" element={<PractitionerPage />} />
        <Route path="/dr/:slug" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
const PAGE = "/dr/dr-a/doctor/vikram-shah";

describe("PractitionerPage in the full site shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.posts = [];
    db.calls = [];
    document.head.querySelector('meta[name="robots"]')?.remove();
  });

  it("wraps the page in the clinic site's navbar, footer and action bar", () => {
    mockData();
    renderAt(PAGE);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-bar")).toBeInTheDocument();
    expect(document.querySelector(".doctor-site")).not.toBeNull();
    expect(document.querySelector("main#main")).not.toBeNull();
    expect(document.getElementById("booking-zone")).not.toBeNull();
  });

  it("shows the profile facts and a Book button for this doctor", () => {
    mockData({ practitioners: [DR_A, { ...DR_B, experience_years: 1 }] });
    renderAt(PAGE);
    expect(screen.getByText("MBBS")).toBeInTheDocument();
    expect(screen.getByText("1 year in practice")).toBeInTheDocument();
    expect(screen.getByText("REG-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book with Dr. Vikram Shah" })).toBeInTheDocument();
  });

  it("shows initials without a photo, and the photo (named) with one", () => {
    mockData();
    const { unmount } = renderAt(PAGE);
    expect(screen.getByText("VS")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Dr. Vikram Shah" })).not.toBeInTheDocument();
    unmount();
    mockData({ practitioners: [DR_A, { ...DR_B, photo_url: "https://cdn.example/vs.jpg" }] });
    renderAt(PAGE);
    expect(screen.getByRole("img", { name: "Dr. Vikram Shah" })).toBeInTheDocument();
  });

  it("says 'Profile coming soon' for a doctor without a bio", () => {
    mockData({ practitioners: [DR_A, { ...DR_B, bio: "   " }] });
    renderAt(PAGE);
    expect(screen.getByRole("heading", { level: 2, name: "About Dr. Vikram Shah" })).toBeInTheDocument();
    expect(screen.getByText("Profile coming soon")).toBeInTheDocument();
  });

  it("keeps line breaks and paragraphs of the bio", () => {
    mockData({ practitioners: [DR_A, { ...DR_B, bio: "First line\nSecond line\n\nNew paragraph" }] });
    renderAt(PAGE);
    const first = screen.getByText(/First line/);
    expect(first.textContent).toBe("First line\nSecond line");
    expect(first.className).toContain("whitespace-pre-line");
    expect(screen.getByText("New paragraph")).toBeInTheDocument();
  });

  it("collapses a very long bio behind Read more", () => {
    mockData({ practitioners: [DR_A, { ...DR_B, bio: "Long experience. ".repeat(200) }] });
    renderAt(PAGE);
    const more = screen.getByRole("button", { name: /read more/i });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: /show less/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("marks today in this doctor's hours", () => {
    const all = Array.from({ length: 7 }, (_, d) => hour("pb", d, "09:00:00", "13:00:00"));
    mockData({ allWorkingHours: all, rawWorkingHours: all });
    renderAt(PAGE);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("says so when the doctor has no hours set", () => {
    mockData({ allWorkingHours: [], rawWorkingHours: [] });
    renderAt(PAGE);
    expect(screen.getByText(/Hours are not set yet/)).toBeInTheDocument();
  });

  describe("services", () => {
    const services = [
      { id: "s1", name: "General check-up", price: 600, type: "clinic", duration: 20 },
      { id: "s2", name: "Echo test", price: 1500, type: "clinic" },
    ];
    it("lists every service when none is mapped to a doctor", () => {
      mockData({ services, servicePractitioners: [] });
      renderAt(PAGE);
      const section = screen.getByRole("heading", { name: "Services offered by Dr. Vikram Shah" }).closest("section")!;
      expect(within(section).getByText("General check-up")).toBeInTheDocument();
      expect(within(section).getByText("Echo test")).toBeInTheDocument();
      expect(within(section).getByText(/20 min/)).toBeInTheDocument();
    });
    it("lists only the services mapped to this doctor, plus unmapped ones", () => {
      mockData({ services, servicePractitioners: [{ service_id: "s2", practitioner_id: "pa" }] });
      renderAt(PAGE);
      expect(screen.getByText("General check-up")).toBeInTheDocument();
      expect(screen.queryByText("Echo test")).not.toBeInTheDocument();
    });
    it("hides the section when every service belongs to other doctors, or the clinic has none", () => {
      mockData({ services, servicePractitioners: [{ service_id: "s1", practitioner_id: "pa" }, { service_id: "s2", practitioner_id: "pa" }] });
      const { unmount } = renderAt(PAGE);
      expect(screen.queryByRole("heading", { name: /Services offered by/ })).not.toBeInTheDocument();
      unmount();
      mockData({ services: [] });
      renderAt(PAGE);
      expect(screen.queryByRole("heading", { name: /Services offered by/ })).not.toBeInTheDocument();
    });
    it("a service's Book button preselects the doctor and the service", () => {
      mockData({ services: [services[0]] });
      const doctors: unknown[] = [];
      const picked: unknown[] = [];
      const a = (e: Event) => doctors.push((e as CustomEvent).detail);
      const b = (e: Event) => picked.push((e as CustomEvent).detail);
      window.addEventListener("doctylia:select-doctor", a);
      window.addEventListener("doctylia:select-service", b);
      renderAt(PAGE);
      fireEvent.click(screen.getByRole("button", { name: "Book General check-up with Dr. Vikram Shah" }));
      window.removeEventListener("doctylia:select-doctor", a);
      window.removeEventListener("doctylia:select-service", b);
      expect(doctors.at(-1)).toEqual({ id: "pb" });
      expect(picked.at(-1)).toMatchObject({ id: "s1" });
    });
  });

  describe("reviews", () => {
    it("invites the first review when the doctor has none (another doctor's review is not shown)", () => {
      mockData({ reviews: [{ id: "x", practitioner_id: "pa", patient_name: "P", rating: 5, review_text: "Asha was kind", created_at: "2026-10-01T10:00:00Z" }] });
      renderAt(PAGE);
      expect(screen.getByRole("heading", { level: 2, name: "Be the first to share your experience" })).toBeInTheDocument();
      expect(screen.queryByText(/Asha was kind/)).not.toBeInTheDocument();
    });
    it("hides reviews when the clinic turned them off", () => {
      mockData({ settings: { show_reviews: false } });
      renderAt(PAGE);
      expect(screen.queryByRole("button", { name: /write a review/i })).not.toBeInTheDocument();
    });
  });

  describe("articles", () => {
    const post = { id: "p1", title: "Heart health at 40", category: "Cardiology", content: "<p>hello</p>", published_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z", slug: "heart-health" };
    it("lists this doctor's articles with a link to the filtered article list", async () => {
      db.posts = [post];
      mockData();
      renderAt(PAGE);
      expect(await screen.findByRole("heading", { name: "Articles by Dr. Vikram Shah" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Heart health at 40/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /All articles by Dr\. Vikram Shah/ })).toHaveAttribute("href", "/dr/dr-a/blog?author=vikram-shah");
      expect(db.calls).toContainEqual(["eq", ["practitioner_id", "pb"]]);
    });
    it("hides the block when the doctor has no articles", async () => {
      mockData();
      renderAt(PAGE);
      await waitFor(() => expect(db.calls.length).toBeGreaterThan(0));
      expect(screen.queryByRole("heading", { name: /Articles by/ })).not.toBeInTheDocument();
    });
    it("does not ask for articles when the clinic hides them", () => {
      db.posts = [post];
      mockData({ settings: { show_blog: false } });
      renderAt(PAGE);
      expect(db.calls).toEqual([]);
    });
  });

  it("links to each other doctor's own page, excluding this one", () => {
    mockData();
    renderAt(PAGE);
    const strip = screen.getByRole("heading", { name: /Other doctors at City Clinic/ }).closest("section")!;
    const links = within(strip).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dr/dr-a/doctor/asha-rao");
    expect(links[0]).toHaveTextContent("Dr. Asha Rao");
  });

  describe("edge cases", () => {
    it("redirects to the clinic page when only one doctor is left", () => {
      mockData({ practitioners: [DR_B], isTeamClinic: false, isMultiDoctor: false });
      renderAt(PAGE);
      expect(screen.getByTestId("where")).toHaveTextContent("/dr/dr-a");
    });

    it("redirects when the doctor was deactivated (no longer listed)", () => {
      mockData({ practitioners: [DR_A, doc({ id: "pc", display_name: "C", slug: "c" })] });
      renderAt(PAGE);
      expect(screen.getByTestId("where")).toHaveTextContent("/dr/dr-a");
    });

    it("marks an unlisted doctor's page noindex but still shows it, and removes the tag on leaving", () => {
      mockData({ practitioners: [DR_A, { ...DR_B, directory_listed: false }] });
      const { unmount } = renderAt(PAGE);
      expect(screen.getByRole("heading", { level: 1, name: "Dr. Vikram Shah" })).toBeInTheDocument();
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow");
      unmount();
      expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    });

    it("marks a thin profile (short bio) noindex, and a real bio indexable", () => {
      const real = "Dr. Vikram has treated heart patients in Kota for over twenty years and leads the cardiac unit.";
      mockData({ practitioners: [DR_A, { ...DR_B, bio: "Cardiologist." }] });
      const { unmount } = renderAt(PAGE);
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, follow");
      unmount();
      mockData({ practitioners: [DR_A, { ...DR_B, bio: real }] });
      renderAt(PAGE);
      expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    });

    it("finds a doctor whose slug has special characters", () => {
      mockData({ practitioners: [DR_A, { ...DR_B, slug: "o'neil & co" }] });
      renderAt(`/dr/dr-a/doctor/${encodeURIComponent("o'neil & co")}`);
      expect(screen.getByRole("heading", { level: 1, name: "Dr. Vikram Shah" })).toBeInTheDocument();
    });

    it("shows Doctor Not Found for an unknown clinic (an old clinic address is redirected by the provider first)", () => {
      mockData({ profile: null, practitioners: [] });
      renderAt("/dr/nobody/doctor/vikram-shah");
      expect(screen.getByText("Doctor Not Found")).toBeInTheDocument();
    });

    it("shows the unavailable notice for a cancelled clinic", () => {
      mockData({ profile: { id: "c1", slug: "dr-a", plan_status: "cancelled" } });
      renderAt(PAGE);
      expect(screen.getByText("This clinic is temporarily unavailable")).toBeInTheDocument();
    });

    it("hides the clinic address block when the clinic turned it off", () => {
      mockData({ settings: { show_clinic_details: false } });
      renderAt(PAGE);
      expect(screen.queryByTestId("clinic-details")).not.toBeInTheDocument();
      cleanup();
      mockData();
      renderAt(PAGE);
      expect(screen.getByTestId("clinic-details")).toBeInTheDocument();
    });
  });
});
