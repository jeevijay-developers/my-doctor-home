import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn() }));

const targets = [{ id: "doc-1", full_name: "Dr. Test" }];

// The mocked supabase responses are partial shapes; cast through `unknown`
// to the real return types instead of using `any`.
type SessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
type InvokeResult = Awaited<ReturnType<typeof supabase.functions.invoke>>;

describe("BulkDeleteDoctorsDialog", () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "tok" } },
    } as unknown as SessionResult);
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it("disables Delete Selected until a password is entered", () => {
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole("button", { name: /delete selected/i })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: "secret" } });
    expect(screen.getByRole("button", { name: /delete selected/i })).not.toBeDisabled();
  });

  it("sends the entered password with the delete request", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, deleted: ["doc-1"], failed: [] },
      error: null,
    } as unknown as InvokeResult);
    const onDeleted = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.change(screen.getByPlaceholderText(/your password/i), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "delete-doctor-account",
      expect.objectContaining({ body: { doctor_ids: ["doc-1"], password: "correct-horse" } })
    );
  });

  it("on a 401, clears the password field and keeps the dialog open", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { context: { status: 401, json: async () => ({ error: "Incorrect password" }) } },
    } as unknown as InvokeResult);
    const onClose = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={onClose} onDeleted={vi.fn()} />);
    const passwordInput = screen.getByPlaceholderText(/your password/i) as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(passwordInput.value).toBe(""));
    expect(onClose).not.toHaveBeenCalled();
  });
});
