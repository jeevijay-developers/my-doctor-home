import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

describe("DoctorsSection in a team clinic", () => {
  const team = (list: unknown[], over: Record<string, unknown> = {}) =>
    mockData({
      isTeamClinic: true,
      isMultiDoctor: false,
      profile: { id: "doc-1", slug: "little-steps", consultation_fee: 750, clinic_phone: "9876543210" },
      practitioners: list,
      bookablePractitioners: (list as { bookable: boolean }[]).filter((d) => d.bookable),
      ...over,
    });
  const renderTeam = (props: Record<string, unknown> = {}) =>
    render(<MemoryRouter><DoctorsSection {...props} /></MemoryRouter>);
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => doc({ id: `p${i}`, slug: `dr-${i}`, display_name: `Doctor Number${i}`, specialization: i % 2 ? "Cardiology" : "Dermatology", is_primary: i === 0 }));

  it("shows even when only one of two active doctors is bookable (isMultiDoctor false)", () => {
    const off = doc({ id: "pc", slug: "dr-c", display_name: "Meera Iyer", bookable: false });
    team([DR_A, off]);
    renderTeam();
    expect(screen.getByRole("heading", { name: "Meet our doctors" })).toBeInTheDocument();
    const offCard = screen.getAllByRole("listitem")[1];
    expect(within(offCard).queryByRole("button", { name: /Book with/ })).not.toBeInTheDocument();
    expect(within(offCard).getByRole("link", { name: /Call the clinic/ })).toHaveAttribute("href", "tel:+919876543210");
  });

  it("links each card to the doctor's own page with a real link", () => {
    team([DR_A, DR_B]);
    renderTeam();
    expect(screen.getByRole("link", { name: "View profile of Dr. Vikram Shah" })).toHaveAttribute("href", `/dr/little-steps/doctor/${DR_B.slug}`);
  });

  it("shows the bio as plain text, clamped to two lines", () => {
    team([{ ...DR_A, bio: "Treats <b>children</b>  with care" }, DR_B]);
    const { container } = renderTeam();
    const bio = screen.getByText("Treats <b>children</b> with care");
    expect(bio).toHaveClass("line-clamp-2");
    expect(container.querySelector("b")).toBeNull();
  });

  it("shows initials when a doctor has no photo", () => {
    team([DR_A, DR_B]);
    renderTeam();
    expect(within(screen.getAllByRole("listitem")[0]).getByText("AR")).toBeInTheDocument();
  });

  it("'Book' still hands the doctor to the booking widget", () => {
    team([DR_A, DR_B]);
    const seen: unknown[] = [];
    const onSelect = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("doctylia:select-doctor", onSelect);
    renderTeam();
    fireEvent.click(screen.getByRole("button", { name: "Book with Dr. Vikram Shah" }));
    window.removeEventListener("doctylia:select-doctor", onSelect);
    expect(seen).toEqual([{ id: "pb" }]);
  });

  it("filters by specialty from four doctors and searches by name only from nine", () => {
    team(many(8));
    const { unmount } = renderTeam();
    expect(screen.getByRole("group", { name: "Filter by specialty" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Search doctors by name")).not.toBeInTheDocument();
    unmount();
    team(many(9));
    renderTeam();
    const search = screen.getByLabelText("Search doctors by name");
    fireEvent.change(search, { target: { value: "number3" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No doctors match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all doctors" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
  });

  it("grid columns follow the number of doctors (1/2/3/4)", () => {
    team([DR_A, DR_B]);
    const { container, unmount } = renderTeam();
    expect(container.querySelector("ul")!.className).not.toContain("lg:grid-cols-3");
    unmount();
    team(many(9));
    const again = renderTeam();
    expect(again.container.querySelector("ul")!.className).toContain("xl:grid-cols-4");
  });

  it("renders the optional next-available slot a later phase will fill", () => {
    team([DR_A, DR_B]);
    renderTeam({ renderNextAvailable: (d: { id: string }) => <span>slot-{d.id}</span> });
    expect(screen.getByText("slot-pa")).toBeInTheDocument();
  });

  it("copes with a very long doctor name", () => {
    team([{ ...DR_A, display_name: "Venkata Subramanya Lakshmi Narasimha Rajagopalan Iyengar Krishnamurthy" }, DR_B]);
    renderTeam();
    expect(screen.getByRole("heading", { name: /Rajagopalan/ })).toHaveClass("break-words");
  });
});
