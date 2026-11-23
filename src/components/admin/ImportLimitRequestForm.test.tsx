import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ImportLimitRequestForm from "./ImportLimitRequestForm";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const access = { eligible: true, reason: "ok" as const, cap: 2000, patient_count: 1900, remaining: 100 };
const onRequested = vi.fn();
const FUTURE = "2099-12-01T00:00:00Z";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
const rpcCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "request_patient_import_limit");
const numberField = () => screen.getByLabelText(/patients you need to hold/i) as HTMLInputElement;
const send = () => fireEvent.click(screen.getByRole("button", { name: /send request/i }));
const renderForm = (a: any = access, needed = 300) => render(<ImportLimitRequestForm access={a} needed={needed} onRequested={onRequested} />);

describe("ImportLimitRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: true, id: "r1" }, error: null });
  });

  it("starts from what this file needs and sends the request with the note", async () => {
    renderForm();
    expect(numberField().value).toBe("2200");
    fireEvent.change(numberField(), { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText(/why do you need/i), { target: { value: "  Moving my old clinic list  " } });
    send();
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(mock.current.rpc).toHaveBeenCalledWith("request_patient_import_limit", { _requested: 2500, _note: "Moving my old clinic list" });
  });

  it("hints, without blocking, when the number is below what the file needs", async () => {
    renderForm();
    expect(screen.queryByText(/your file needs at least/i)).not.toBeInTheDocument();
    fireEvent.change(numberField(), { target: { value: "2100" } });
    expect(screen.getByText(/your file needs at least 2,200, requesting less means you may have to ask again/i)).toBeInTheDocument();
    send();
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(rpcCalls()[0][1]._requested).toBe(2100);
  });

  it("sends no note when it is empty or only spaces", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/why do you need/i), { target: { value: "   \n " } });
    send();
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(rpcCalls()[0][1]._note).toBeNull();
  });

  it("will not send a number that is not above the current limit", async () => {
    renderForm();
    fireEvent.change(numberField(), { target: { value: "1500" } });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(/above your current limit of 2,000/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("will not send an empty number or one equal to the limit", async () => {
    renderForm();
    fireEvent.change(numberField(), { target: { value: "" } });
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(/above your current limit/);
    fireEvent.change(numberField(), { target: { value: "2000" } });
    send();
    expect(rpcCalls()).toHaveLength(0);
  });

  it("keeps only digits in the number field", () => {
    renderForm();
    fireEvent.change(numberField(), { target: { value: "2,5e0.0-1" } });
    expect(numberField().value).toBe("25001");
  });

  it("reads leading zeros as the plain number", async () => {
    renderForm();
    fireEvent.change(numberField(), { target: { value: "002500" } });
    send();
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(rpcCalls()[0][1]._requested).toBe(2500);
  });

  it("never sends a huge number that would lose precision", async () => {
    renderForm();
    fireEvent.change(numberField(), { target: { value: "99999999999999999999" } });
    expect(numberField().value.length).toBeLessThanOrEqual(9);
    send();
    await waitFor(() => expect(rpcCalls().length + screen.queryAllByRole("alert").length).toBeGreaterThan(0));
    for (const c of rpcCalls()) expect(Number.isSafeInteger(c[1]._requested)).toBe(true);
  });

  it("copes with missing numbers and an empty file (needed 0)", () => {
    renderForm({ eligible: true, reason: "ok" }, 0);
    expect(numberField().value).toBe("1");
    send();
  });

  it("never sends below cap + 1 as the starting number", () => {
    renderForm(access, 0);
    expect(numberField().value).toBe("2001");
  });

  it("cuts a pasted note to 1000 characters", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/why do you need/i), { target: { value: "a".repeat(1500) } });
    send();
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(rpcCalls()[0][1]._note).toHaveLength(1000);
  });

  it("sends only one request when Send is clicked twice quickly", async () => {
    const d = deferred<any>();
    mock.current.rpcs.request_patient_import_limit = () => d.promise;
    renderForm();
    const btn = screen.getByRole("button", { name: /send request/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(rpcCalls()).toHaveLength(1);
    await act(async () => d.resolve({ data: { ok: true, id: "r1" }, error: null }));
    expect(onRequested).toHaveBeenCalledTimes(1);
  });

  it("shows the waiting message after sending, so it cannot be sent twice before the refresh", async () => {
    renderForm();
    send();
    expect(await screen.findByText(/request is waiting for review/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
  });

  it("explains a cooldown refusal from the server and offers no retry", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "COOLDOWN", until: FUTURE }, error: null });
    renderForm();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(/ask again on/i);
    expect(onRequested).not.toHaveBeenCalled();
  });

  it("explains a cooldown refusal even when the date is missing", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "COOLDOWN" }, error: null });
    renderForm();
    send();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not approved/i);
    expect(alert).not.toHaveTextContent(/invalid/i);
  });

  it("uses the server's cap and ceiling when the number is refused", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "BAD_NUMBER", cap: 2000, ceiling: 100000 }, error: null });
    renderForm();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(/above 2,000 and up to 1,00,000/);
  });

  it("shows the waiting message when the server says a request is already pending", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "ALREADY_PENDING" }, error: null });
    renderForm();
    send();
    expect(await screen.findByText(/request is waiting for review/i)).toBeInTheDocument();
    expect(onRequested).toHaveBeenCalled();
  });

  it("shows a general message for an unknown error code and allows trying again", async () => {
    mock.current.rpcs.request_patient_import_limit = () => ({ data: { ok: false, error: "WEIRD" }, error: null });
    renderForm();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not send the request/i);
    expect(screen.getByRole("button", { name: /send request/i })).toBeEnabled();
  });

  it("shows a general message when the call returns an error, returns nothing, or throws", async () => {
    for (const handler of [
      () => ({ data: null, error: { message: "down" } }),
      () => ({ data: null, error: null }),
      () => { throw new Error("network"); },
    ]) {
      mock.current = createTableMock();
      mock.current.rpcs.request_patient_import_limit = handler;
      const { unmount } = renderForm();
      send();
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not send the request/i);
      expect(screen.getByRole("button", { name: /send request/i })).toBeEnabled();
      unmount();
    }
    expect(onRequested).not.toHaveBeenCalled();
  });

  it("shows a pending request instead of the form", () => {
    renderForm({ ...access, pending_request: true });
    expect(screen.getByText(/request is waiting for review/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
  });

  it("shows when the clinic can ask again after a decline", () => {
    renderForm({ ...access, cooldown_until: FUTURE });
    expect(screen.getByText(/you can ask again on/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send request/i })).not.toBeInTheDocument();
  });

  it("treats a cooldown date in the past, or an unreadable one, as no cooldown", () => {
    for (const cooldown_until of ["2020-01-01T00:00:00Z", "garbage"]) {
      const { unmount } = renderForm({ ...access, cooldown_until });
      expect(screen.getByRole("button", { name: /send request/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("shows nothing for a clinic that cannot import", () => {
    const { container } = renderForm({ eligible: false, reason: "plan" });
    expect(container).toBeEmptyDOMElement();
  });
});
