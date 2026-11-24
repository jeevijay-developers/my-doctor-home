import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroBanner from "./HeroBanner";
import BottomActionBar from "./BottomActionBar";
import { useDoctorData } from "@/contexts/DoctorContext";
import { optimizedImageUrl, HERO_IMAGE_WIDTH } from "@/lib/seo/imageUrl";
import { SELECT_SLOT_EVENT } from "@/lib/doctorSite/nextAvailable";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

const openAllWeek = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day_of_week: d, is_open: true, start_time: "00:00:00", end_time: "23:59:00", start_time_2: null, end_time_2: null,
}));

// What the database pre-fills for every doctor (see doctorFacts.PLATFORM_DEFAULT_CLAIMS).
const platformDefaults = {
  hero_headline_line1: "Trusted Care for",
  hero_headline_line2: "You & Your Family",
  hero_stat_text: "5,000+ Patient Consultations",
  seo_keywords: JSON.stringify([{ id: "patients", label: "Patients Treated", value: "5,000+", active: true }]),
};

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "doc-1", full_name: "asha rao", specialization: "Pediatrician", city: "Pune", phone: "9876543210" },
    settings: { ...platformDefaults },
    reviews: [],
    workingHours: openAllWeek,
    services: [],
    gallery: [],
    ...over,
  } as never);

const renderHero = () => render(<MemoryRouter><HeroBanner /></MemoryRouter>);

describe("HeroBanner", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
    scroll.dsScrollTo.mockReset();
  });

  it("shows no invented trust claims for a sparse profile", () => {
    mockData();
    renderHero();
    // Platform-default headline/tagline are replaced by the doctor's own name and facts.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dr. Asha Rao");
    expect(screen.queryByText(/Trusted Care for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Compassionate, personalized/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pediatrician in Pune\./)).toBeInTheDocument();
    expect(screen.queryByText(/5,000\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/yrs/)).not.toBeInTheDocument();
  });

  it("shows real facts only when the doctor has them", () => {
    mockData({
      profile: { id: "doc-1", full_name: "Asha Rao", experience_years: 12, qualifications: "mbbs, md" },
      reviews: [{ rating: 5 }, { rating: 4 }],
    });
    renderHero();
    // Facts are <dd>s; their digits count up in their own span, so compare the whole value.
    const facts = screen.getAllByRole("definition").map((dd) => dd.textContent?.replace("Rated ", ""));
    expect(facts).toContain("12 yrs"); // exactly what the doctor entered, no "+" added
    expect(facts).toContain("4.5");
    expect(screen.getByText("2 reviews")).toBeInTheDocument();
    expect(screen.getByText("MBBS, MD")).toBeInTheDocument();
  });

  it("renders the exact hero image URL the Edge function preloads", () => {
    const heroUrl = "https://example.supabase.co/storage/v1/object/public/photos/hero.jpg";
    mockData({ settings: { ...platformDefaults, hero_photo_url: heroUrl } });
    renderHero();
    const images = screen.getAllByRole("img", { name: /portrait/i });
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", optimizedImageUrl(heroUrl, HERO_IMAGE_WIDTH));
    expect(images[0]).toHaveAttribute("fetchpriority", "high");
  });

  it("uses the doctor's own headline when they wrote one", () => {
    mockData({ settings: { hero_headline_line1: "Gentle care for", hero_headline_line2: "growing children" } });
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Gentle care for growing children");
  });

  it("shows a clinic card instead of an empty frame when there is no photo", () => {
    mockData({ profile: { id: "doc-1", full_name: "Asha Rao", clinic_name: "Little Steps Clinic", address: "Plot 4", city: "Pune" } });
    renderHero();
    expect(screen.getByText("Little Steps Clinic")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /get directions/i })).toBeInTheDocument();
  });

  it("quick-book dispatches the chosen slot and scrolls to booking", async () => {
    mockData();
    const listener = vi.fn();
    window.addEventListener(SELECT_SLOT_EVENT, listener);
    renderHero();
    const button = await screen.findByRole("button", { name: /book this slot/i }, { timeout: 3000 });
    await act(async () => fireEvent.click(button));
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ type: "clinic", time: expect.stringMatching(/^\d{2}:\d{2}$/) });
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", expect.anything());
    window.removeEventListener(SELECT_SLOT_EVENT, listener);
  });

  it("still offers a one-tap booking action when no slot is free", async () => {
    mockData({ workingHours: [] });
    renderHero();
    const button = await screen.findByRole("button", { name: /choose a time/i });
    fireEvent.click(button);
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", expect.anything());
  });

  it("falls back to the older two-argument slot RPC when the new one is missing", async () => {
    mockData();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } }).mockResolvedValue({ data: [], error: null });
    renderHero();
    await screen.findByRole("button", { name: /book this slot/i }, { timeout: 3000 });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("get_slot_counts", expect.not.objectContaining({ _appointment_type: expect.anything() })));
  });
});

describe("BottomActionBar", () => {
  it("offers Book, Call and WhatsApp when the clinic has both contacts", () => {
    mockData({ settings: { whatsapp_number: "9876543210" } });
    render(<MemoryRouter><BottomActionBar /></MemoryRouter>);
    expect(screen.getAllByRole("button", { name: /book appointment/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /^call$/i })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: /^whatsapp$/i })).toHaveAttribute("href", "https://wa.me/919876543210");
  });

  it("omits contact actions the clinic has not configured", () => {
    mockData({ profile: { id: "doc-1", full_name: "Asha Rao" }, settings: {} });
    render(<MemoryRouter><BottomActionBar /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: /call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
  });
});
