import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SocialMarketingDialog from "./SocialMarketingDialog";
import { emptyScope, type SocialMarketing } from "@/lib/socialMarketing";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const complete = (over: Partial<SocialMarketing> = {}): SocialMarketing => ({
  ...emptyScope(),
  status: "draft",
  platforms: ["instagram"],
  posts_per_month: 8,
  post_types: ["reel"],
  publishing_by: "company",
  reporting_frequency: "monthly",
  approval_process: "each_post",
  monthly_fee: 5000,
  access_confirmed: true,
  agreed: true,
  agreed_on: "2026-11-27",
  agreement_ref: "WhatsApp",
  ...over,
});

const renderDialog = (row: SocialMarketing | null, canManage = true) => {
  const onDone = vi.fn();
  render(<SocialMarketingDialog doctorId="d1" doctorName="Dr Meera" row={row} canManage={canManage} onClose={vi.fn()} onDone={onDone} />);
  return { onDone };
};

describe("SocialMarketingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.save_social_marketing_scope = () => ({ data: "draft", error: null });
    mock.current.rpcs.activate_social_marketing = () => ({ data: null, error: null });
    mock.current.rpcs.end_social_marketing = () => ({ data: null, error: null });
  });

  it("an empty scope lists what is missing and cannot be activated", () => {
    renderDialog(null);
    expect(screen.getByText(/Still missing/)).toBeInTheDocument();
    expect(screen.getByText("Monthly service fee")).toBeInTheDocument();
    expect(screen.getByText("Client agreement (date and reference)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save & activate/ })).toBeDisabled();
  });

  it("says the fee is billed separately", () => {
    renderDialog(null);
    expect(screen.getByText(/billed separately by Sales/i)).toBeInTheDocument();
  });

  it("a complete scope can be saved and activated", async () => {
    const { onDone } = renderDialog(complete());
    expect(screen.getByText("Everything is documented.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save & activate/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const calls = mock.current.rpc.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual(["save_social_marketing_scope", "activate_social_marketing"]);
    const args = mock.current.rpc.mock.calls[0][1];
    expect(args).toMatchObject({ _doctor_id: "d1", _monthly_fee: 5000, _platforms: ["instagram"], _agreement_ref: "WhatsApp" });
  });

  it("does not activate when saving fails", async () => {
    mock.current.rpcs.save_social_marketing_scope = () => ({ data: null, error: { message: "needs an active custom plan" } });
    const { onDone } = renderDialog(complete());
    fireEvent.click(screen.getByRole("button", { name: /Save & activate/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save the scope" })));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("activate_social_marketing", expect.anything());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ticking paid ads makes the ad spend required", () => {
    renderDialog(complete());
    fireEvent.click(screen.getByLabelText("Paid advertising included"));
    expect(screen.getByText("Monthly ad spend (paid ads are included)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save & activate/ })).toBeDisabled();
  });

  it("an active record offers End service and no activate button", async () => {
    const { onDone } = renderDialog(complete({ status: "active" }));
    expect(screen.queryByRole("button", { name: /Save & activate/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End service" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.current.rpc).toHaveBeenCalledWith("end_social_marketing", { _doctor_id: "d1" });
  });

  it("view-only users cannot change or activate anything", () => {
    renderDialog(complete(), false);
    expect(screen.getByRole("button", { name: "Save scope" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save & activate/ })).toBeDisabled();
    expect(screen.getByText(/view-only access/)).toBeInTheDocument();
  });
});
