import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import ServicesSection from "./ServicesSection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("@/hooks/useIsDesktop", () => ({ useIsDesktop: () => true }));
vi.mock("@/lib/scrollToSection", () => ({ scrollToSection: vi.fn() }));
vi.mock("@/components/landing/AnimatedItem", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const service = {
  id: "service-1",
  name: "General Consultation",
  description: "A thorough consultation for ongoing care and treatment planning. ".repeat(4),
  price: 500,
  type: "clinic",
  duration: 30,
  active: true,
  sort_order: 0,
};

describe("ServicesSection - service pricing", () => {
  it("displays service identity fields and price badge on the card and details view, and dispatches selection event on book", () => {
    vi.mocked(useDoctorData).mockReturnValue({ services: [service], profile: { consultation_fee: 400 } } as any);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(
      <MemoryRouter>
        <ServicesSection />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "General Consultation" })).toBeInTheDocument();
    expect(screen.getByText("At Clinic")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("₹500")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Book This Service" }));
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "doctylia:select-service",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "General Consultation" })).toBeInTheDocument();
    expect(within(dialog).getByText("At Clinic")).toBeInTheDocument();
    expect(within(dialog).getByText("30 min")).toBeInTheDocument();
    expect(within(dialog).getByText("₹500")).toBeInTheDocument();
    dispatchSpy.mockRestore();
  });
});