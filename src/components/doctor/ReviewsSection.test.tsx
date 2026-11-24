import "./__test__/intersectionObserverStub";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReviewsSection from "./ReviewsSection";
import { useDoctorData } from "@/contexts/DoctorContext";

vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: vi.fn() }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));

const db = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: db.insert }) } }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const review = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  patient_name: "Meera K.",
  rating: 5,
  review_text: "Very patient with my son.",
  created_at: "2026-10-01T10:00:00Z",
  is_verified: false,
  ...over,
});

const mockData = (reviews: unknown[]) =>
  vi.mocked(useDoctorData).mockReturnValue({ reviews, profile: { id: "doc-1", full_name: "Asha Rao" } } as never);

describe("ReviewsSection", () => {
  beforeEach(() => {
    db.insert.mockReset();
    db.insert.mockResolvedValue({ error: null });
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("shows no rating at all when there are no reviews, and invites the first one", () => {
    mockData([]);
    render(<ReviewsSection />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Be the first to share your experience");
    expect(screen.queryByText(/out of 5 stars/)).not.toBeInTheDocument();
    expect(screen.queryByText("5.0")).not.toBeInTheDocument();
  });

  it("summarises real ratings and lists each review", () => {
    mockData([review(), review({ id: "r2", patient_name: "Ravi S.", rating: 4, review_text: null, is_verified: true })]);
    render(<ReviewsSection />);
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("2 reviews")).toBeInTheDocument();
    expect(screen.getByText("“Very patient with my son.”")).toBeInTheDocument();
    expect(screen.getByText("Rated 4 out of 5.")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("submits a review for this doctor and thanks the patient", async () => {
    mockData([]);
    render(<ReviewsSection />);
    fireEvent.click(screen.getByRole("button", { name: /write a review/i }));
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "  Sunita  " } });
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    fireEvent.change(screen.getByLabelText(/tell others/i), { target: { value: "Kind and clear." } });
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    await waitFor(() => expect(db.insert).toHaveBeenCalledWith({ doctor_id: "doc-1", patient_name: "Sunita", rating: 4, review_text: "Kind and clear." }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("will not submit without a name", async () => {
    mockData([]);
    render(<ReviewsSection />);
    fireEvent.click(screen.getByRole("button", { name: /write a review/i }));
    expect(await screen.findByRole("button", { name: /submit review/i })).toBeDisabled();
  });

  it("reports a failed submission", async () => {
    mockData([]);
    db.insert.mockResolvedValue({ error: { message: "boom" } });
    render(<ReviewsSection />);
    fireEvent.click(screen.getByRole("button", { name: /write a review/i }));
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Sunita" } });
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to submit review"));
  });
});
