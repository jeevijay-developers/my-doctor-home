import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomizePlanDialog } from "./CustomPlanSection";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "d1", plan_status: "active" } }) }));
vi.mock("@/hooks/useCustomPlan", () => ({ useCustomPlan: () => ({}) }));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ rows: [] }) }));

const features = [
  { key: "ai_blog_writer", label: "AI Blog Writer", description: "Write blogs", enabled: true },
  { key: "online_consultation", label: "Online Consultation", description: "Video visits", enabled: false },
];

describe("CustomizePlanDialog", () => {
  beforeEach(() => rpcMock.mockReset());

  it("blocks submit until something changes", () => {
    render(<CustomizePlanDialog open onOpenChange={() => {}} features={features} onSubmitted={() => {}} />);
    expect(screen.getByRole("button", { name: /change at least one feature/i })).toBeDisabled();
  });

  it("sends only the diff (and no price) to submit_plan_request", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const onSubmitted = vi.fn();
    render(<CustomizePlanDialog open onOpenChange={() => {}} features={features} onSubmitted={onSubmitted} />);

    fireEvent.click(screen.getByRole("switch", { name: "Online Consultation" }));
    fireEvent.click(screen.getByRole("switch", { name: "AI Blog Writer" }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith("submit_plan_request", {
        _add: ["online_consultation"],
        _remove: ["ai_blog_writer"],
        _note: null,
      }),
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });
});
