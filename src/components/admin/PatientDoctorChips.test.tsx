import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PatientDoctorChips, { orderDoctorIds } from "./PatientDoctorChips";

const P = (id: string, display_name: string) => ({ id, display_name });
// Clinic order: primary first, then sort_order.
const ALL = [P("a", "Dr. Asha Rao"), P("b", "Dr. Bina Shah"), P("c", "Dr. Chetan Iyer")];
const h = vi.hoisted(() => ({ prac: null as any }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.prac }));
h.prac = { isMulti: true, practitioners: ALL, byId: (id: string) => ALL.find((p) => p.id === id) };

const names = () => Array.from(screen.getByTestId("patient-doctor-chips").querySelectorAll("div, span")).map((e) => e.textContent);

describe("orderDoctorIds", () => {
  it("puts the most recent doctor first, then the rest in clinic order (not uuid order)", () => {
    // The view hands them back in uuid order: c, a, b here.
    expect(orderDoctorIds(["c", "a", "b"], "b", ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
  it("without a last doctor, or one not in the list, uses clinic order", () => {
    expect(orderDoctorIds(["c", "b", "a"], null, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(orderDoctorIds(["c", "b"], "zz", ["a", "b", "c"])).toEqual(["b", "c"]);
  });
  it("puts ids the clinic no longer lists last", () => {
    expect(orderDoctorIds(["x", "a"], null, ["a", "b"])).toEqual(["a", "x"]);
  });
});

describe("PatientDoctorChips", () => {
  it("shows the latest doctor first and collapses the rest into +n", () => {
    render(<PatientDoctorChips ids={["c", "a", "b"]} lastId="c" max={2} />);
    const text = screen.getByTestId("patient-doctor-chips").textContent;
    expect(text).toBe("Dr Chetan IyerDr Asha Rao+1");
    expect(names()).toContain("+1");
    expect(screen.getByTitle("Dr Bina Shah")).toBeInTheDocument();
  });
  it("renders nothing for a single-doctor clinic", () => {
    h.prac = { ...h.prac, isMulti: false };
    const { container } = render(<PatientDoctorChips ids={["a"]} lastId="a" />);
    expect(container).toBeEmptyDOMElement();
    h.prac = { ...h.prac, isMulti: true };
  });
});
