import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DoctorPublicPage from "./DoctorPublicPage";

const ctx = vi.hoisted(() => ({ value: {} as any }));

vi.mock("@/contexts/DoctorContext", () => ({
  DoctorProvider: ({ children }: any) => <>{children}</>,
  useDoctorData: () => ctx.value,
}));
const stub = vi.hoisted(() => (name: string) => ({ default: () => <div>SECTION:{name}</div> }));
vi.mock("@/components/doctor/Navbar", () => stub("navbar"));
vi.mock("@/components/doctor/HeroBanner", () => stub("hero"));
vi.mock("@/components/doctor/AboutSection", () => stub("about"));
vi.mock("@/components/doctor/ServicesSection", () => stub("services"));
vi.mock("@/components/doctor/GallerySection", () => stub("gallery"));
vi.mock("@/components/doctor/BookingWidget", () => stub("booking"));
vi.mock("@/components/doctor/ReviewsSection", () => stub("reviews"));
vi.mock("@/components/doctor/BlogPreview", () => stub("blog"));
vi.mock("@/components/doctor/ClinicDetails", () => stub("clinic"));
vi.mock("@/components/doctor/ContactQueryForm", () => stub("query"));
vi.mock("@/components/doctor/Footer", () => stub("footer"));
vi.mock("@/components/doctor/DoctorsSection", () => stub("doctors"));

const base = (over: Record<string, unknown> = {}) => ({
  profile: { id: "d1", full_name: "Asha Rao", specialization: "Cardiologist", city: "Pune", slug: "asha", plan_status: "active" },
  settings: {},
  loading: false,
  services: [{ id: 1, name: "Consult", price: 500 }],
  reviews: [],
  gallery: [],
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <DoctorPublicPage />
    </MemoryRouter>,
  );

describe("DoctorPublicPage", () => {
  beforeEach(() => {
    ctx.value = base();
  });

  it("shows a spinner while loading, with no sections", () => {
    ctx.value = base({ loading: true });
    const { container } = renderPage();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("SECTION:hero")).not.toBeInTheDocument();
  });

  it("shows Doctor Not Found for an unknown/unpublished profile", () => {
    ctx.value = base({ profile: null });
    renderPage();
    expect(screen.getByText("Doctor Not Found")).toBeInTheDocument();
  });

  it("hides a suspended (cancelled) clinic entirely, including booking", () => {
    ctx.value = base({ profile: { ...base().profile, plan_status: "cancelled" } });
    renderPage();
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("SECTION:booking")).not.toBeInTheDocument();
  });

  it("renders the default sections; booking and contact form are always present", () => {
    renderPage();
    for (const s of ["navbar", "hero", "services", "about", "blog", "booking", "reviews", "clinic", "query", "footer"]) {
      expect(screen.getByText(`SECTION:${s}`)).toBeInTheDocument();
    }
    // the gallery is opt-in and off by default
    expect(screen.queryByText("SECTION:gallery")).not.toBeInTheDocument();
  });

  it("hides the blog section only when the doctor switches it off", () => {
    ctx.value = base({ settings: { show_blog: false } });
    renderPage();
    expect(screen.queryByText("SECTION:blog")).not.toBeInTheDocument();
  });

  it("respects the doctor's section toggles", () => {
    ctx.value = base({
      settings: { show_about: false, show_reviews: false, show_clinic_details: false, show_services: false, show_blog: true, show_gallery: true },
      gallery: [{ id: 1 }],
    });
    renderPage();
    for (const s of ["about", "reviews", "clinic", "services"]) expect(screen.queryByText(`SECTION:${s}`)).not.toBeInTheDocument();
    for (const s of ["blog", "gallery", "booking", "query"]) expect(screen.getByText(`SECTION:${s}`)).toBeInTheDocument();
  });

  it("lays the sections out in the owner's order: hero, about, gallery, services, booking, reviews, articles, clinic details, contact form, footer", () => {
    ctx.value = base({ settings: { show_gallery: true }, gallery: [{ id: 1 }] });
    const { container } = renderPage();
    const order = [...container.querySelectorAll("div")]
      .filter((el) => el.children.length === 0) // the section stubs themselves, not wrappers around them
      .map((el) => el.textContent?.match(/^SECTION:(\w+)$/)?.[1])
      .filter(Boolean);
    expect(order).toEqual(["navbar", "hero", "about", "gallery", "services", "booking", "reviews", "blog", "clinic", "query", "footer"]);
  });

  it("a team clinic is clinic-first: hero, doctors, about, services, gallery, booking, reviews, articles, clinic details, contact form", () => {
    ctx.value = base({ isTeamClinic: true, isMultiDoctor: false, practitioners: [{ id: "a" }, { id: "b" }], settings: { show_gallery: true }, gallery: [{ id: 1 }] });
    const { container } = renderPage();
    const order = [...container.querySelectorAll("div")]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent?.match(/^SECTION:(\w+)$/)?.[1])
      .filter(Boolean);
    expect(order).toEqual(["navbar", "hero", "doctors", "about", "services", "gallery", "booking", "reviews", "blog", "clinic", "query", "footer"]);
  });

  it("a team clinic's document title uses the clinic name, specialties and city", () => {
    ctx.value = base({
      isTeamClinic: true,
      profile: { ...base().profile, clinic_name: "Little Steps Clinic", slug: "asha" },
      practitioners: [{ specialization: "Cardiology" }, { specialization: "ENT" }],
    });
    renderPage();
    expect(document.title).toBe("Little Steps Clinic - Cardiology, ENT in Pune | Doctylia");
  });

  it("a team clinic keeps an owner-written SEO title", () => {
    ctx.value = base({ isTeamClinic: true, settings: { seo_title: "My own title" }, practitioners: [] });
    renderPage();
    expect(document.title).toBe("My own title");
  });

  it("a single-doctor clinic keeps the doctor-led title", () => {
    renderPage();
    expect(document.title).toContain("Dr. Asha Rao");
    expect(document.title).not.toContain("clinic");
  });

  it("two bookable doctors without a team flag keep the old order (doctors after about)", () => {
    ctx.value = base({ isMultiDoctor: true });
    const { container } = renderPage();
    const order = [...container.querySelectorAll("div")]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent?.match(/^SECTION:(\w+)$/)?.[1])
      .filter(Boolean);
    expect(order.slice(0, 4)).toEqual(["navbar", "hero", "about", "doctors"]);
  });

  it("still shows Services (it offers the plain consultation) and Gallery (placeholder) when the doctor has switched them on but added nothing", () => {
    ctx.value = base({ services: [], settings: { show_gallery: true }, gallery: [] });
    renderPage();
    expect(screen.getByText("SECTION:services")).toBeInTheDocument();
    expect(screen.getByText("SECTION:gallery")).toBeInTheDocument();
  });

  it("hides Services only when the doctor switches it off", () => {
    ctx.value = base({ settings: { show_services: false } });
    renderPage();
    expect(screen.queryByText("SECTION:services")).not.toBeInTheDocument();
  });

  it("sets the document title and a canonical link for the doctor, and restores the title on unmount", () => {
    document.title = "Before";
    const { unmount } = renderPage();
    expect(document.title).toContain("Asha Rao");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain("/dr/asha");
    unmount();
    expect(document.title).toBe("Before");
  });

  it("does not crash on a malformed #hash in the URL", () => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={["/#%E0%A4%A"]}>
          <DoctorPublicPage />
        </MemoryRouter>,
      ),
    ).not.toThrow();
    expect(screen.getByText("SECTION:hero")).toBeInTheDocument();
  });

  it("emits JSON-LD structured data for the doctor", () => {
    const { container } = renderPage();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).toBeTruthy();
    expect(ld!.innerHTML).toContain("Asha Rao");
  });

  it("single-doctor JSON-LD has no employee links", () => {
    const { container } = renderPage();
    const ld = container.querySelector('script[type="application/ld+json"]')!;
    expect(ld.innerHTML).not.toContain("employee");
  });

  it("multi-doctor JSON-LD makes the main node a clinic with embedded doctor members", () => {
    const doc = (slug: string, name: string) => ({ id: slug, slug, display_name: name, is_primary: false, bookable: true });
    ctx.value = base({ isMultiDoctor: true, practitioners: [doc("asha-rao", "Asha Rao"), doc("ravi-n", "Ravi N")] });
    const { container } = renderPage();
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    const main = ld["@graph"][0];
    expect(main["@type"]).toContain("MedicalClinic");
    // Phase 2: members are embedded Physician nodes (a bare @id cannot be resolved from this page).
    expect(main.member).toHaveLength(2);
    expect(main.member[0]["@type"]).toContain("Physician");
  });

  it("is wrapped in the doctor-site design scope, with a skip link and one main landmark", () => {
    const { container } = renderPage();
    expect(container.querySelector(".doctor-site")).toBeTruthy();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveAttribute("href", "#main");
    expect(container.querySelectorAll("main#main")).toHaveLength(1);
  });

  it("keeps booking inside a stable wrapper that the action bar can observe", () => {
    const { container } = renderPage();
    const zone = container.querySelector("#booking-zone");
    expect(zone).toBeTruthy();
    expect(within(zone as HTMLElement).getByText("SECTION:booking")).toBeInTheDocument();
  });

  it("themes the loading and not-found states too", () => {
    ctx.value = base({ loading: true });
    const { container, rerender } = renderPage();
    expect(container.querySelector(".doctor-site")).toBeTruthy();
    ctx.value = base({ profile: null });
    rerender(<MemoryRouter><DoctorPublicPage /></MemoryRouter>);
    expect(container.querySelector(".doctor-site")).toBeTruthy();
  });
});
