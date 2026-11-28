import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyDoctorDetailsCard from "./MyDoctorDetailsCard";

const h = vi.hoisted(() => ({
  rpc: vi.fn(), upload: vi.fn(), refetch: vi.fn(),
  activeCount: 0, slug: "sunrise" as string | null, me: {} as Record<string, unknown>,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => h.upload(...a),
        getPublicUrl: () => ({ data: { publicUrl: "https://x.co/storage/v1/object/public/doctor-uploads/c1/practitioners/p2/photo.png" } }),
      }),
    },
  },
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "c1", get slug() { return h.slug; } }, myPractitionerId: "p2", staffName: "Staff Name" }) }));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({
    refetch: h.refetch,
    active: Array.from({ length: h.activeCount }, (_, i) => ({ id: `a${i}` })),
    byId: (id: string) => id === "p2"
      ? { id: "p2", slug: "utkarsh", is_active: true, display_name: "Dr utkarsh vijay", specialization: "ENT", qualifications: "MS", experience_years: 5, registration_number: "REG-9", bio: "old bio", photo_url: null, signature_url: null, ...h.me }
      : undefined,
  }),
}));

describe("MyDoctorDetailsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.activeCount = 0; h.slug = "sunrise"; h.me = {};
    h.rpc.mockResolvedValue({ data: { ok: true, id: "p2" }, error: null });
    h.upload.mockResolvedValue({ error: null });
  });

  it("shows the second doctor's own record, not the clinic owner's", () => {
    render(<MyDoctorDetailsCard />);
    expect(screen.getByText("Dr utkarsh vijay")).toBeTruthy();
    expect(screen.getByText("REG-9")).toBeTruthy();
  });

  it("saves only the bio, photo and signature through the self-edit RPC, uploading into the own folder", async () => {
    render(<MyDoctorDetailsCard />);
    fireEvent.change(screen.getByLabelText(/^bio/i), { target: { value: "  new bio  " } });
    fireEvent.change(screen.getByLabelText(/^photo/i), { target: { files: [new File(["x"], "me.PNG", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    expect(h.upload.mock.calls[0][0]).toBe("c1/practitioners/p2/photo.png");
    const [fn, args] = h.rpc.mock.calls[0];
    expect(fn).toBe("update_my_practitioner_profile");
    expect(Object.keys(args).sort()).toEqual(["_bio", "_photo_url"]);
    expect(args._bio).toBe("new bio");
    expect(h.refetch).toHaveBeenCalled();
  });

  it("refuses a file that is not an image and never uploads it", async () => {
    render(<MyDoctorDetailsCard />);
    fireEvent.change(screen.getByLabelText(/^photo/i), { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/jpg, png or webp/i);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not save the bio when the photo upload fails", async () => {
    h.upload.mockResolvedValueOnce({ error: { message: "nope" } });
    render(<MyDoctorDetailsCard />);
    fireEvent.change(screen.getByLabelText(/^photo/i), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be uploaded/i);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("shows a refusal from the server", async () => {
    h.rpc.mockResolvedValueOnce({ data: { ok: false, error: "FORBIDDEN" }, error: null });
    render(<MyDoctorDetailsCard />);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
  });
  describe("public profile section", () => {
    it("single-doctor clinic: no public page link", () => {
      h.activeCount = 1;
      render(<MyDoctorDetailsCard />);
      expect(screen.queryByRole("link", { name: /view my public page/i })).not.toBeInTheDocument();
    });

    it("2+ active doctors: links to the doctor's own page", () => {
      h.activeCount = 2;
      render(<MyDoctorDetailsCard />);
      const link = screen.getByRole("link", { name: /view my public page/i });
      expect(link).toHaveAttribute("href", "/dr/sunrise/doctor/utkarsh");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("no link when the clinic has no address (slug) yet", () => {
      h.activeCount = 2; h.slug = null;
      render(<MyDoctorDetailsCard />);
      expect(screen.queryByRole("link", { name: /view my public page/i })).not.toBeInTheDocument();
    });

    it("splits the checklist into what the doctor can add and what the owner manages", () => {
      h.me = { specialization: null, qualifications: null, photo_url: null, signature_url: null, bio: "short" };
      render(<MyDoctorDetailsCard />);
      expect(screen.getByText("You can add")).toBeInTheDocument();
      expect(screen.getByText("Add a photo")).toBeInTheDocument();
      expect(screen.getByText(/add a signature/i)).toBeInTheDocument();
      expect(screen.getByText(/make your bio longer \(5 of 60/i)).toBeInTheDocument();
      expect(screen.getByText("Ask the clinic owner to change these")).toBeInTheDocument();
      expect(screen.getByText("Add a specialization")).toBeInTheDocument();
      expect(screen.getByText("Add qualifications")).toBeInTheDocument();
      expect(screen.getByText("Add a bio to appear in Google")).toBeInTheDocument();
    });

    it("bio counter and 60-character guidance follow what is typed (59 vs 60)", () => {
      render(<MyDoctorDetailsCard />);
      const bio = screen.getByLabelText(/^bio/i);
      fireEvent.change(bio, { target: { value: "a".repeat(59) } });
      expect(screen.getByTestId("bio-counter")).toHaveTextContent("59/2000");
      expect(screen.getByText(/1 more/)).toBeInTheDocument();
      fireEvent.change(bio, { target: { value: "a".repeat(60) } });
      expect(screen.getByTestId("bio-counter")).toHaveTextContent("60/2000");
      expect(screen.getByText(/long enough for google/i)).toBeInTheDocument();
    });

    it("previews the bio as plain text, never as markup", () => {
      render(<MyDoctorDetailsCard />);
      fireEvent.change(screen.getByLabelText(/^bio/i), { target: { value: "<b>bold</b> hello" } });
      const preview = screen.getByTestId("bio-preview");
      expect(preview.textContent).toBe("<b>bold</b> hello");
      expect(preview.querySelector("b")).toBeNull();
    });

    it("a complete profile says so", () => {
      h.me = { photo_url: "p.jpg", signature_url: "s.png", bio: "b".repeat(80), consultation_fee: 400 };
      render(<MyDoctorDetailsCard />);
      expect(screen.getByText(/your profile is complete/i)).toBeInTheDocument();
    });
  });
});
