import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomizePlanDialog } from "./CustomPlanSection";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "d1", plan_status: "active", plan_tier: "pro" } }) }));
vi.mock("@/hooks/useCustomPlan", () => ({ useCustomPlan: () => ({}) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ rows: [] }) }));

const features = [{ key: "online_consultation", label: "Online Consultation", description: "Video visits", enabled: false }];

const renderDialog = (effective: number | null = 100) =>
  render(
    <CustomizePlanDialog
      open
      onOpenChange={() => {}}
      features={features}
      onSubmitted={() => {}}
      appointmentsLimit={{ standardCap: 100, effective }}
    />,
  );
const send = () => screen.getByRole("button", { name: /send request|change at least one/i });

describe("CustomizePlanDialog - monthly appointments", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ error: null });
  });

  it("shows the current limit and starts with nothing to send", () => {
    renderDialog();
    expect(screen.getByText("Monthly appointments")).toBeInTheDocument();
    expect(screen.getByText(/up to 100 a month now/i)).toBeInTheDocument();
    expect(send()).toBeDisabled();
  });

  it("is not shown at all without a limit config (Premium is already unlimited)", () => {
    render(<CustomizePlanDialog open onOpenChange={() => {}} features={features} onSubmitted={() => {}} />);
    expect(screen.queryByText("Monthly appointments")).not.toBeInTheDocument();
  });

  it("lets a doctor ask for unlimited appointments on its own, with no feature change", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Unlimited" }));
    expect(send()).toBeEnabled();
    fireEvent.click(send());
    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith("submit_plan_request", { _add: [], _remove: [], _note: null, _appointments_limit: -1 }),
    );
  });

  it("sends a custom number", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Set a number" }));
    fireEvent.change(screen.getByLabelText("Appointments per month"), { target: { value: "300" } });
    fireEvent.click(send());
    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith("submit_plan_request", expect.objectContaining({ _appointments_limit: 300 })),
    );
  });

  it("blocks an unusable number and says why", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Set a number" }));
    const input = screen.getByLabelText("Appointments per month");
    fireEvent.change(input, { target: { value: "0" } });
    expect(send()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/whole number from 1 to 100000/i);
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(send()).toBeDisabled();
  });

  it("does not offer a request that changes nothing", () => {
    renderDialog(100);
    fireEvent.click(screen.getByRole("button", { name: "Set a number" }));
    fireEvent.change(screen.getByLabelText("Appointments per month"), { target: { value: "100" } });
    expect(send()).toBeDisabled();
  });

  it("disables 'Unlimited' when the doctor already has it", () => {
    renderDialog(null);
    expect(screen.getByRole("button", { name: "Unlimited" })).toBeDisabled();
    expect(screen.getByText(/unlimited appointments a month now/i)).toBeInTheDocument();
  });

  it("combines a feature change with a limit in one request", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("switch", { name: "Online Consultation" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlimited" }));
    fireEvent.click(send());
    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith("submit_plan_request", { _add: ["online_consultation"], _remove: [], _note: null, _appointments_limit: -1 }),
    );
  });
});
