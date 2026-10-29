import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CustomPlanSection from "./CustomPlanSection";

const state = vi.hoisted(() => ({
  profile: { id: "d1", plan_tier: "premium", plan_status: "active" } as any,
  customPlan: null as any,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) } }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: state.profile }) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ rows: [{ feature_key: "online_consultation", label: "Online Consultation", description: "", effective_enabled: true, is_requestable: true }] }) }));
vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: state.customPlan, pendingRequest: null, latestDecided: null, refetch: vi.fn() }),
}));

const plan = (over: Record<string, unknown> = {}) => ({
  doctor_id: "d1", request_id: "r1", base_tier: "pro", extra_features: ["online_consultation"], removed_features: [],
  monthly_price: 2000, valid_from: "2026-01-01T00:00:00Z", valid_until: "2027-12-05T00:00:00Z", status: "active", ...over,
});

describe("CustomPlanSection", () => {
  beforeEach(() => {
    state.profile = { id: "d1", plan_tier: "premium", plan_status: "active" };
    state.customPlan = null;
  });

  it("says the plan applies when the doctor is on the tier it was built on", () => {
    state.profile = { id: "d1", plan_tier: "pro", plan_status: "active" };
    state.customPlan = plan();
    render(<CustomPlanSection />);
    expect(screen.getByText("Custom plan active")).toBeInTheDocument();
    expect(screen.getByText(/₹2000\/month from your next payment/)).toBeInTheDocument();
    expect(screen.getByText(/Active from Jan 1, 2026 until Dec 5, 2027/)).toBeInTheDocument();
    expect(screen.queryByText("Custom plan not applied")).not.toBeInTheDocument();
  });

  it("explains why it does NOT apply when the doctor is on a different tier", () => {
    state.customPlan = plan({ base_tier: "pro" });
    render(<CustomPlanSection />);
    expect(screen.getByText("Custom plan not applied")).toBeInTheDocument();
    expect(screen.queryByText("Custom plan active")).not.toBeInTheDocument();
    expect(screen.getByText(/set up for the/i)).toHaveTextContent(/Pro.*plan, but you are on the.*Premium/);
    expect(screen.getByText(/You still pay the standard Premium price/)).toBeInTheDocument();
  });

  it("does not let a Free-tier doctor request a custom plan", () => {
    state.profile = { id: "d1", plan_tier: "free", plan_status: "active" };
    render(<CustomPlanSection />);
    expect(screen.getByRole("button", { name: /customize plan/i })).toBeDisabled();
    expect(screen.getByText(/once you're on the Pro or Premium plan/i)).toBeInTheDocument();
  });
});
