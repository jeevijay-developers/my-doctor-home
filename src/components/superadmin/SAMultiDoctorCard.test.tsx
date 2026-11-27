import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SAMultiDoctorCard from "./SAMultiDoctorCard";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));
const logAdminAction = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction }));

const settingsRows = (over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    multi_doctor_enabled: false,
    doctor_seat_price: null,
    doctor_seat_max: 10,
    trial_extra_doctor_seats: 1,
    ...over,
  };
  return Object.entries(base).map(([key, value]) => ({ key, value }));
};

// set_multi_doctor_settings call recorder: the `_changes` object of every call.
const changeCalls = () =>
  mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "set_multi_doctor_settings").map((c: any[]) => c[1]._changes);

const renderCard = (canManage = true) =>
  render(
    <SuperAdminAccessProvider value={buildSuperAdminAccess(false, canManage ? { "flags.manage": true } : {})}>
      <SAMultiDoctorCard />
    </SuperAdminAccessProvider>,
  );

describe("SAMultiDoctorCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.set_multi_doctor_settings = (args: any) => ({ data: { ok: true, changed: Object.keys(args._changes) }, error: null });
    mock.current.tables.platform_settings = { data: settingsRows(), error: null };
    mock.current.tables.doctor_feature_overrides = {
      data: [
        { doctor_id: "a", expires_at: null },
        { doctor_id: "b", expires_at: "2000-01-01T00:00:00Z" },
        { doctor_id: "c", expires_at: "2999-01-01T00:00:00Z" },
      ],
      error: null,
    };
    mock.current.tables.practitioners = {
      data: [{ doctor_id: "a" }, { doctor_id: "a" }, { doctor_id: "b" }, { doctor_id: "c" }, { doctor_id: "c" }, { doctor_id: "c" }],
      error: null,
    };
  });

  it("loads current values and the counters", async () => {
    mock.current.tables.platform_settings = { data: settingsRows({ doctor_seat_price: 499, doctor_seat_max: 12, trial_extra_doctor_seats: 2 }), error: null };
    renderCard();
    expect(await screen.findByLabelText(/price per extra doctor/i)).toHaveValue("499");
    expect(screen.getByLabelText(/maximum doctors/i)).toHaveValue("12");
    expect(screen.getByLabelText(/extra doctors during trial/i)).toHaveValue("2");
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(await screen.findByTestId("override-count")).toHaveTextContent("2");
    expect(await screen.findByTestId("multi-count")).toHaveTextContent("2");
  });

  it("turning ON needs the typed word LAUNCH and then writes true", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("switch"));
    expect(await screen.findByText(/launching enables multiple doctors for every premium clinic, including clinics on a premium trial/i)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: /launch now/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type launch/i), { target: { value: "launch" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type launch/i), { target: { value: "LAUNCH" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(changeCalls()).toHaveLength(1));
    expect(changeCalls()[0]).toEqual({ multi_doctor_enabled: true });
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(logAdminAction).not.toHaveBeenCalled(); // the database trigger audits
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/launched|saved/i) }));
  });

  it("turning OFF uses a normal confirm and writes false", async () => {
    mock.current.tables.platform_settings = { data: settingsRows({ multi_doctor_enabled: true }), error: null };
    renderCard();
    const sw = await screen.findByRole("switch");
    await waitFor(() => expect(sw).toBeChecked());
    fireEvent.click(sw);
    expect(await screen.findByText(/extra doctors stop taking new bookings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/type launch/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /switch off/i }));
    await waitFor(() => expect(changeCalls()).toHaveLength(1));
    expect(changeCalls()[0]).toEqual({ multi_doctor_enabled: false });
  });

  it("saves only changed keys and clears the price to null", async () => {
    mock.current.tables.platform_settings = { data: settingsRows({ doctor_seat_price: 499 }), error: null };
    renderCard();
    const price = await screen.findByLabelText(/price per extra doctor/i);
    await waitFor(() => expect(price).toHaveValue("499"));
    fireEvent.change(price, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(changeCalls()).toHaveLength(1));
    expect(changeCalls()[0]).toEqual({ doctor_seat_price: null });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each([
    ["0", /price/i],
    ["-5", /price/i],
    ["abc", /price/i],
  ])("rejects price %s", async (value) => {
    renderCard();
    const price = await screen.findByLabelText(/price per extra doctor/i);
    fireEvent.change(price, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByText(/positive amount|enter a number|price must/i)).toBeInTheDocument();
    expect(changeCalls()).toHaveLength(0);
  });

  it("rejects out-of-range seat max and trial seats", async () => {
    renderCard();
    const max = await screen.findByLabelText(/maximum doctors/i);
    fireEvent.change(max, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByText(/between 2 and 50/i)).toBeInTheDocument();
    fireEvent.change(max, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/extra doctors during trial/i), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByText(/between 0 and 5/i)).toBeInTheDocument();
    expect(changeCalls()).toHaveLength(0);
  });

  it("is read-only without flags.manage", async () => {
    renderCard(false);
    const sw = await screen.findByRole("switch");
    expect(sw).toBeDisabled();
    expect(screen.getByLabelText(/price per extra doctor/i)).toBeDisabled();
    expect(screen.getByLabelText(/maximum doctors/i)).toBeDisabled();
    expect(screen.getByLabelText(/extra doctors during trial/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save settings/i })).toBeNull();
  });

  it("shows an error toast when the call fails", async () => {
    renderCard();
    const max = await screen.findByLabelText(/maximum doctors/i);
    fireEvent.change(max, { target: { value: "20" } });
    mock.current.rpcs.set_multi_doctor_settings = () => ({ data: null, error: { message: "denied" } });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: "denied" })));
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("names the key when the database answers INVALID_VALUE", async () => {
    renderCard();
    const max = await screen.findByLabelText(/maximum doctors/i);
    fireEvent.change(max, { target: { value: "20" } });
    mock.current.rpcs.set_multi_doctor_settings = () => ({ data: { ok: false, error: "INVALID_VALUE", key: "doctor_seat_max" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", description: expect.stringMatching(/invalid value for maximum doctors per clinic/i) })));
  });

  it("explains FORBIDDEN", async () => {
    renderCard();
    const max = await screen.findByLabelText(/maximum doctors/i);
    fireEvent.change(max, { target: { value: "20" } });
    mock.current.rpcs.set_multi_doctor_settings = () => ({ data: { ok: false, error: "FORBIDDEN" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/permission/i) })));
  });

  it("shows a dash for counters that fail to load", async () => {
    mock.current.tables.doctor_feature_overrides = { data: null, error: { message: "x" } };
    mock.current.tables.practitioners = { data: null, error: { message: "x" } };
    renderCard();
    expect(await screen.findByTestId("override-count")).toHaveTextContent("—");
    expect(await screen.findByTestId("multi-count")).toHaveTextContent("—");
  });
});
