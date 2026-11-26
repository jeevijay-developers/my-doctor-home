import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SADoctorSeatsCard from "./SADoctorSeatsCard";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast }));

const ON = { enabled: true, has_feature: true, seat_limit: 3, seats_used: 2, extra_seats: 2, seat_max: 15, seat_price: null };
const setCalls = () => mock.current.rpc.mock.calls.filter((c: any[]) => c[0] === "set_clinic_doctor_seats");

describe("SADoctorSeatsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.rpcs.get_clinic_doctor_access = () => ({ data: ON, error: null });
    mock.current.rpcs.set_clinic_doctor_seats = () => ({ data: { ok: true, seat_limit: 4 }, error: null });
    mock.current.tables.practitioners = {
      data: [
        { id: "p1", display_name: "Dr. Asha Rao", is_primary: true, is_active: true, is_bookable: true },
        { id: "p2", display_name: "Dr. Vikram Shah", is_primary: false, is_active: true, is_bookable: true },
      ],
      error: null,
    };
  });

  it("loads and shows seats used of the limit, extra seats and the doctors", async () => {
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    expect(await screen.findByText(/multiple doctors is on/i)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 seats in use/i)).toBeInTheDocument();
    expect(screen.getByText(/2 extra seats/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Asha Rao/)).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Vikram Shah/)).toBeInTheDocument();
    expect(mock.current.rpc).toHaveBeenCalledWith("get_clinic_doctor_access", { _doctor_id: "d1" });
    expect(mock.current.hasOp(mock.current.opsOf("practitioners")[0], "eq", "doctor_id", "d1")).toBe(true);
  });

  it("explains why it is off when the plan lacks the feature", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ data: { ...ON, enabled: false, has_feature: false, seat_limit: 1 }, error: null });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    expect(await screen.findByText(/multiple doctors is off/i)).toBeInTheDocument();
    expect(screen.getByText(/plan does not include multiple doctors/i)).toBeInTheDocument();
  });

  it("explains why it is off when the launch flag is off and there is no pilot", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ data: { ...ON, enabled: false, has_feature: true, seat_limit: 1 }, error: null });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    expect(await screen.findByText(/multiple doctors is off/i)).toBeInTheDocument();
    expect(screen.getByText(/not launched yet and this clinic is not in the pilot/i)).toBeInTheDocument();
    expect(screen.getByText(/enable 'Multiple doctors' in Feature access above/i)).toBeInTheDocument();
  });

  it("shows an inline error with retry when loading fails", async () => {
    let fail = true;
    mock.current.rpcs.get_clinic_doctor_access = () => (fail ? { data: null, error: { message: "boom" } } : { data: ON, error: null });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/multiple doctors is on/i)).toBeInTheDocument();
  });

  it("treats a FORBIDDEN answer as a load error", async () => {
    mock.current.rpcs.get_clinic_doctor_access = () => ({ data: { error: "FORBIDDEN" }, error: null });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
  });

  it("disables Save until a reason is given", async () => {
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    const save = await screen.findByRole("button", { name: /^save$/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Pilot clinic" } });
    expect(save).toBeEnabled();
  });

  it("saves extra seats with the trimmed reason", async () => {
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    const input = await screen.findByLabelText(/extra seats/i);
    expect(input).toHaveValue(2);
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "  Paid for 3 " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(mock.current.rpc).toHaveBeenCalledWith("set_clinic_doctor_seats", { _doctor_id: "d1", _extra: 3, _reason: "Paid for 3" }),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Seats saved" })));
  });

  it("sends only one request on a double click", async () => {
    let release: (v: unknown) => void = () => {};
    mock.current.rpcs.set_clinic_doctor_seats = () => new Promise((r) => { release = r; });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: "x" } });
    const save = screen.getByRole("button", { name: /^save$/i });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(setCalls()).toHaveLength(1);
    release({ data: { ok: true, seat_limit: 3 }, error: null });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Seats saved" })));
  });

  it.each([
    ["FORBIDDEN", /not allowed/i],
    ["INVALID", /between 0 and 14/i],
    ["REASON_REQUIRED", /add a reason/i],
  ])("maps the %s error to a message", async (code, text) => {
    mock.current.rpcs.set_clinic_doctor_seats = () => ({ data: { ok: false, error: code }, error: null });
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    fireEvent.change(await screen.findByLabelText(/reason/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not save", description: expect.stringMatching(text) })),
    );
  });

  it("refuses an out-of-range number without calling the server", async () => {
    render(<SADoctorSeatsCard doctorId="d1" canManage />);
    fireEvent.change(await screen.findByLabelText(/extra seats/i), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/between 0 and 14/i) }));
    expect(setCalls()).toHaveLength(0);
  });

  it("is read-only when the viewer cannot manage", async () => {
    render(<SADoctorSeatsCard doctorId="d1" canManage={false} />);
    await screen.findByText(/2 of 3 seats in use/i);
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });
});
