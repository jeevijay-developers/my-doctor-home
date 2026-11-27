import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SABilling from "./SABilling";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const mockData = (payments: any[], profiles: any[]) => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    eq: () => Promise.resolve(resolved),
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
    vi.mocked(toast).mockReset();
  });

  it("surfaces a query error via toast instead of silently showing an empty page", async () => {
    const chain = (resolved: any): any => ({
      select: () => chain(resolved),
      eq: () => Promise.resolve(resolved),
      order: () => Promise.resolve(resolved),
    });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "plan_upgrade_payments") {
        return chain({ data: null, error: { message: "column profiles_1.email does not exist" } });
      }
      return chain({ data: [] });
    });
    render(<SABilling />);
    await new Promise((r) => setTimeout(r, 0));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed to load subscription payments", variant: "destructive" })
    );
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
          profiles: { full_name: "Dr. Asha", clinic_name: "Asha Clinic" },
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
          profiles: { full_name: "Dr. Mock", clinic_name: "" },
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
          profiles: { full_name: "Dr. Asha", clinic_name: "Asha Clinic" },
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

  describe("doctor seats", () => {
    const chainWith = (resolved: any): any => ({
      select: () => chainWith(resolved),
      eq: () => Promise.resolve(resolved),
      gt: () => Promise.resolve(resolved),
      order: () => Promise.resolve(resolved),
    });
    const seatPayment = {
      id: "p9", doctor_id: "d1", from_tier: "premium", target_tier: "premium", amount: 777, status: "captured",
      is_mock: false, created_at: "2020-01-01T00:00:00Z", kind: "seats", seats_quantity: 2,
      profiles: { full_name: "Dr. Seat", clinic_name: "" },
    };
    const setup = (periods: any) => {
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "plan_upgrade_payments") return chainWith({ data: [seatPayment] });
        if (table === "clinic_seat_periods") return periods instanceof Error ? ({ select: () => ({ gt: () => Promise.reject(periods) }) } as any) : chainWith(periods);
        return chainWith({ data: [] });
      });
    };

    it("shows the payment kind and adds active seat periods to the estimated MRR", async () => {
      setup({ data: [{ quantity: 2, starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", plan_upgrade_payments: { unit_price: 500 } }] });
      render(<SABilling />);
      expect(await screen.findByText(/doctor seats ×2/i)).toBeInTheDocument();
      const mrr = screen.getByText("Estimated MRR").parentElement as HTMLElement;
      await waitFor(() => expect(mrr).toHaveTextContent("₹1,000"));
    });

    it("keeps today's MRR when the seat period query fails, and says it may be understated", async () => {
      setup(new Error("boom"));
      render(<SABilling />);
      expect(await screen.findByText(/doctor seats ×2/i)).toBeInTheDocument();
      const mrr = screen.getByText("Estimated MRR").parentElement as HTMLElement;
      expect(mrr).toHaveTextContent("₹0");
      expect(await screen.findByText(/mrr may be understated/i)).toBeInTheDocument();
    });

    it("excludes mock payments' seat periods and periods with an unknown unit price from MRR", async () => {
      setup({ data: [
        { quantity: 2, starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", plan_upgrade_payments: { unit_price: 500, is_mock: true } },
        { quantity: 3, starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z", plan_upgrade_payments: { unit_price: null, is_mock: false } },
      ] });
      render(<SABilling />);
      await screen.findByText(/doctor seats ×2/i);
      const mrr = screen.getByText("Estimated MRR").parentElement as HTMLElement;
      expect(mrr).toHaveTextContent("₹0");
      expect(screen.queryByText(/mrr may be understated/i)).not.toBeInTheDocument();
    });

    it("badges needs_refund payments, shows a count banner and leaves them out of the revenue totals", async () => {
      const now = new Date().toISOString();
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "plan_upgrade_payments") {
          return chainWith({ data: [
            { ...seatPayment, id: "a", amount: 900, created_at: now, needs_refund: true, needs_refund_reason: "plan_lapsed" },
            { ...seatPayment, id: "b", amount: 100, created_at: now, needs_refund: false },
          ] });
        }
        return chainWith({ data: [] });
      });
      render(<SABilling />);
      expect(await screen.findByText("Needs refund")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(/1 payment needs a refund/i);
      const today = screen.getByText("Today's Subscription Revenue").parentElement as HTMLElement;
      expect(today).toHaveTextContent("₹100");
      expect(today).not.toHaveTextContent("₹1,000");
    });
  });
});
