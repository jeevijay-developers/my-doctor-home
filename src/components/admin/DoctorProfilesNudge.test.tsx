import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DoctorProfilesNudge from "./DoctorProfilesNudge";

const h = vi.hoisted(() => ({
  role: "owner" as string, isStaff: false, granted: [] as string[], isMulti: true, active: [] as any[], clinicId: "c1",
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: h.clinicId }, role: h.role, isStaff: h.isStaff, can: (k: string) => h.granted.includes(k) }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ isMulti: h.isMulti, active: h.active }) }));

const good = (id: string) => ({ id, display_name: `Dr ${id}`, is_active: true, photo_url: "p", bio: "b".repeat(80), specialization: "ENT", qualifications: "MS", experience_years: 3, consultation_fee: 1, registration_number: "R" });
const bare = (id: string, name = `Dr ${id}`) => ({ id, display_name: name, is_active: true });
const renderIt = () => render(<MemoryRouter><DoctorProfilesNudge /></MemoryRouter>);

describe("DoctorProfilesNudge", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(h, { role: "owner", isStaff: false, granted: [], isMulti: true, clinicId: "c1", active: [good("a"), bare("b"), bare("c")] });
  });

  it("lists the doctors who still need work", () => {
    renderIt();
    expect(screen.getByRole("region", { name: /doctor profiles/i })).toHaveTextContent("Dr b, Dr c");
    expect(screen.getByRole("region")).not.toHaveTextContent("Dr a");
    expect(screen.getByRole("link", { name: /open doctors/i })).toHaveAttribute("href", "/admin/doctors");
  });

  it("shows nothing for a single-doctor clinic", () => {
    h.isMulti = false; h.active = [bare("a")];
    renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows nothing when every doctor is in good shape", () => {
    h.active = [good("a"), good("b")];
    renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("dismisses per clinic and stays dismissed", () => {
    const { unmount } = renderIt();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    unmount();
    renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    h.clinicId = "c2";
    unmount();
    renderIt();
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("is hidden for reception without practitioners.view, shown with it, hidden for doctor logins", () => {
    h.role = "staff"; h.isStaff = true;
    const { unmount } = renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    unmount();
    h.granted = ["practitioners.view"];
    const second = renderIt();
    expect(screen.getByRole("region")).toBeInTheDocument();
    second.unmount();
    h.role = "doctor";
    renderIt();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("caps the list at 5 names for 9+ doctors with very long names", () => {
    h.active = Array.from({ length: 9 }, (_, i) => bare(`x${i}`, `Dr ${"Long".repeat(20)}${i}`));
    renderIt();
    expect(screen.getByRole("region")).toHaveTextContent("and 4 more");
  });
});
