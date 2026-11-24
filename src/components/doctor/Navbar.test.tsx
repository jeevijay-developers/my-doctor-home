import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Navbar from "./Navbar";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/scroll", () => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));

const mockData = (settings: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { full_name: "asha rao", specialization: "Pediatrician" },
    settings,
  } as never);

const renderNav = () =>
  render(
    <MemoryRouter initialEntries={["/dr/asha"]}>
      <Routes>
        <Route path="/dr/:slug" element={<Navbar />} />
      </Routes>
    </MemoryRouter>,
  );

const sectionLinks = () =>
  within(screen.getByRole("navigation", { name: "Sections" })).getAllByRole("button").map((b) => b.textContent);

describe("Navbar", () => {
  beforeEach(() => mockData());

  it("shows only About, Articles and Contact as section links (My appointment is separate)", () => {
    mockData({ show_gallery: true });
    renderNav();
    expect(sectionLinks()).toEqual(["About", "Articles", "Contact"]);
    expect(screen.getAllByRole("link", { name: /My appointment/ })[0]).toHaveAttribute("href", "/dr/asha/manage");
  });

  it("leaves out About and Articles when the doctor has switched them off, but always keeps Contact", () => {
    mockData({ show_about: false, show_blog: false });
    renderNav();
    expect(sectionLinks()).toEqual(["Contact"]);
  });

  it("names the doctor and keeps Book appointment and My appointment one tap away", () => {
    renderNav();
    expect(screen.getByText("Dr. Asha Rao")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Book appointment/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /My appointment/ })[0]).toHaveAttribute("href", "/dr/asha/manage");
  });

  it("has a theme toggle", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeInTheDocument();
  });
});
