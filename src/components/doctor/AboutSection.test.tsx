import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AboutSection from "./AboutSection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const mockData = (profile: Record<string, unknown>, settings: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({ profile, settings } as never);

const renderAbout = () => render(<MemoryRouter><AboutSection /></MemoryRouter>);

describe("AboutSection", () => {
  beforeEach(() => scroll.dsScrollTo.mockReset());

  it("never writes a bio on the doctor's behalf", () => {
    mockData({ full_name: "asha rao" });
    renderAbout();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Meet Dr. Asha Rao");
    expect(screen.queryByText(/compassion|evidence-based|patient-centered/i)).not.toBeInTheDocument();
  });

  it("shows the doctor's own bio and only the credentials that exist", () => {
    mockData({
      full_name: "Asha Rao",
      bio: "I have looked after children in Pune for twelve years.",
      specialization: "Pediatrician",
      qualifications: "mbbs, md",
      experience_years: 12,
      clinic_name: "Little Steps",
      city: "Pune",
    });
    renderAbout();
    expect(screen.getByText("I have looked after children in Pune for twelve years.")).toBeInTheDocument();
    const list = screen.getByText("Qualifications").closest("dl")!;
    expect(within(list).getByText("MBBS, MD")).toBeInTheDocument();
    expect(within(list).getByText("12 years in practice")).toBeInTheDocument();
    expect(within(list).getByText("Little Steps, Pune")).toBeInTheDocument();
    expect(within(list).queryByText("Registration no.")).not.toBeInTheDocument();
  });

  it("collapses a long bio behind an inline toggle", () => {
    mockData({ full_name: "Asha Rao", bio: "Long story. ".repeat(60) });
    renderAbout();
    const toggle = screen.getByRole("button", { name: "Read the full story" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("prefers the dedicated About photo and books in one tap", () => {
    mockData({ full_name: "Asha Rao", profile_photo_url: "https://x/profile.jpg" }, { about_photo_url: "https://x/about.jpg" });
    renderAbout();
    expect(screen.getByRole("img", { name: "Dr. Asha Rao" }).getAttribute("src")).toContain("about.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Book with Dr. Asha Rao" }));
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", expect.anything());
  });
});
