import "../__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroBanner from "../HeroBanner";
import { useDoctorData } from "@/contexts/DoctorContext";
import { HERO_IMAGE_WIDTH, optimizedImageUrl } from "@/lib/seo/imageUrl";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("../motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("../motion/scroll", () => scroll);
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const doc = (id: string, over: Record<string, unknown> = {}) => ({
  id, display_name: `Dr. ${id}`, slug: id, specialization: "Cardiology", qualifications: "MBBS", experience_years: 5,
  bio: null, photo_url: null, registration_number: null, consultation_fee: null, slot_duration_minutes: null,
  online_booking: true, bookable: true, is_primary: false, is_owner: false, sort_order: 0, directory_listed: true,
  review_count: 0, avg_rating: null, ...over,
});

const mockTeam = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "c1", full_name: "asha rao", specialization: "Pediatrician", city: "Pune", clinic_name: "Little Steps Clinic", registration_number: "OWNER-REG-1", qualifications: "OWNER-QUAL", experience_years: 30, phone: "9876543210" },
    settings: {},
    reviews: [{ rating: 5 }, { rating: 4 }],
    workingHours: [],
    practitioners: [doc("a", { specialization: "Cardiology", experience_years: 12 }), doc("b", { specialization: "Dermatology", experience_years: 21 })],
    isTeamClinic: true,
    ...over,
  } as never);

const renderHero = () => render(<MemoryRouter><HeroBanner /></MemoryRouter>);

describe("HeroBanner for a team clinic", () => {
  beforeEach(() => {
    scroll.dsScrollTo.mockReset();
    rpc.mockReset();
  });

  it("is led by the clinic name, never the owner's name or credentials", () => {
    mockTeam();
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Little Steps Clinic");
    expect(screen.queryByText(/Dr\. Asha Rao/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OWNER-REG-1|OWNER-QUAL/)).not.toBeInTheDocument();
    expect(screen.queryByText("30 yrs")).not.toBeInTheDocument();
  });

  it("shows clinic-level facts: doctor count, longest experience, rating, specialties", () => {
    mockTeam();
    renderHero();
    const facts = within(screen.getByLabelText("Clinic at a glance"));
    expect(facts.getByText("Doctors").nextSibling).toHaveTextContent("2");
    expect(facts.getByText("21 yrs")).toBeInTheDocument();
    expect(facts.getByText("4.5")).toBeInTheDocument();
    expect(facts.getByText("Specialties").nextSibling).toHaveTextContent("2");
  });

  it("names the specialties (up to three, then 'and more') and the city", () => {
    mockTeam({ practitioners: ["Cardiology", "ENT", "Skin", "Dental"].map((s, i) => doc(`d${i}`, { specialization: s })) });
    renderHero();
    expect(screen.getAllByText(/Cardiology, ENT, Skin and more/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pune/).length).toBeGreaterThan(0);
  });

  it("offers Book appointment and Meet our doctors (scrolls to #doctors)", () => {
    mockTeam();
    renderHero();
    expect(screen.getByRole("button", { name: /book appointment/i })).toBeInTheDocument();
    const meet = screen.getByRole("link", { name: /meet our doctors/i });
    expect(meet).toHaveAttribute("href", "#doctors");
    fireEvent.click(meet);
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("doctors");
  });

  it("never looks up a next free slot", () => {
    mockTeam();
    renderHero();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses hero_photo_url at the exact preloaded size, with high priority, when set", () => {
    mockTeam({ settings: { hero_photo_url: "https://x.supabase.co/storage/v1/object/public/doctor-uploads/c1/hero.jpg" } });
    const { container } = renderHero();
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(optimizedImageUrl("https://x.supabase.co/storage/v1/object/public/doctor-uploads/c1/hero.jpg", HERO_IMAGE_WIDTH));
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(screen.queryByTestId("team-collage")).not.toBeInTheDocument();
  });

  it("without a hero photo shows a collage of at most four doctors, photos first, initials otherwise", () => {
    const list = [doc("a"), doc("b", { photo_url: "https://x/b.jpg" }), doc("c"), doc("d"), doc("e")];
    mockTeam({ practitioners: list });
    renderHero();
    const items = within(screen.getByTestId("team-collage")).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByRole("img", { name: "Dr. b" })).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Dr. a");
    expect(within(items[1]).getByText("(no photo)")).toBeInTheDocument();
  });

  it("falls back to the owner's name without doubling Dr. when there is no clinic name", () => {
    mockTeam({ profile: { id: "c1", full_name: "Dr. Asha Rao", city: "Pune" } });
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dr. Asha Rao's clinic");
  });

  it("handles a very long clinic name without losing it", () => {
    const long = "The Very Long Named Multispeciality Family Health and Wellness Centre of Greater Pune";
    mockTeam({ profile: { id: "c1", clinic_name: long, city: "Pune" } });
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(long);
  });

  it("a non-team clinic keeps the single-doctor hero", () => {
    mockTeam({ isTeamClinic: false, isMultiDoctor: false });
    renderHero();
    expect(screen.queryByRole("link", { name: /meet our doctors/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/asha rao/i);
  });
});
