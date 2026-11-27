import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ReviewsManagePage from "./ReviewsManagePage";

const m = vi.hoisted(() => ({ isMulti: false, rows: [] as unknown[] }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "doc-1" }, can: () => true }) }));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({
    isMulti: m.isMulti,
    active: [{ id: "pa", display_name: "Asha Rao" }, { id: "pb", display_name: "Vikram Shah" }],
    byId: (id: string) => (id === "pa" ? { id, display_name: "Asha Rao" } : id === "pb" ? { id, display_name: "Vikram Shah" } : undefined),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: m.rows }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rv = (id: string, name: string, rating: number, practitioner_id: string | null) => ({
  id, patient_name: name, rating, review_text: null, is_pinned: false, is_verified: false, is_visible: true,
  created_at: "2026-10-01T10:00:00Z", practitioner_id,
});

describe("ReviewsManagePage", () => {
  beforeEach(() => {
    m.rows = [rv("1", "Meera", 5, "pa"), rv("2", "Ravi", 3, "pb"), rv("3", "Sunita", 1, null)];
  });

  it("single-doctor clinics get no filter and no doctor names", async () => {
    m.isMulti = false;
    render(<ReviewsManagePage />);
    await screen.findAllByText("Meera");
    expect(screen.queryByLabelText(/filter by doctor/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
    expect(screen.getByText("3.0")).toBeInTheDocument();
  });

  it("multi clinics show the doctor per review and filter list and average", async () => {
    m.isMulti = true;
    render(<ReviewsManagePage />);
    await screen.findAllByText("Meera");
    expect(screen.getAllByText("Asha Rao").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clinic").length).toBeGreaterThan(0);
    const filter = screen.getByLabelText(/filter by doctor/i);
    fireEvent.change(filter, { target: { value: "pb" } });
    await waitFor(() => expect(screen.queryAllByText("Meera")).toHaveLength(0));
    expect(screen.getAllByText("Ravi").length).toBeGreaterThan(0);
    expect(screen.getByText("3.0")).toBeInTheDocument(); // Ravi alone
    fireEvent.change(filter, { target: { value: "pa" } });
    await waitFor(() => expect(screen.getByText("5.0")).toBeInTheDocument());
    fireEvent.change(filter, { target: { value: "clinic" } });
    await waitFor(() => expect(screen.getByText("1.0")).toBeInTheDocument());
    expect(within(document.body).queryAllByText("Meera")).toHaveLength(0);
  });

  it("a filter with no reviews says so for that filter, not the global empty text", async () => {
    m.isMulti = true;
    m.rows = [rv("1", "Meera", 5, "pa")];
    render(<ReviewsManagePage />);
    await screen.findAllByText("Meera");
    const filter = screen.getByLabelText(/filter by doctor/i);
    fireEvent.change(filter, { target: { value: "pb" } });
    expect(await screen.findByText("No reviews for this doctor yet")).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "clinic" } });
    expect(await screen.findByText("No clinic-level reviews yet")).toBeInTheDocument();
    expect(screen.queryByText("No reviews yet")).not.toBeInTheDocument();
  });

  it("lists a no-longer-active doctor in the filter when a review references them", async () => {
    m.isMulti = true;
    m.rows = [rv("1", "Meera", 5, "pold")];
    render(<ReviewsManagePage />);
    await screen.findAllByText("Meera");
    expect(within(screen.getByLabelText(/filter by doctor/i)).getByRole("option", { name: /no longer active/ })).toBeInTheDocument();
  });
});
