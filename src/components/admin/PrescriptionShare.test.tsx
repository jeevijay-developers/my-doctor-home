import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PrescriptionShare from "./PrescriptionShare";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const props = { prescriptionId: "rx1", patientName: "Asha", patientPhone: "98765 43210", doctorName: "Rao" };

describe("PrescriptionShare", () => {
  beforeEach(() => {
    mock.current = createTableMock();
    mock.current.tables.prescription_shares = { data: null };
    mock.current.rpcs.create_prescription_share = () => ({ data: { token: "t".repeat(64) }, error: null });
  });

  it("creates a link and opens WhatsApp to the patient's saved number with the link in the message", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<PrescriptionShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share on whatsapp/i }));
    await waitFor(() => expect(tab.location.href).toContain("https://wa.me/919876543210?text="));
    expect(decodeURIComponent(tab.location.href)).toContain(`/rx/${"t".repeat(64)}`);
    expect(mock.current.rpc).toHaveBeenCalledWith("create_prescription_share", { _prescription_id: "rx1" });
  });

  it("closes the blank tab and sends nothing when the link can't be created", async () => {
    mock.current.rpcs.create_prescription_share = () => ({ data: null, error: { message: "NOT_ALLOWED" } });
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<PrescriptionShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share on whatsapp/i }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.href).toBe("");
  });

  it("warns when the patient has no usable phone number", () => {
    render(<PrescriptionShare {...props} patientPhone={null} />);
    expect(screen.getByText(/No valid phone saved/)).toBeInTheDocument();
  });
});
