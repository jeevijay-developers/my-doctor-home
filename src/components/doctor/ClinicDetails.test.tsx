import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ClinicDetails from "./ClinicDetails";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const near = vi.hoisted(() => ({ value: false }));
vi.mock("./ui/useDwellInView", () => ({ useDwellInView: () => [{ current: null }, near.value] }));

const hours = (d: number, over: Record<string, unknown> = {}) => ({
  day_of_week: d, is_open: true, start_time: "09:00:00", end_time: "13:00:00", start_time_2: "17:00:00", end_time_2: "20:00:00", ...over,
});
const week = [hours(0, { is_open: false }), ...[1, 2, 3, 4, 5].map((d) => hours(d)), hours(6, { start_time_2: null, end_time_2: null })];

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { clinic_name: "Little Steps", address: "Plot 4", city: "Pune", phone: "9876543210", clinic_email: "hi@clinic.test" },
    workingHours: week,
    settings: { whatsapp_number: "9876543210" },
    ...over,
  } as never);

describe("ClinicDetails", () => {
  beforeEach(() => {
    near.value = false;
    mockData();
  });

  it("shows the clinic, how to reach it, and each session on its own line", () => {
    render(<ClinicDetails />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Little Steps");
    expect(screen.getByRole("link", { name: /Call 9876543210/ })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/919876543210");
    expect(screen.getByRole("link", { name: /hi@clinic.test/ })).toHaveAttribute("href", "mailto:hi@clinic.test");
    expect(screen.getByText("Closed")).toBeInTheDocument();
    // Mon-Fri share a schedule: two sessions in one row, stacked rather than wrapped mid-time.
    const weekdays = screen.getAllByText("9:00 AM – 1:00 PM")[0].closest("div")!;
    expect(within(weekdays).getByText("5:00 PM – 8:00 PM")).toBeInTheDocument();
    expect(within(weekdays).getByText(/Mon/)).toBeInTheDocument();
  });

  it("loads the map only once the patient has stopped to look at it", () => {
    const { rerender } = render(<ClinicDetails />);
    expect(screen.queryByTitle(/Map showing/)).not.toBeInTheDocument();
    near.value = true;
    rerender(<ClinicDetails />);
    expect(screen.getByTitle("Map showing Little Steps")).toBeInTheDocument();
  });

  it("omits contact actions the clinic has not provided", () => {
    mockData({ profile: { clinic_name: "Little Steps", address: "Plot 4" }, settings: {} });
    render(<ClinicDetails />);
    expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("renders nothing when the clinic has no details at all", () => {
    mockData({ profile: {}, workingHours: [], settings: {} });
    const { container } = render(<ClinicDetails />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClinicDetails in a team clinic", () => {
  const docs = [
    { id: "pa", display_name: "Asha Rao" },
    { id: "pb", display_name: "Dr. Vikram Shah" },
  ];
  const row = (pid: string, d: number, over: Record<string, unknown> = {}) => ({ ...hours(d, { start_time_2: null, end_time_2: null, ...over }), practitioner_id: pid });
  const mockTeam = (rawWorkingHours: unknown[]) =>
    mockData({ isTeamClinic: true, practitioners: docs, rawWorkingHours });

  it("labels the union 'Clinic hours' and lists each doctor's own week under 'Hours by doctor'", () => {
    mockTeam([row("pa", 1, { start_time: "09:00:00", end_time: "12:00:00" }), row("pa", 2, { start_time: "09:00:00", end_time: "12:00:00" }), row("pb", 1, { start_time: "15:00:00", end_time: "18:00:00" })]);
    render(<ClinicDetails />);
    expect(screen.getByRole("heading", { name: "Clinic hours" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hours by doctor" })).toBeInTheDocument();
    const asha = within(screen.getByRole("region", { name: "Hours of Dr. Asha Rao" }));
    expect(asha.getByText("9:00 AM – 12:00 PM")).toBeInTheDocument();
    const vikram = within(screen.getByRole("region", { name: "Hours of Dr. Vikram Shah" }));
    expect(vikram.getByText("3:00 PM – 6:00 PM")).toBeInTheDocument();
    expect(vikram.queryByText("9:00 AM – 12:00 PM")).not.toBeInTheDocument();
  });

  it("says so when a doctor has no hours set", () => {
    mockTeam([row("pa", 1)]);
    render(<ClinicDetails />);
    expect(within(screen.getByRole("region", { name: "Hours of Dr. Vikram Shah" })).getByText(/Hours not set/)).toBeInTheDocument();
  });

  it("collapses the per-doctor table behind a toggle on phones", () => {
    mockTeam([row("pa", 1)]);
    render(<ClinicDetails />);
    const toggle = screen.getByRole("button", { name: "Show each doctor's hours" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveClass("hidden", "md:block");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).not.toHaveClass("hidden");
  });

  it("single-doctor clinics are unchanged: 'Hours', no per-doctor table", () => {
    mockData();
    render(<ClinicDetails />);
    expect(screen.getByRole("heading", { name: "Hours" })).toBeInTheDocument();
    expect(screen.queryByText("Hours by doctor")).not.toBeInTheDocument();
  });
});
