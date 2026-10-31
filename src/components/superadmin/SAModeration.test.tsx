import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import SAModeration from "./SAModeration";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn() }));

const updateEq = vi.fn();
let updateResult: { error: { message: string } | null } = { error: null };
beforeEach(() => {
  updateEq.mockReset();
  vi.mocked(toast).mockClear();
  vi.mocked(logAdminAction).mockClear();
  updateResult = { error: null };
});

const posts = [
  { id: "p1", title: "Post A1", doctor_id: "d1", is_published: true, hub_hidden: false, created_at: "2026-08-01", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p2", title: "Post A2", doctor_id: "d1", is_published: false, hub_hidden: false, created_at: "2026-08-05", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p3", title: "Post B1", doctor_id: "d2", is_published: true, hub_hidden: true, created_at: "2026-08-10", profiles: { full_name: "Dr. B", clinic_name: "B Clinic" } },
];
const reviews = [
  { id: "r1", patient_name: "Pat A", doctor_id: "d1", rating: 5, review_text: "Great", is_visible: true, created_at: "2026-08-02", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
];

const mockData = () => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    order: () => Promise.resolve(resolved),
    update: (patch: any) => ({
      eq: (...a: any[]) => {
        updateEq(patch, ...a);
        return Promise.resolve(updateResult);
      },
    }),
  });
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

describe("SAModeration hide from Health Articles hub", () => {
  it("hides a published post from the hub and logs it, without opening the dialog", async () => {
    mockData();
    render(<SAModeration />);
    fireEvent.click(await screen.findByText("Dr. A"));
    const row = (await screen.findByText("Post A1")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Hide from hub" }));
    await waitFor(() => expect(updateEq).toHaveBeenCalledWith({ hub_hidden: true }, "id", "p1"));
    await waitFor(() => expect(logAdminAction).toHaveBeenCalledWith("hide_blog_from_hub", "blog_posts", "p1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers 'Show on hub' for an already hidden post and restores it", async () => {
    mockData();
    render(<SAModeration />);
    fireEvent.click(await screen.findByText("Dr. B"));
    const row = (await screen.findByText("Post B1")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Show on hub" }));
    await waitFor(() => expect(updateEq).toHaveBeenCalledWith({ hub_hidden: false }, "id", "p3"));
    await waitFor(() => expect(logAdminAction).toHaveBeenCalledWith("show_blog_on_hub", "blog_posts", "p3"));
  });

  it("does not offer the hub button for a draft", async () => {
    mockData();
    render(<SAModeration />);
    fireEvent.click(await screen.findByText("Dr. A"));
    const row = (await screen.findByText("Post A2")).closest("tr")!;
    expect(within(row).queryByRole("button", { name: /hub/i })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  it("shows a destructive toast and logs nothing when the update fails", async () => {
    mockData();
    updateResult = { error: { message: "boom" } };
    render(<SAModeration />);
    fireEvent.click(await screen.findByText("Dr. A"));
    const row = (await screen.findByText("Post A1")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Hide from hub" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Failed", description: "boom", variant: "destructive" }),
    );
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("explains the difference between Unpublish and Hide from hub", async () => {
    mockData();
    render(<SAModeration />);
    expect(await screen.findByText(/Unpublish removes a post everywhere/i)).toBeInTheDocument();
    expect(screen.getByText(/Hide from hub only removes it from the Health Articles page/i)).toBeInTheDocument();
  });

  it("shows hub controls and a badge in the post dialog", async () => {
    mockData();
    render(<SAModeration />);
    fireEvent.click(await screen.findByText("Dr. B"));
    fireEvent.click(await screen.findByText("Post B1"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Hidden from hub")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Show on hub" })).toBeInTheDocument();
  });
});
