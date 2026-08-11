import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SAModeration from "./SAModeration";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn() }));

const posts = [
  { id: "p1", title: "Post A1", doctor_id: "d1", is_published: true, created_at: "2026-08-01", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p2", title: "Post A2", doctor_id: "d1", is_published: false, created_at: "2026-08-05", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p3", title: "Post B1", doctor_id: "d2", is_published: true, created_at: "2026-08-10", profiles: { full_name: "Dr. B", clinic_name: "B Clinic" } },
];
const reviews = [
  { id: "r1", patient_name: "Pat A", doctor_id: "d1", rating: 5, review_text: "Great", is_visible: true, created_at: "2026-08-02", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
];

const mockData = () => {
  const chain = (resolved: any): any => ({ select: () => chain(resolved), order: () => Promise.resolve(resolved) });
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "blog_posts") return chain({ data: posts });
    if (table === "reviews") return chain({ data: reviews });
    return chain({ data: [] });
  });
};

describe("SAModeration blog grouping", () => {
  it("shows one collapsed card per doctor with the correct post count, posts hidden until expanded", async () => {
    mockData();
    render(<SAModeration />);
    expect(await screen.findByText("Dr. A")).toBeInTheDocument();
    expect(screen.getByText("Dr. B")).toBeInTheDocument();
    expect(screen.getByText(/2 posts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 post\b/i)).toBeInTheDocument();
    expect(screen.queryByText("Post A1")).not.toBeInTheDocument();
    expect(screen.queryByText("Post B1")).not.toBeInTheDocument();
  });

  it("expands a doctor's card on click to reveal their posts", async () => {
    mockData();
    render(<SAModeration />);
    const drACard = await screen.findByText("Dr. A");
    fireEvent.click(drACard);
    expect(await screen.findByText("Post A1")).toBeInTheDocument();
    expect(await screen.findByText("Post A2")).toBeInTheDocument();
    expect(screen.queryByText("Post B1")).not.toBeInTheDocument();
  });

  it("orders doctor cards by most recent post first", async () => {
    mockData();
    render(<SAModeration />);
    await screen.findByText("Dr. A");
    const names = screen.getAllByText(/^Dr\. [AB]$/).map((el) => el.textContent);
    expect(names).toEqual(["Dr. B", "Dr. A"]);
  });

  it("groups reviews into one collapsed card per doctor", async () => {
    mockData();
    render(<SAModeration />);
    const reviewsTab = screen.getByRole("tab", { name: /reviews/i });
    reviewsTab.focus(); // Radix Tabs' default activationMode="automatic" switches on focus, not just click.
    fireEvent.click(reviewsTab);
    expect(await screen.findByText(/1 review\b/i)).toBeInTheDocument();
    expect(screen.queryByText("Pat A")).not.toBeInTheDocument();
  });
});
