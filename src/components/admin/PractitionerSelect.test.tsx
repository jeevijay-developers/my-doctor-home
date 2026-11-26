import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PractitionerSelect from "./PractitionerSelect";

Element.prototype.scrollIntoView = vi.fn();

const h = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.state }));

const doc = (id: string, display_name: string, over: Record<string, unknown> = {}) => ({
  id, display_name, specialization: null, is_active: true, is_bookable: true, is_primary: false, ...over,
});

const A = doc("a", "Dr. Asha Rao", { is_primary: true, specialization: "Cardiologist" });
const B = doc("b", "Dr. Bina Shah");
const C = doc("c", "Dr. Chetan Paul", { is_bookable: false });

const setState = (isMulti: boolean) => {
  const all = [A, B, C];
  h.state = {
    practitioners: all,
    active: all.filter((p) => p.is_active),
    bookable: all.filter((p) => p.is_active && p.is_bookable),
    primary: A,
    byId: (id: string) => all.find((p) => p.id === id),
    access: { enabled: isMulti, has_feature: true },
    isMulti,
    loading: false,
    refetch: vi.fn(),
  };
};

describe("PractitionerSelect", () => {
  beforeEach(() => setState(true));

  it("renders nothing when the clinic is not multi-doctor", () => {
    setState(false);
    const { container } = render(<PractitionerSelect value={null} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it('lists only bookable doctors with options="bookable"', async () => {
    render(<PractitionerSelect value={null} onChange={vi.fn()} options="bookable" />);
    fireEvent.click(screen.getByRole("combobox", { name: /doctor/i }));
    expect(await screen.findByRole("option", { name: /Dr\. Asha Rao/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Dr\. Bina Shah/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Dr\. Chetan Paul/ })).not.toBeInTheDocument();
  });

  it("lists every active doctor by default, with the specialization, and reports the choice", async () => {
    const onChange = vi.fn();
    render(<PractitionerSelect value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: /doctor/i }));
    expect(await screen.findByRole("option", { name: /Dr\. Chetan Paul/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Dr\. Asha Rao.*Cardiologist/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Dr\. Bina Shah/ }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it('adds "All doctors" with allowAll', async () => {
    const onChange = vi.fn();
    render(<PractitionerSelect value="b" onChange={onChange} allowAll />);
    fireEvent.click(screen.getByRole("combobox", { name: /doctor/i }));
    fireEvent.click(await screen.findByRole("option", { name: "All doctors" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("leaves out excluded doctors", async () => {
    render(<PractitionerSelect value={null} onChange={vi.fn()} options="bookable" excludeIds={["a"]} />);
    fireEvent.click(screen.getByRole("combobox", { name: /doctor/i }));
    expect(await screen.findByRole("option", { name: /Dr\. Bina Shah/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Dr\. Asha Rao/ })).not.toBeInTheDocument();
  });
});
