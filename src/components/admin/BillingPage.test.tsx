import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BillingPage from "./BillingPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { id: "doctor-1", full_name: "Dr. Test" }, loading: false }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));

vi.mock("@/lib/invoicePdf", () => ({ generateInvoicePDF: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    eq: () => chain(resolved),
    order: () => Promise.resolve(resolved),
  });
  return {
    supabase: {
      from: vi.fn(() => chain({ data: [] })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
    },
  };
});

describe("BillingPage - plan gating", () => {
  it("shows LockedFeatureCard instead of billing content for a Basic-tier doctor", () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /request upgrade/i })).toBeInTheDocument();
    expect(screen.queryByText(/billing & revenue/i)).not.toBeInTheDocument();
  });

  it("shows real billing content for a Premium doctor", () => {
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, loading: false, appointmentsUsed: 0, appointmentsCap: 0, nearCap: false });
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/billing & revenue/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request upgrade/i })).not.toBeInTheDocument();
  });
});
