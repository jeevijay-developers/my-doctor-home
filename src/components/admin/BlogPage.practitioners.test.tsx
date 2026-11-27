import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BlogPage from "./BlogPage";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { supabase } from "@/integrations/supabase/client";

const h = vi.hoisted(() => ({
  isMulti: true,
  myPractitionerId: "p-1" as string | null,
  posts: [] as unknown[],
}));

const docs = [
  { id: "p-1", display_name: "Dr. Asha", specialization: "Cardiology", is_active: true },
  { id: "p-2", display_name: "Dr. Ravi", specialization: "Dermatology", is_active: true },
];

vi.mock("./RichTextEditor", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="Content" value={value} readOnly />,
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: { id: "clinic-1", full_name: "Owner Name", specialization: "General" },
    can: () => true,
    myPractitionerId: h.myPractitionerId,
  }),
}));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({ isMulti: h.isMulti, active: h.isMulti ? docs : [], practitioners: docs }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "jwt" } } }) },
    from: vi.fn(),
  },
}));

global.fetch = vi.fn();

const insert = vi.fn();
const update = vi.fn();
const eqUpdate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  h.isMulti = true;
  h.myPractitionerId = "p-1";
  h.posts = [];
  insert.mockResolvedValue({ error: null });
  eqUpdate.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: eqUpdate });
  vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
  vi.mocked(supabase.from).mockImplementation((() => ({
    select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: h.posts }) }) }),
    insert,
    update,
  })) as never);
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ title: "T", excerpt: "E", content: "C", category: "General Health" }),
  } as Response);
});

const open = async () => {
  render(<MemoryRouter><BlogPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /new blog post|new post/i }));
};

describe("BlogPage - author (multi-doctor)", () => {
  it("offers active doctors plus Clinic and defaults to the logged-in doctor", async () => {
    await open();
    const select = screen.getByLabelText(/author/i) as HTMLSelectElement;
    expect(select.value).toBe("p-1");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Clinic", "Dr. Asha", "Dr. Ravi"]);
  });

  it("defaults to Clinic when the login is not a doctor", async () => {
    h.myPractitionerId = null;
    await open();
    expect((screen.getByLabelText(/author/i) as HTMLSelectElement).value).toBe("");
  });

  it("saves the chosen practitioner_id on insert", async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: "p-2" } });
    fireEvent.change(screen.getByPlaceholderText(/your article title/i), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /create post/i }));
    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0]).toMatchObject({ practitioner_id: "p-2", doctor_id: "clinic-1" });
  });

  it("saves null for Clinic", async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/your article title/i), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /create post/i }));
    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect(insert.mock.calls[0][0].practitioner_id).toBeNull();
  });

  it("sends the selected author's name and specialization to the AI writer", async () => {
    await open();
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: "p-2" } });
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Skin" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ doctorName: "Dr. Ravi", specialization: "Dermatology" });
  });

  it("uses the clinic profile for the AI writer when the author is Clinic", async () => {
    h.myPractitionerId = null;
    await open();
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Skin" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ doctorName: "Owner Name", specialization: "General" });
  });

  it("keeps the existing author when editing a post", async () => {
    h.posts = [{
      id: "post-1", title: "Old", excerpt: null, content: "x", category: null, featured_image_url: null,
      is_published: false, published_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      practitioner_id: "p-2",
    }];
    render(<MemoryRouter><BlogPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /edit/i }));
    expect((screen.getByLabelText(/author/i) as HTMLSelectElement).value).toBe("p-2");
    fireEvent.click(screen.getByRole("button", { name: /update post/i }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toMatchObject({ practitioner_id: "p-2" });
  });
});

describe("BlogPage - single-doctor clinic is unchanged", () => {
  it("shows no author select and sends no practitioner_id", async () => {
    h.isMulti = false;
    await open();
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/your article title/i), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /create post/i }));
    await waitFor(() => expect(insert).toHaveBeenCalled());
    expect("practitioner_id" in insert.mock.calls[0][0]).toBe(false);
  });

  it("AI writer still uses the profile name", async () => {
    h.isMulti = false;
    await open();
    fireEvent.change(screen.getByPlaceholderText(/top 10 tips/i), { target: { value: "Skin" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ doctorName: "Owner Name", specialization: "General" });
  });
});
