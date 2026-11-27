import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyDoctorDetailsCard from "./MyDoctorDetailsCard";

const h = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), refetch: vi.fn() }));

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
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "c1" }, myPractitionerId: "p2", staffName: "Staff Name" }) }));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({
    refetch: h.refetch,
    byId: (id: string) => id === "p2"
      ? { id: "p2", display_name: "Dr utkarsh vijay", specialization: "ENT", qualifications: "MS", experience_years: 5, registration_number: "REG-9", bio: "old bio", photo_url: null, signature_url: null }
      : undefined,
  }),
}));

describe("MyDoctorDetailsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
