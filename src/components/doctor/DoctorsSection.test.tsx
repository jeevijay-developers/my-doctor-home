import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DoctorsSection from "./DoctorsSection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "General Physician", qualifications: "MBBS",
  experience_years: 10, bio: null, photo_url: null, registration_number: null, consultation_fee: null,
  slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0, ...over,
});
const DR_A = doc({});
const DR_B = doc({ id: "pb", display_name: "Dr. Vikram Shah", specialization: "Cardiologist", consultation_fee: 1200, experience_years: 1, is_primary: false });

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "doc-1", consultation_fee: 750 },
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_A, DR_B],
    isMultiDoctor: true,
    ...over,
  } as never);

describe("DoctorsSection", () => {
  beforeEach(() => scroll.dsScrollTo.mockReset());

  it("renders nothing for a single-doctor clinic", () => {
    mockData({ isMultiDoctor: false, practitioners: [DR_A], bookablePractitioners: [DR_A] });
    const { container } = render(<DoctorsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each doctor with specialty, qualifications, experience and fee under #doctors", () => {
    mockData();
    render(<DoctorsSection />);
    expect(document.getElementById("doctors")).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const a = within(cards[0]);
    expect(a.getByRole("heading", { name: "Dr. Asha Rao" })).toBeInTheDocument();
    expect(a.getByText("General Physician")).toBeInTheDocument();
    expect(a.getByText("MBBS")).toBeInTheDocument();
    expect(a.getByText("10 years in practice")).toBeInTheDocument();
    expect(a.getByText("₹750")).toBeInTheDocument(); // the clinic fee when the doctor has none
    const b = within(cards[1]);
    expect(b.getByRole("heading", { name: "Dr. Vikram Shah" })).toBeInTheDocument();
    expect(b.getByText("1 year in practice")).toBeInTheDocument();
    expect(b.getByText("₹1200")).toBeInTheDocument();
  });

  it("'Book' asks the booking widget for that doctor and scrolls to it", () => {
    mockData();
    const seen: unknown[] = [];
    const onSelect = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("doctylia:select-doctor", onSelect);
    render(<DoctorsSection />);
    fireEvent.click(screen.getByRole("button", { name: "Book with Dr. Vikram Shah" }));
    window.removeEventListener("doctylia:select-doctor", onSelect);
    expect(seen).toEqual([{ id: "pb" }]);
    expect(scroll.dsScrollTo).toHaveBeenCalled();
  });

  it("a doctor who cannot be booked online is shown without a Book button", () => {
    const off = doc({ id: "pc", display_name: "Meera Iyer", bookable: false, online_booking: false });
    mockData({ practitioners: [DR_A, DR_B, off] });
    render(<DoctorsSection />);
    expect(screen.getByRole("heading", { name: "Dr. Meera Iyer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book with Dr. Meera Iyer" })).not.toBeInTheDocument();
  });

  it("offers a specialty filter only from four doctors on", () => {
    mockData();
    const { unmount } = render(<DoctorsSection />);
    expect(screen.queryByRole("group", { name: "Filter by specialty" })).not.toBeInTheDocument();
    unmount();
    const four = [DR_A, DR_B, doc({ id: "pc", display_name: "C", specialization: "Cardiologist" }), doc({ id: "pd", display_name: "D", specialization: "Dermatologist" })];
    mockData({ practitioners: four, bookablePractitioners: four });
    render(<DoctorsSection />);
    const filter = within(screen.getByRole("group", { name: "Filter by specialty" }));
    expect(filter.getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "Cardiologist", "Dermatologist", "General Physician"]);
    fireEvent.click(filter.getByRole("button", { name: "Cardiologist" }));
    expect(filter.getByRole("button", { name: "Cardiologist" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows a doctor's own rating only when they have reviews", () => {
    mockData({ practitioners: [{ ...DR_A, review_count: 12, avg_rating: 4.64 }, { ...DR_B, review_count: 0, avg_rating: null }] });
    render(<DoctorsSection />);
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("★ 4.6")).toBeInTheDocument();
    expect(within(cards[0]).getByText("12 reviews")).toBeInTheDocument();
    expect(within(cards[1]).queryByText(/★/)).not.toBeInTheDocument();
    expect(within(cards[1]).queryByText(/review/i)).not.toBeInTheDocument();
  });

  it("says '1 review' in the singular", () => {
    mockData({ practitioners: [{ ...DR_A, review_count: 1, avg_rating: 5 }, DR_B] });
    render(<DoctorsSection />);
    expect(screen.getByText("1 review")).toBeInTheDocument();
  });
});
