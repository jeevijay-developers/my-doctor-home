import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SABilling from "./SABilling";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

const mockData = (payments: any[], profiles: any[]) => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    order: () => Promise.resolve(resolved),
  });
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "plan_upgrade_payments") return chain({ data: payments });
    if (table === "profiles") return chain({ data: profiles });
    return chain({ data: [] });
  });
};

describe("SABilling", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it("shows ₹0 cards and an empty state with no leftover patient-billing copy", async () => {
    mockData([], []);
    render(<SABilling />);
    expect(await screen.findByText(/no subscription payments yet/i)).toBeInTheDocument();
    expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
    expect(screen.queryByText(/patient billing volume/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/once razorpay is connected/i)).not.toBeInTheDocument();
  });

  it("renders a transaction row with the doctor name, tier change, and bucketed status badge", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "free",
          target_tier: "pro",
          amount: 1499,
          status: "captured",
          is_mock: false,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Asha", email: "asha@example.com" },
        },
      ],
      []
    );
    render(<SABilling />);
    expect(await screen.findByText("Dr. Asha")).toBeInTheDocument();
    expect(screen.getByText(/free.*pro/i)).toBeInTheDocument();
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });

  it("shows a mock badge for is_mock payments", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "pro",
          target_tier: "premium",
          amount: 2500,
          status: "captured",
          is_mock: true,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Mock", email: "" },
        },
      ],
      []
    );
    render(<SABilling />);
    await screen.findByText("Dr. Mock");
    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
  });

  it("shows an Invoices placeholder tab", async () => {
    mockData([], []);
    render(<SABilling />);
    await screen.findByText(/no subscription payments yet/i);
    const invoicesTab = screen.getByRole("tab", { name: /invoices/i });
    invoicesTab.focus(); // Radix Tabs' default activationMode="automatic" switches on focus, not just click.
    fireEvent.click(invoicesTab);
    expect(await screen.findByText(/subscription invoicing is coming soon/i)).toBeInTheDocument();
  });

  it("exports the transaction list as a CSV file", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "free",
          target_tier: "pro",
          amount: 1499,
          status: "captured",
          is_mock: false,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Asha", email: "asha@example.com" },
        },
      ],
      []
    );
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    (global.URL as any).createObjectURL = createObjectURL;
    (global.URL as any).revokeObjectURL = revokeObjectURL;

    render(<SABilling />);
    await screen.findByText("Dr. Asha");
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(createObjectURL).toHaveBeenCalled();
  });
});
