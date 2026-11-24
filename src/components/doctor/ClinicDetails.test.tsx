import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
