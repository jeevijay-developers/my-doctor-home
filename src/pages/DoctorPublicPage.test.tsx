import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
vi.mock("@/components/doctor/SectionCard", () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/landing/AnimatedSection", () => ({ default: ({ children }: any) => <>{children}</> }));

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
    for (const s of ["navbar", "hero", "services", "about", "booking", "reviews", "clinic", "query", "footer"]) {
      expect(screen.getByText(`SECTION:${s}`)).toBeInTheDocument();
    }
    // opt-in sections are off by default
    expect(screen.queryByText("SECTION:gallery")).not.toBeInTheDocument();
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

  it("hides services when there are none, and gallery when it is on but empty", () => {
    ctx.value = base({ services: [], settings: { show_gallery: true }, gallery: [] });
    renderPage();
    expect(screen.queryByText("SECTION:services")).not.toBeInTheDocument();
    expect(screen.queryByText("SECTION:gallery")).not.toBeInTheDocument();
  });

  it("sets the document title and a canonical link for the doctor, and restores the title on unmount", () => {
    document.title = "Before";
    const { unmount } = renderPage();
    expect(document.title).toContain("Asha Rao");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toContain("/dr/asha");
    unmount();
    expect(document.title).toBe("Before");
  });

  it("emits JSON-LD structured data for the doctor", () => {
    const { container } = renderPage();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).toBeTruthy();
    expect(ld!.innerHTML).toContain("Asha Rao");
  });
});
