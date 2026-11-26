import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import VisitsTab from "./VisitsTab";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const who = vi.hoisted(() => ({ current: { role: "owner", myPractitionerId: null as string | null } }));
const prac = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ profile: { id: "doc-1" }, ...who.current }) }));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => prac.current ?? { isMulti: false, active: [], bookable: [], byId: () => undefined },
}));
vi.mock("sonner", () => ({ toast: { error: h.error, success: h.success, info: vi.fn() } }));

Element.prototype.scrollIntoView = vi.fn();

const A = { id: "pr-a", display_name: "Asha Rao", specialization: null, is_active: true, is_bookable: true };
const B = { id: "pr-b", display_name: "Vikram Mehta", specialization: null, is_active: true, is_bookable: true };
const multi = () => ({ isMulti: true, active: [A, B], bookable: [A, B], byId: () => undefined });

const insertedVisits = () =>
  mock.current.opsOf("patient_visits").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));

const openLog = async () => {
  render(<VisitsTab patientId="p1" doctorId="doc-1" patientPhone="" />);
  fireEvent.click(await screen.findByRole("button", { name: /log visit/i }));
  return screen.findByRole("dialog");
};

describe("VisitsTab - doctor of the visit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    who.current = { role: "owner", myPractitionerId: null };
    prac.current = null;
    mock.current = createTableMock();
    mock.current.tables.patient_visits = (ops: any[]) =>
      ops.some((o) => o[0] === "insert") ? { data: { id: "v1" }, error: null } : { data: [], error: null };
    mock.current.tables.patient_vitals = { data: [], error: null };
  });

  it("single-doctor clinic: no doctor choice and the insert is unchanged", async () => {
    const dialog = await openLog();
    expect(within(dialog).queryByRole("combobox", { name: "Doctor" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /log visit/i }));

    await waitFor(() => expect(insertedVisits()).toHaveLength(1));
    expect(insertedVisits()[0]).not.toHaveProperty("practitioner_id");
  });

  it("reception in a multi-doctor clinic must choose the doctor, and the insert carries it", async () => {
    who.current = { role: "staff", myPractitionerId: null };
    prac.current = multi();
    const dialog = await openLog();

    fireEvent.click(within(dialog).getByRole("button", { name: /log visit/i }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Please choose a doctor."));
    expect(insertedVisits()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /log visit/i }));

    await waitFor(() => expect(insertedVisits()).toHaveLength(1));
    expect(insertedVisits()[0]).toMatchObject({ patient_id: "p1", doctor_id: "doc-1", practitioner_id: "pr-b" });
  });

  it("a doctor login logs the visit as themselves without choosing", async () => {
    who.current = { role: "doctor", myPractitionerId: "pr-b" };
    prac.current = multi();
    const dialog = await openLog();
    expect(within(dialog).queryByRole("combobox", { name: "Doctor" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /log visit/i }));

    await waitFor(() => expect(insertedVisits()).toHaveLength(1));
    expect(insertedVisits()[0]).not.toHaveProperty("practitioner_id");
  });
});
