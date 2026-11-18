import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrescriptionsPage from "./PrescriptionsPage";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "doc-1", full_name: "Dr Test" };
  return { useProfile: () => ({ profile, isStaff: false, can: () => true }) };
});
vi.mock("@/contexts/TrialStatusContext", () => ({ useTrialStatus: () => ({ accessLevel: "full" }) }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: h.success, info: vi.fn() } }));

// jsdom does not implement scrollIntoView, which Radix Select calls when an option is focused.
Element.prototype.scrollIntoView = vi.fn();

const PATIENTS = [
  { id: "p1", name: "Aaryan", phone: "8871876376", gender: "male", age: 34, weight: 62.5 },
  { id: "p2", name: "Meena", phone: "9876543211", gender: "female", age: null, weight: null },
];

const savedRows = () =>
  mock.current.opsOf("prescriptions").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));

const openNew = async () => {
  render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /new prescription/i }));
  return screen.findByRole("dialog");
};

const choosePatient = async (dialog: HTMLElement, label: string) => {
  fireEvent.click(await within(dialog).findByRole("combobox", { name: /patient/i }));
  fireEvent.click(await screen.findByRole("option", { name: label }));
};

describe("PrescriptionsPage - Add Prescription patient fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.tables.patients = { data: PATIENTS, error: null };
    mock.current.tables.prescriptions = (ops: any[]) =>
      ops.some((o) => o[0] === "insert")
        ? { data: { id: "rx1", patient_id: "p1", patient_name: "Aaryan", date: "2026-11-18", medicines: [] }, error: null }
        : { data: [], count: 0, error: null };
  });

  it("asks for the patient name when no patient is selected", async () => {
    const dialog = await openNew();
    expect(within(dialog).getByLabelText(/patient name/i)).toBeInTheDocument();
  });

  it("autofills age and weight from the selected patient and hides the name field", async () => {
    const dialog = await openNew();

    await choosePatient(dialog, "Aaryan (8871876376)");

    expect(within(dialog).queryByLabelText(/patient name/i)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Age")).toHaveValue("34");
    expect(within(dialog).getByLabelText(/weight/i)).toHaveValue("62.5");
  });

  it("leaves age and weight blank and editable when the patient record has none", async () => {
    const dialog = await openNew();

    await choosePatient(dialog, "Meena (9876543211)");

    expect(within(dialog).getByLabelText("Age")).toHaveValue("");
    expect(within(dialog).getByLabelText(/weight/i)).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Age"), { target: { value: "29" } });
    expect(within(dialog).getByLabelText("Age")).toHaveValue("29");
  });

  it("replaces the previous patient's age and weight when another patient is chosen", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    await choosePatient(dialog, "Meena (9876543211)");

    expect(within(dialog).getByLabelText("Age")).toHaveValue("");
    expect(within(dialog).getByLabelText(/weight/i)).toHaveValue("");
  });

  it("clears the patient, brings back the name field and empties the vitals", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.click(within(dialog).getByRole("button", { name: /clear patient/i }));

    expect(within(dialog).getByLabelText(/patient name/i)).toHaveValue("");
    expect(within(dialog).getByLabelText("Age")).toHaveValue("");
    expect(within(dialog).getByLabelText(/weight/i)).toHaveValue("");
    expect(within(dialog).queryByRole("button", { name: /clear patient/i })).not.toBeInTheDocument();
  });

  it("saves the linked patient with their name, age and weight without asking for a name", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ doctor_id: "doc-1", patient_id: "p1", patient_name: "Aaryan", patient_age: 34, patient_weight: 62.5 });
    expect(h.error).not.toHaveBeenCalled();
  });

  it("saves today's weight when the doctor corrects the autofilled value", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.change(within(dialog).getByLabelText(/weight/i), { target: { value: "64" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ patient_age: 34, patient_weight: 64 });
  });

  it("still requires a name when no patient is selected", async () => {
    const dialog = await openNew();

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Patient name is required"));
    expect(savedRows()).toHaveLength(0);
  });

  it("rejects an out-of-range age or weight", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.change(within(dialog).getByLabelText("Age"), { target: { value: "150" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(expect.stringMatching(/valid age/i)));

    fireEvent.change(within(dialog).getByLabelText("Age"), { target: { value: "40" } });
    fireEvent.change(within(dialog).getByLabelText(/weight/i), { target: { value: "900" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(expect.stringMatching(/between/)));
    expect(savedRows()).toHaveLength(0);
  });
});
