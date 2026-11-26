import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DoctorFormDialog from "./DoctorFormDialog";

Element.prototype.scrollIntoView = vi.fn();

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => h.upload(...a),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn/x.png" } }),
      }),
    },
  },
}));

const renderDialog = (onSaved = vi.fn(), onOpenChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <DoctorFormDialog open onOpenChange={onOpenChange} practitioner={null} clinicId="clinic-1" isOwnerRow={false} onSaved={onSaved} />
    </MemoryRouter>,
  );

describe("DoctorFormDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: { ok: true, id: "pr-new" }, error: null });
    h.upload.mockResolvedValue({ error: null });
  });

  it("a failed photo upload after creating the doctor keeps the dialog open and retries as an edit (no second doctor)", async () => {
    h.upload.mockResolvedValueOnce({ error: { message: "too big" } });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(onSaved, onOpenChange);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Meera" } });
    fireEvent.change(screen.getByLabelText(/^photo/i), { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be uploaded/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: /edit dr\. meera/i })).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0][1]._id).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    // Every later save addresses the doctor that already exists.
    const ids = h.rpc.mock.calls.map((c) => c[1]._id);
    expect(ids[0]).toBeNull();
    expect(ids.slice(1).every((id: string | null) => id === "pr-new")).toBe(true);
  });

  it("a normal create closes the dialog", async () => {
    const onOpenChange = vi.fn();
    renderDialog(vi.fn(), onOpenChange);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Meera" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("create never sends photo_url / signature_url in the first call; URLs are saved by a second call under the new id", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Dr. Meera" } });
    fireEvent.change(screen.getByLabelText(/^photo/i), { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(2));
    const [first, second] = h.rpc.mock.calls;
    expect(first[1]._id).toBeNull();
    expect(first[1]._data).not.toHaveProperty("photo_url");
    expect(first[1]._data).not.toHaveProperty("signature_url");
    expect(second[1]._id).toBe("pr-new");
    expect(second[1]._data).toHaveProperty("photo_url");
  });
});
