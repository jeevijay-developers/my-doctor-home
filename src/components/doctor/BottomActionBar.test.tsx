import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomActionBar from "./BottomActionBar";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

const mockData = (over: Record<string, unknown> = {}) =>
  vi.mocked(useDoctorData).mockReturnValue({
    profile: { id: "d1", full_name: "asha rao", clinic_name: "Little Steps", phone: "9876543210" },
    settings: { whatsapp_number: "9876543210" },
    ...over,
  } as never);

const renderBar = () => render(<MemoryRouter><BottomActionBar /></MemoryRouter>);

describe("BottomActionBar in a team clinic", () => {
  beforeEach(() => scroll.dsScrollTo.mockReset());

  it("names the clinic and offers a Doctors action beside Book, Call and WhatsApp", () => {
    mockData({ isTeamClinic: true });
    renderBar();
    expect(screen.getAllByRole("region", { name: "Quick actions for Little Steps" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Doctors" }));
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("doctors", expect.anything());
    expect(screen.getByRole("link", { name: /^call$/i })).toBeInTheDocument();
    // The short "Book" label keeps its full accessible name.
    expect(screen.getAllByRole("button", { name: /book appointment/i }).length).toBeGreaterThan(0);
  });

  it("single-doctor clinics are unchanged: no Doctors action, plain region name", () => {
    mockData();
    renderBar();
    expect(screen.queryByRole("button", { name: "Doctors" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Quick actions" }).length).toBeGreaterThan(0);
  });
});
