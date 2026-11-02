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

  const type = (v: string) =>
    fireEvent.change(screen.getByPlaceholderText(/^DELETE \d+$/), { target: { value: v } });

  it("disables Delete Selected until the typed count matches", () => {
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={vi.fn()} />);
    const btn = () => screen.getByRole("button", { name: /delete selected/i });
    expect(btn()).toBeDisabled();
    type("DELETE 5");
    expect(btn()).toBeDisabled();
    type("DELETE 1");
    expect(btn()).not.toBeDisabled();
  });

  it("requires the count of the current selection", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, full_name: null }));
    render(<BulkDeleteDoctorsDialog targets={five} onClose={vi.fn()} onDeleted={vi.fn()} />);
    type("DELETE 1");
    expect(screen.getByRole("button", { name: /delete selected/i })).toBeDisabled();
    type("DELETE 5");
    expect(screen.getByRole("button", { name: /delete selected/i })).not.toBeDisabled();
  });

  it("sends only the doctor ids (no password) once confirmed", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, deleted: ["doc-1"], failed: [] },
      error: null,
    } as unknown as InvokeResult);
    const onDeleted = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={vi.fn()} onDeleted={onDeleted} />);
    type("DELETE 1");
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "delete-doctor-account",
      expect.objectContaining({ body: { doctor_ids: ["doc-1"] } })
    );
  });

  it("on an error keeps the dialog open and does not call onDeleted", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { context: { status: 403, json: async () => ({ error: "Forbidden" }) } },
    } as unknown as InvokeResult);
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    render(<BulkDeleteDoctorsDialog targets={targets} onClose={onClose} onDeleted={onDeleted} />);
    type("DELETE 1");
    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /delete selected/i })).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
