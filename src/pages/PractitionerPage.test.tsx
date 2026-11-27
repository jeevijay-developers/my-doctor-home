import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PractitionerPage from "./PractitionerPage";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({
  DoctorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDoctorData: vi.fn(),
}));
vi.mock("@/components/doctor/BookingWidget", () => ({ default: () => <div data-testid="booking-widget" /> }));
vi.mock("@/components/doctor/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/doctor/DoctorThemeProvider", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const hour = (practitioner_id: string, day: number, start: string, end: string) => ({
  day_of_week: day, is_open: true, start_time: start, end_time: end, start_time_2: null, end_time_2: null, practitioner_id,
});
const doc = (over: Record<string, unknown>) => ({
  id: "pa", display_name: "Asha Rao", slug: "asha-rao", specialization: "General Physician", qualifications: "MBBS",
  experience_years: 10, bio: "Asha has treated families for a decade.", photo_url: null, registration_number: "REG-1",
  consultation_fee: null, slot_duration_minutes: null, online_booking: true, bookable: true, is_primary: true, sort_order: 0, ...over,
});
const DR_A = doc({});
const DR_B = doc({ id: "pb", display_name: "Vikram Shah", slug: "vikram-shah", specialization: "Cardiologist", consultation_fee: 1200, is_primary: false });

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "c1", slug: "dr-a", full_name: "Asha Rao", city: "Kota", consultation_fee: 750, plan_status: "active" },
    practitioners: [DR_A, DR_B],
    bookablePractitioners: [DR_A, DR_B],
    allWorkingHours: [hour("pa", 1, "09:00:00", "13:00:00"), hour("pb", 2, "15:00:00", "18:00:00")],
    isMultiDoctor: true,
    loading: false,
    ...over,
  } as never);

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dr/:slug/doctor/:doctorSlug" element={<PractitionerPage />} />
        <Route path="/dr/:slug" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe("PractitionerPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the doctor's own profile, fee and hours, and sets the document title", () => {
    mockData();
    renderAt("/dr/dr-a/doctor/vikram-shah");
    expect(screen.getByRole("heading", { level: 1, name: "Dr. Vikram Shah" })).toBeInTheDocument();
    expect(screen.getByText("Cardiologist")).toBeInTheDocument();
    expect(screen.getByText("₹1200")).toBeInTheDocument();
    // only this doctor's hours: Tuesday afternoon, not Dr. Asha's Monday morning
    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.queryByText("Monday")).not.toBeInTheDocument();
    expect(document.title).toContain("Dr. Vikram Shah");
    expect(screen.getByTestId("booking-widget")).toBeInTheDocument();
  });

  it("renders a hostile bio as plain text, never as markup", () => {
    const bio = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> **bold**`;
    mockData({ practitioners: [DR_A, { ...DR_B, bio }], bookablePractitioners: [DR_A, { ...DR_B, bio }] });
    const { container } = renderAt("/dr/dr-a/doctor/vikram-shah");
    expect(screen.getByText(bio.trim())).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
    // Only the page's own JSON-LD script may exist; the bio opened none.
    expect(Array.from(container.querySelectorAll("script")).every((s) => s.type === "application/ld+json")).toBe(true);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("falls back to the clinic fee when the doctor has none", () => {
    mockData();
    renderAt("/dr/dr-a/doctor/asha-rao");
    expect(screen.getByText("₹750")).toBeInTheDocument();
  });

  it("dispatches doctylia:select-doctor once on mount", () => {
    mockData();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("doctylia:select-doctor", on);
    renderAt("/dr/dr-a/doctor/vikram-shah");
    window.removeEventListener("doctylia:select-doctor", on);
    expect(seen).toEqual([{ id: "pb" }]);
  });

  it("redirects an unknown doctor to the clinic page", () => {
    mockData();
    renderAt("/dr/dr-a/doctor/nobody");
    expect(screen.getByTestId("where")).toHaveTextContent("/dr/dr-a");
  });

  it("shows a note instead of the widget for a doctor who is not bookable online", () => {
    mockData({ practitioners: [DR_A, { ...DR_B, bookable: false }] });
    renderAt("/dr/dr-a/doctor/vikram-shah");
    expect(screen.queryByTestId("booking-widget")).not.toBeInTheDocument();
    expect(screen.getByText(/Online booking is not open/)).toBeInTheDocument();
  });

  it("shows a non-bookable doctor's own hours from the full per-doctor set, not the bookable-only hours", () => {
    mockData({
      bookablePractitioners: [DR_B],
      soleBookable: DR_B,
      isMultiDoctor: false,
      allWorkingHours: [hour("pb", 2, "15:00:00", "18:00:00")],
      rawWorkingHours: [hour("pa", 1, "09:00:00", "13:00:00"), hour("pb", 2, "15:00:00", "18:00:00")],
    });
    renderAt("/dr/dr-a/doctor/asha-rao");
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.queryByText("Tuesday")).not.toBeInTheDocument();
  });

  it("preselects the sole bookable doctor of a clinic of several", () => {
    mockData({ bookablePractitioners: [DR_B], soleBookable: DR_B, isMultiDoctor: false });
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener("doctylia:select-doctor", on);
    renderAt("/dr/dr-a/doctor/vikram-shah");
    window.removeEventListener("doctylia:select-doctor", on);
    expect(seen).toEqual([{ id: "pb" }]);
  });

  it("shows the doctor's own rating and only their own visible reviews", () => {
    const rev = (id: string, practitioner_id: string | null, text: string) => ({
      id, practitioner_id, patient_name: "P " + id, rating: 5, review_text: text, created_at: "2026-10-01T10:00:00Z",
    });
    mockData({
      practitioners: [DR_A, { ...DR_B, review_count: 2, avg_rating: 4.5 }],
      reviews: [rev("1", "pb", "Great with my father"), rev("2", "pa", "Asha was kind"), rev("3", null, "Lovely clinic")],
    });
    renderAt("/dr/dr-a/doctor/vikram-shah");
    expect(screen.getByText("★ 4.5")).toBeInTheDocument();
    expect(screen.getAllByText("2 reviews").length).toBeGreaterThan(0);
    expect(screen.getByText(/Great with my father/)).toBeInTheDocument();
    expect(screen.queryByText(/Asha was kind/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lovely clinic/)).not.toBeInTheDocument();
  });

  it("shows no rating for a doctor without reviews", () => {
    mockData();
    renderAt("/dr/dr-a/doctor/vikram-shah");
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reviews?$/)).not.toBeInTheDocument();
  });
});
