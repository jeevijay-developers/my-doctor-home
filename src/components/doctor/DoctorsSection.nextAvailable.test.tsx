import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DoctorsSection from "./DoctorsSection";
import { useDoctorData } from "@/contexts/DoctorContext";
import { useNextAvailableByDoctor } from "@/hooks/useNextAvailableByDoctor";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("@/hooks/useNextAvailableByDoctor", () => ({ useNextAvailableByDoctor: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
vi.mock("./motion/scroll", () => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));

const NOW = new Date("2026-11-28T04:30:00Z"); // 10:00 IST on the 28th
const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "General Physician", qualifications: "MBBS",
  experience_years: 10, bio: null, photo_url: null, registration_number: null, consultation_fee: null,
  slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0, ...over,
});

const setup = (list: any[], next: Record<string, unknown>, over: Record<string, unknown> = {}) => {
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "doc-1", slug: "asha", consultation_fee: 750 },
    practitioners: list,
    bookablePractitioners: list.filter((d) => d.bookable),
    isMultiDoctor: true,
    isTeamClinic: true,
    ...over,
  } as never);
  vi.mocked(useNextAvailableByDoctor).mockReturnValue({ next, now: NOW } as never);
};
const renderIt = () => render(<MemoryRouter><DoctorsSection /></MemoryRouter>);

describe("DoctorsSection next available", () => {
  beforeEach(() => vi.mocked(useNextAvailableByDoctor).mockReset());

  it("shows 'Next: …' on bookable doctors only, using the doctor's own slot", () => {
    const a = doc({});
    const b = doc({ id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", is_primary: false });
    const off = doc({ id: "pc", display_name: "Meera Iyer", slug: "meera-iyer", bookable: false, online_booking: false, is_primary: false });
    setup([a, b, off], {
      pa: { date: "2026-11-28", time: "16:30:00" },
      pb: { date: "2026-11-29", time: "10:00:00" },
      pc: { date: "2026-11-28", time: "11:00:00" }, // never shown: not bookable
    });
    renderIt();
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Next: Today 4:30 pm")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Next: Tomorrow 10:00 am")).toBeInTheDocument();
    expect(within(cards[2]).queryByText(/Next:/)).not.toBeInTheDocument();
  });

  it("shows nothing for a doctor with no free slot, or before the answer arrives, and no empty wrapper stays visible", () => {
    const a = doc({});
    const b = doc({ id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", is_primary: false });
    setup([a, b], { pb: null });
    renderIt();
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
  });

  it("hides a stale slot that has already started", () => {
    setup([doc({}), doc({ id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", is_primary: false })], {
      pa: { date: "2026-11-28", time: "09:00:00" },
    });
    renderIt();
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
  });

  it("asks the hook once for the whole list, however many doctors (9+)", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      doc({ id: `p${i}`, display_name: `Doctor ${i}`, slug: `doctor-${i}`, is_primary: i === 0, sort_order: i }));
    const next = Object.fromEntries(many.map((d, i) => [d.id, { date: "2026-11-29", time: `${String(9 + (i % 5)).padStart(2, "0")}:00:00` }]));
    setup(many, next);
    renderIt();
    expect(screen.getAllByText(/^Next: Tomorrow/)).toHaveLength(10);
    expect(vi.mocked(useNextAvailableByDoctor)).toHaveBeenCalled();
    expect(vi.mocked(useNextAvailableByDoctor).mock.calls.every((c) => c[0] === "doc-1")).toBe(true);
  });

  it("is only enabled when a bookable doctor is shown (no fetch for a clinic with none)", () => {
    const off = doc({ bookable: false, online_booking: false });
    setup([off, doc({ id: "pb", slug: "b", display_name: "B", bookable: false, is_primary: false })], {});
    renderIt();
    expect(vi.mocked(useNextAvailableByDoctor).mock.calls.every((c) => c[1] === false)).toBe(true);
  });

  it("midnight rollover: the same slot reads 'Today' once IST midnight passes", () => {
    const a = doc({});
    vi.mocked(useDoctorData).mockReturnValue({
      profile: { id: "doc-1", slug: "asha" }, practitioners: [a, doc({ id: "pb", display_name: "B", slug: "b", is_primary: false })],
      bookablePractitioners: [a], isMultiDoctor: true, isTeamClinic: true,
    } as never);
    const slot = { pa: { date: "2026-11-29", time: "09:00:00" } };
    vi.mocked(useNextAvailableByDoctor).mockReturnValue({ next: slot, now: new Date("2026-11-28T18:29:00Z") } as never);
    const { unmount } = renderIt();
    expect(screen.getByText("Next: Tomorrow 9:00 am")).toBeInTheDocument();
    unmount();
    vi.mocked(useNextAvailableByDoctor).mockReturnValue({ next: slot, now: new Date("2026-11-28T18:31:00Z") } as never);
    renderIt();
    expect(screen.getByText("Next: Today 9:00 am")).toBeInTheDocument();
  });
});
