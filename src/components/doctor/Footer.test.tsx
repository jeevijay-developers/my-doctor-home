import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Footer from "./Footer";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const profile = {
  id: "d1",
  slug: "asha",
  full_name: "asha rao",
  specialization: "Pediatrician",
  clinic_name: "Little Steps",
  city: "Pune",
  phone: "9876543210",
  profile_photo_url: null,
};

const mockContext = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({ profile, settings: {}, services: [{ id: "s1", name: "Check-up" }], gallery: [], ...over } as never);

const renderAt = (path: string, props: { profileOverride?: never } = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dr/:slug/*" element={<Footer {...props} />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Footer", () => {
  beforeEach(() => {
    scroll.dsScrollTo.mockReset();
    mockContext();
  });

  it("names the doctor and offers booking and a dialable phone number", () => {
    renderAt("/dr/asha");
    expect(screen.getByText("Book a visit with Dr. Asha Rao.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call 9876543210/ })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("on the home page, section links scroll instead of navigating", () => {
    renderAt("/dr/asha");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Explore" })).getByRole("link", { name: "Services" }));
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("services", expect.anything());
  });

  it("on other pages, section links point back to the home page section", () => {
    renderAt("/dr/asha/blog");
    const link = within(screen.getByRole("navigation", { name: "Explore" })).getByRole("link", { name: "Services" });
    expect(link).toHaveAttribute("href", "/dr/asha#services");
    fireEvent.click(link);
    expect(scroll.dsScrollTo).not.toHaveBeenCalled();
  });

  it("on other pages, Book appointment navigates inside the app instead of reloading it", () => {
    render(
      <MemoryRouter initialEntries={["/dr/asha/blog"]}>
        <Routes>
          <Route path="/dr/:slug/blog" element={<Footer />} />
          <Route path="/dr/:slug" element={<p>doctor home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: /Book appointment/ }));
    expect(screen.getByText("doctor home")).toBeInTheDocument();
  });

  it("uses the profile passed by the blog pages and hides the sections it knows nothing about", () => {
    mockContext({ profile: null, services: [] });
    const blogDoctor = { ...profile, full_name: "Neha Iyer", clinic_email: "hello@clinic.test" } as never;
    render(
      <MemoryRouter initialEntries={["/dr/asha/blog"]}>
        <Routes>
          <Route path="/dr/:slug/*" element={<Footer profileOverride={blogDoctor} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Book a visit with Dr. Neha Iyer.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /hello@clinic.test/ })).toHaveAttribute("href", "mailto:hello@clinic.test");
    expect(screen.getByRole("link", { name: "Health articles" })).toHaveAttribute("href", "/dr/asha/blog");
  });

  it("only links social profiles the doctor has added", () => {
    renderAt("/dr/asha");
    expect(screen.queryByRole("list", { name: "Social media" })).not.toBeInTheDocument();
    mockContext({ settings: { social_instagram: "https://instagram.com/asha" } });
    renderAt("/dr/asha");
    expect(screen.getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", "https://instagram.com/asha");
  });
});

describe("Footer in a team clinic", () => {
  beforeEach(() => {
    scroll.dsScrollTo.mockReset();
    mockContext({ isTeamClinic: true, practitioners: [{ specialization: "Cardiology" }, { specialization: "ENT" }] });
  });

  it("is signed by the clinic, not the owner", () => {
    renderAt("/dr/asha");
    expect(screen.getByText("Book a visit at Little Steps.")).toBeInTheDocument();
    expect(screen.queryByText(/Dr\. Asha Rao/)).not.toBeInTheDocument();
    expect(screen.getByText(/© \d{4} Little Steps/)).toBeInTheDocument();
    expect(screen.getByText(/Cardiology, ENT/)).toBeInTheDocument();
  });

  it("adds a Doctors quick link that scrolls on the home page", () => {
    renderAt("/dr/asha");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Explore" })).getByRole("link", { name: "Doctors" }));
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("doctors", expect.anything());
  });

  it("single-doctor clinics have no Doctors link", () => {
    mockContext();
    renderAt("/dr/asha");
    expect(within(screen.getByRole("navigation", { name: "Explore" })).queryByRole("link", { name: "Doctors" })).not.toBeInTheDocument();
  });
});
