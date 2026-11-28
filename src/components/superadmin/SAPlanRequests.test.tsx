import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SAPlanRequests from "./SAPlanRequests";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissions } from "@/lib/superadminPermissions";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/hooks/usePlanPrices", () => ({ usePlanPrices: () => ({ proPrice: 1499, premiumPrice: 3999, loading: false }) }));

const doc = (over: Record<string, unknown> = {}) => ({
  full_name: "Dr Meera",
  clinic_name: "Meera Clinic",
  plan_tier: "pro",
  plan_status: "active",
  plan_end: "2027-01-15T00:00:00Z",
  ...over,
});

const request = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  doctor_id: "d1",
  base_tier: "pro",
  add_features: ["blog"],
  remove_features: [],
  doctor_note: "Need blog please",
  status: "pending",
  created_at: "2026-10-20T10:00:00Z",
  requested_appointments_limit: null,
  profiles: doc(),
  ...over,
});

const activePlan = (over: Record<string, unknown> = {}) => ({
  doctor_id: "d1",
  base_tier: "pro",
  extra_features: ["blog"],
  removed_features: [],
  monthly_price: 1999,
  monthly_appointments_limit: null,
  valid_from: "2020-01-01T00:00:00Z",
  valid_until: null,
  status: "active",
  profiles: doc(),
  ...over,
});

const seed = (opts: { requests?: any[]; plans?: any[] } = {}) => {
  const t = mock.current.tables;
  t.plan_requests = { data: opts.requests ?? [request()] };
  t.doctor_custom_plans = { data: opts.plans ?? [] };
  t.features = {
    data: [
      { key: "blog", label: "Blog", is_requestable: true, is_active: true },
      { key: "video", label: "Video", is_requestable: true, is_active: true },
    ],
  };
  mock.current.rpcs.get_doctor_feature_access = () => [{ feature_key: "video", effective_enabled: true }];
  mock.current.rpcs.review_plan_request = () => ({ data: null, error: null });
  mock.current.rpcs.cancel_custom_plan = () => ({ data: null, error: null });
  mock.current.rpcs.rebase_custom_plan = () => ({ data: null, error: null });
};

const renderPage = (isOwner: boolean, perms: SAPermissions = {}) =>
  render(
    <SuperAdminAccessProvider value={buildSuperAdminAccess(isOwner, perms)}>
      <SAPlanRequests />
    </SuperAdminAccessProvider>,
  );

const openTab = (name: RegExp) => {
  const tab = screen.getByRole("tab", { name });
  tab.focus();
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

const openReview = async () => {
  await screen.findAllByText("Dr Meera");
  fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
  return screen.findByRole("button", { name: "Approve" });
};

describe("SAPlanRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    seed();
  });

  it("lists pending requests with the doctor and requested change", async () => {
    renderPage(true, {});
    expect((await screen.findAllByText("Dr Meera")).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Pending \(1\)/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Need blog please/).length).toBeGreaterThan(0);
  });

  it("approving never sends a non-requestable feature the doctor already has (multi_doctor)", async () => {
    mock.current.tables.features = {
      data: [
        { key: "blog", label: "Blog", is_requestable: true, is_active: true },
        { key: "video", label: "Video", is_requestable: true, is_active: true },
        { key: "multi_doctor", label: "Multiple doctors", is_requestable: false, is_active: true },
      ],
    };
    mock.current.rpcs.get_doctor_feature_access = () => [
      { feature_key: "video", effective_enabled: true },
      { feature_key: "multi_doctor", effective_enabled: true },
    ];
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("review_plan_request", expect.anything()));
    const args = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "review_plan_request")[1];
    expect([...args._approved_features].sort()).toEqual(["blog", "video"]);
  });

  it("an active plan says whether social media marketing is included", async () => {
    seed({ requests: [], plans: [activePlan()] });
    mock.current.tables.custom_plan_social_marketing = { data: [] };
    renderPage(true);
    await screen.findByRole("tab", { name: /Active plans/ });
    openTab(/Active plans/);
    expect((await screen.findAllByText("Social media marketing: Not included")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Social marketing" }).length).toBeGreaterThan(0);
  });

  it("an active social media marketing record shows as Included", async () => {
    seed({ requests: [], plans: [activePlan()] });
    mock.current.tables.custom_plan_social_marketing = { data: [{ doctor_id: "d1", status: "active" }] };
    renderPage(true);
    await screen.findByRole("tab", { name: /Active plans/ });
    openTab(/Active plans/);
    expect((await screen.findAllByText("Social media marketing: Included")).length).toBeGreaterThan(0);
  });

  it("approving with the social media marketing switch on starts an empty draft", async () => {
    mock.current.tables.custom_plan_social_marketing = { data: [] };
    mock.current.rpcs.save_social_marketing_scope = () => ({ data: "draft", error: null });
    renderPage(true, {});
    await openReview();
    fireEvent.click(screen.getByRole("switch", { name: "Include social media marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("save_social_marketing_scope", expect.objectContaining({ _doctor_id: "d1", _platforms: [], _monthly_fee: null })));
    const order = mock.current.rpc.mock.calls.map((c: any[]) => c[0]).filter((n: string) => n === "review_plan_request" || n === "save_social_marketing_scope");
    expect(order).toEqual(["review_plan_request", "save_social_marketing_scope"]);
  });

  it("shows empty state with no pending requests", async () => {
    seed({ requests: [] });
    renderPage(true);
    expect(await screen.findByText("No requests waiting for review.")).toBeInTheDocument();
  });

  it("approve is blocked for an invalid (negative) price and sends nothing", async () => {
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/Monthly price/), { target: { value: "-5" } });
    fireEvent.click(approve);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a valid price" })));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("review_plan_request", expect.anything());
  });

  it("approve is blocked for an empty price", async () => {
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/Monthly price/), { target: { value: "" } });
    fireEvent.click(approve);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a valid price" })));
  });

  it("rejecting requires a reason shown to the doctor", async () => {
    renderPage(true);
    await openReview();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Add a reason" })));
    expect(mock.current.rpc).not.toHaveBeenCalledWith("review_plan_request", expect.anything());
  });

  it("rejecting with a reason calls review_plan_request(reject) with the note and no features/price", async () => {
    renderPage(true);
    await openReview();
    const note = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.change(note, { target: { value: "Not available on this tier" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("review_plan_request", expect.anything()));
    const args = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "review_plan_request")[1];
    expect(args).toMatchObject({
      _request_id: "r1", _decision: "reject", _approved_features: null, _price: null, _note: "Not available on this tier",
    });
    expect(args).not.toHaveProperty("_appointments_limit");
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Request rejected" })));
  });

  it("a database refusal on approve shows a destructive toast and keeps the review dialog open", async () => {
    mock.current.rpcs.review_plan_request = () => ({ data: null, error: { message: "custom plans need a paid plan" } });
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not save decision", description: "custom plans need a paid plan", variant: "destructive" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("rejects an end date in the past", async () => {
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "2020-01-01" } });
    fireEvent.click(approve);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "End date must be in the future" })));
  });

  it("approves with the requested features + current ones, standard price default, IST end-of-day", async () => {
    renderPage(true);
    const approve = await openReview();
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.getByLabelText(/Monthly price/)).toHaveValue(1499);
    fireEvent.change(screen.getByLabelText(/Monthly price/), { target: { value: "1999" } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "2999-03-10" } });
    fireEvent.click(approve);
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("review_plan_request", expect.anything()));
    const args = mock.current.rpc.mock.calls.find((c: any[]) => c[0] === "review_plan_request")[1];
    expect(args._request_id).toBe("r1");
    expect(args._decision).toBe("approve");
    expect(args._price).toBe(1999);
    expect([...args._approved_features].sort()).toEqual(["blog", "video"]);
    // 23:59:59 IST == 18:29:59 UTC the same calendar day
    expect(args._valid_until).toBe("2999-03-10T18:29:59.000Z");
    // a Pro doctor always sends an explicit appointment limit (0 = standard)
    expect(args._appointments_limit).toBe(0);
  });

  it("view-only team members cannot approve, reject or toggle features", async () => {
    renderPage(false, { "plan_requests.view": true });
    await openReview().catch(() => null);
    expect(await screen.findByText(/view-only access/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Blog" })).toBeDisabled();
  });

  it("approve is disabled for a doctor on the free tier", async () => {
    seed({ requests: [request({ profiles: doc({ plan_tier: "free" }) })] });
    renderPage(true);
    const approve = await openReview();
    expect(approve).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/free tier/);
  });

  describe("active plans tab", () => {
    beforeEach(() => seed({ requests: [], plans: [activePlan()] }));

    it("shows ₹ price and the standard price, with End/Edit for managers", async () => {
      renderPage(false, { "plan_requests.view": true, "plan_requests.manage": true });
      await screen.findByRole("tab", { name: /Active plans/ });
      openTab(/Active plans/);
      expect((await screen.findAllByText("₹1999")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("std ₹1499").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "End" }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
    });

    it("hides End/Edit from view-only team members", async () => {
      renderPage(false, { "plan_requests.view": true });
      await screen.findByRole("tab", { name: /Active plans/ });
      openTab(/Active plans/);
      await screen.findAllByText("₹1999");
      expect(screen.queryByRole("button", { name: "End" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    });

    it("ending a plan needs confirmation then calls cancel_custom_plan for that doctor", async () => {
      renderPage(true);
      await screen.findByRole("tab", { name: /Active plans/ });
      openTab(/Active plans/);
      fireEvent.click((await screen.findAllByRole("button", { name: "End" }))[0]);
      expect(mock.current.rpc).not.toHaveBeenCalledWith("cancel_custom_plan", expect.anything());
      fireEvent.click(await screen.findByRole("button", { name: "End plan" }));
      await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("cancel_custom_plan", { _doctor_id: "d1" }));
    });

    it("flags a plan built on another tier as not applied and offers Apply to <tier> to managers only", async () => {
      seed({ requests: [], plans: [activePlan({ base_tier: "premium" })] });
      const { unmount } = renderPage(true);
      await screen.findByRole("tab", { name: /Active plans/ });
      openTab(/Active plans/);
      expect((await screen.findAllByText(/Not applied: built on premium, doctor is on pro/)).length).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: "Apply to pro" }).length).toBeGreaterThan(0);
      unmount();
      renderPage(false, { "plan_requests.view": true });
      await screen.findByRole("tab", { name: /Active plans/ });
      openTab(/Active plans/);
      await screen.findAllByText(/Not applied/);
      expect(screen.queryByRole("button", { name: "Apply to pro" })).not.toBeInTheDocument();
    });
  });

  describe("Import limits tab", () => {
    it("shows the pending import-limit count on the tab and opens the list", async () => {
      mock.current.tables.patient_import_requests = (ops: any[]) =>
        ops.some((o) => o[0] === "select" && o[2]?.head)
          ? { data: null, count: 3 }
          : { data: [{ id: "i1", doctor_id: "d1", requested_cap: 5000, doctor_note: null, patient_count: 10, cap_at_request: 2000, status: "pending",
              approved_cap: null, reviewer_note: null, decided_at: null, created_at: "2026-11-20T10:00:00Z", profiles: { full_name: "Dr Imp", clinic_name: null, plan_tier: "pro" } }] };
      renderPage(true);
      expect(await screen.findByRole("tab", { name: "Import limits (3)" })).toBeInTheDocument();
      openTab(/Import limits/);
      expect((await screen.findAllByText("Dr Imp")).length).toBeGreaterThan(0);
    });
  });
});
