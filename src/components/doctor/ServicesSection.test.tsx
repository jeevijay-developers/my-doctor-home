import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ServicesSection from "./ServicesSection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const service = (over: Record<string, unknown> = {}) => ({
  id: "service-1",
  name: "General Consultation",
  description: "A thorough consultation for ongoing care and treatment planning. ".repeat(4),
  price: 500,
  type: "clinic",
  duration: 30,
  active: true,
  sort_order: 0,
  ...over,
});

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    services: [service()],
    profile: { consultation_fee: 400 },
    settings: {},
    hasFeature: () => false,
    ...over,
  } as never);

const renderSection = () => render(<MemoryRouter><ServicesSection /></MemoryRouter>);

describe("ServicesSection", () => {
  beforeEach(() => scroll.dsScrollTo.mockReset());

  it("shows each service's name, visit type, duration and price", () => {
    mockData();
    renderSection();
    const row = screen.getByRole("heading", { name: "General Consultation" }).closest("li")!;
    expect(within(row).getByText("At the clinic")).toBeInTheDocument();
    expect(within(row).getByText("30 min")).toBeInTheDocument();
    expect(within(row).getByText("₹500")).toBeInTheDocument();
  });

  it("uses the consultation fee when a service has no price, and invents nothing when neither exists", () => {
    mockData({ services: [service({ price: 0 })] });
    const { unmount } = renderSection();
    expect(screen.getByText("₹400")).toBeInTheDocument();
    unmount();

    mockData({ services: [service({ price: null })], profile: {} });
    renderSection();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });

  it("Book preselects the service in the booking widget and scrolls there in one tap", () => {
    mockData();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Book General Consultation" }));
    const event = dispatchSpy.mock.calls.map(([e]) => e).find((e) => e.type === "doctylia:select-service") as CustomEvent;
    expect(event.detail).toMatchObject({ id: "service-1", type: "clinic" });
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", expect.anything());
    dispatchSpy.mockRestore();
  });

  it("expands a long description inline (no dialog)", () => {
    mockData();
    renderSection();
    const toggle = screen.getByRole("button", { name: "Read more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows six services, then reveals the rest on request", () => {
    mockData({ services: Array.from({ length: 8 }, (_, i) => service({ id: `s${i}`, name: `Service ${i + 1}` })) });
    renderSection();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: /show all 8 services/i }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("adds an online consultation row only when the doctor offers it", () => {
    mockData({ settings: { show_online_consultation: true, online_fee: 600, online_duration: 20 }, hasFeature: () => true });
    renderSection();
    const row = screen.getByRole("heading", { name: "Online consultation" }).closest("li")!;
    expect(within(row).getByText("₹600")).toBeInTheDocument();
    expect(within(row).getByText("20 min")).toBeInTheDocument();
  });

  it("does not list an online-only service the plan cannot book", () => {
    mockData({ services: [service(), service({ id: "s2", name: "Video follow-up", type: "online" })], hasFeature: () => false });
    renderSection();
    expect(screen.getByRole("heading", { name: "General Consultation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Video follow-up" })).not.toBeInTheDocument();
  });

  it("lists it when online consultation is on the plan", () => {
    mockData({ services: [service({ id: "s2", name: "Video follow-up", type: "online" })], hasFeature: () => true });
    renderSection();
    expect(screen.getByRole("heading", { name: "Video follow-up" })).toBeInTheDocument();
  });

  it("with no services of its own, still offers the plain consultation the booking widget sells (real fee and slot length, nothing invented)", () => {
    mockData({ services: [], profile: { consultation_fee: 600 }, settings: { slot_duration_minutes: 20 } });
    renderSection();
    const row = screen.getByRole("heading", { name: "Clinic consultation" }).closest("li")!;
    expect(within(row).getByText("₹600")).toBeInTheDocument();
    expect(within(row).getByText("20 min")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Book/ }));
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", expect.anything());
  });

  it("leaves the price and length out when the doctor has not set them, rather than guessing", () => {
    mockData({ services: [], profile: {}, settings: {} });
    renderSection();
    const row = screen.getByRole("heading", { name: "Clinic consultation" }).closest("li")!;
    expect(within(row).queryByText(/₹/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/min/)).not.toBeInTheDocument();
  });
});
