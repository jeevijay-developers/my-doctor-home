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
const who = vi.hoisted(() => ({
  current: { isStaff: false, role: "owner", myPractitionerId: null as string | null },
}));
const prac = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "doc-1", full_name: "Dr Test", clinic_name: "Test Clinic" };
  return { useProfile: () => ({ profile, can: () => true, ...who.current }) };
});
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () =>
    prac.current ?? { isMulti: false, active: [], bookable: [], practitioners: [], byId: () => undefined },
}));
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
  // The picker closes and shows the choice.
  await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Patient" })).toHaveTextContent(label));
};

describe("PrescriptionsPage - Add Prescription patient fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    who.current = { isStaff: false, role: "owner", myPractitionerId: null };
    prac.current = null;
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
    // Single-doctor clinics send exactly what they did before practitioners existed.
    expect(savedRows()[0]).not.toHaveProperty("practitioner_id");
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

// ---- Multi-doctor clinics ----

const OWNER_PR = {
  id: "pr-own", user_id: "doc-1", display_name: "Test", qualifications: null, specialization: null,
  registration_number: null, signature_url: null, is_active: true, is_bookable: true, is_primary: true,
};
const VIKRAM = {
  id: "pr-vik", user_id: "u-vik", display_name: "Vikram Mehta", qualifications: "MBBS, MD", specialization: "Dermatologist",
  registration_number: "MMC-42", signature_url: null, is_active: true, is_bookable: true, is_primary: false,
};
const multiState = () => {
  const all = [OWNER_PR, VIKRAM];
  const map = new Map(all.map((p) => [p.id, p]));
  return {
    practitioners: all, active: all, bookable: all, primary: OWNER_PR, access: { enabled: true },
    isMulti: true, loading: false, refetch: vi.fn(), byId: (id: string | null | undefined) => (id ? map.get(id) : undefined),
  };
};

const RX_BY_VIKRAM = {
  id: "rx-v", doctor_id: "doc-1", practitioner_id: "pr-vik", patient_id: null, patient_name: "Kiran",
  diagnosis: "Eczema", medications: null, notes: null, date: "2026-11-25", created_at: "2026-11-25T10:00:00Z",
  patient_age: 30, patient_weight: null, visit_id: null, medicines: [], advice: null, diet_advice: null,
  lifestyle_advice: null, follow_up_date: null, follow_up_instructions: null,
};
const RX_BY_OWNER = { ...RX_BY_VIKRAM, id: "rx-o", practitioner_id: "pr-own", patient_name: "Ravi" };

const openRx = async (name: string) => {
  fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(`View prescription for ${name}`) }))[0]);
  return screen.findByRole("dialog");
};

describe("PrescriptionsPage - multi-doctor clinic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    who.current = { isStaff: false, role: "owner", myPractitionerId: "pr-own" };
    prac.current = multiState();
    mock.current = createTableMock();
    mock.current.tables.patients = { data: PATIENTS, error: null };
    mock.current.tables.prescriptions = (ops: any[]) =>
      ops.some((o) => o[0] === "insert")
        ? { data: { id: "rx1", patient_id: "p1", patient_name: "Aaryan", date: "2026-11-18", medicines: [] }, error: null }
        : { data: [RX_BY_VIKRAM, RX_BY_OWNER], count: 2, error: null };
  });

  it("reception must pick the prescribing doctor before saving, and the payload carries it", async () => {
    who.current = { isStaff: true, role: "staff", myPractitionerId: null };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("Please choose a doctor."));
    expect(savedRows()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Prescribing doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ doctor_id: "doc-1", patient_id: "p1", practitioner_id: "pr-vik" });
  });

  it("a doctor login writes without choosing, and the database fills the author", async () => {
    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-vik" };
    const dialog = await openNew();
    expect(within(dialog).queryByRole("combobox", { name: "Prescribing doctor" })).not.toBeInTheDocument();
    await choosePatient(dialog, "Aaryan (8871876376)");

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).not.toHaveProperty("practitioner_id");
  });

  it("shows each prescription's author and filters the list by doctor", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    expect((await screen.findAllByText("Dr. Vikram Mehta")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("combobox", { name: "Filter by doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));

    await waitFor(() =>
      expect(mock.current.opsOf("prescriptions").some((q: any) => mock.current.hasOp(q, "eq", "practitioner_id", "pr-vik"))).toBe(true),
    );
  });

  it("hides Edit on another doctor's prescription for a doctor login, but not on their own", async () => {
    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-own" };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);

    const sheet = await openRx("Kiran");
    expect(within(sheet).getByRole("button", { name: /view/i })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it("a doctor login can edit their own prescription", async () => {
    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-own" };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    const sheet = await openRx("Ravi");
    expect(within(sheet).getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });

  it("the owner can still edit another doctor's prescription", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    const sheet = await openRx("Kiran");
    expect(within(sheet).getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });

  it("the slip names the prescribing doctor with their registration number", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    const sheet = await openRx("Kiran");
    fireEvent.click(within(sheet).getByRole("button", { name: /view/i }));

    expect((await screen.findAllByText("Dr. Vikram Mehta")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reg. No.: MMC-42").length).toBeGreaterThan(0);
    expect(screen.getByText("Test Clinic")).toBeInTheDocument();
  });
  it("the owner (who has their own doctor row) must still choose the prescribing doctor, and it is sent", async () => {
    const dialog = await openNew();
    const select = within(dialog).getByRole("combobox", { name: "Prescribing doctor" });
    // Defaults to the owner's own doctor row, but can be changed to another doctor.
    expect(select).toHaveTextContent(/Test/);
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Prescribing doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ patient_id: "p1", practitioner_id: "pr-vik" });
  });

  it("defaults the doctor to the patient's last non-cancelled appointment and says so", async () => {
    mock.current.tables.appointments = (ops: any[]) =>
      ops.some((o) => o[0] === "eq" && o[1] === "patient_id" && o[2] === "p1")
        ? { data: [{ practitioner_id: "pr-vik" }], error: null }
        : { data: [], error: null };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");

    expect(await within(dialog).findByText("Defaulted from Aaryan's last visit")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Prescribing doctor" })).toHaveTextContent(/Vikram Mehta/);
    const q = mock.current.opsOf("appointments").find((x: any) => mock.current.hasOp(x, "neq", "status", "cancelled"));
    expect(q).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ practitioner_id: "pr-vik" });
  });

  it("falls back to the patient's last visit, then to the owner's own doctor", async () => {
    mock.current.tables.patient_visits = { data: [{ practitioner_id: "pr-vik" }], error: null };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    expect(await within(dialog).findByText(/Defaulted from Aaryan/)).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Prescribing doctor" })).toHaveTextContent(/Vikram Mehta/);

    mock.current.tables.patient_visits = { data: [], error: null };
    await choosePatient(dialog, "Meena (9876543211)");
    await waitFor(() => expect(within(dialog).queryByText(/Defaulted from/)).not.toBeInTheDocument());
    expect(within(dialog).getByRole("combobox", { name: "Prescribing doctor" })).toHaveTextContent(/Test/);
  });

  it("the owner can re-assign an existing prescription to another doctor", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    const sheet = await openRx("Ravi");
    fireEvent.click(within(sheet).getByRole("button", { name: /^edit$/i }));
    fireEvent.click(within(sheet).getByRole("combobox", { name: "Prescribing doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const updates = mock.current.opsOf("prescriptions").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "update").map((o: any[]) => o[1]));
      expect(updates[0]).toMatchObject({ practitioner_id: "pr-vik" });
    });
  });

  it("a doctor login does not get the doctor select when editing", async () => {
    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-own" };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    const sheet = await openRx("Ravi");
    fireEvent.click(within(sheet).getByRole("button", { name: /^edit$/i }));
    expect(within(sheet).queryByRole("combobox", { name: "Prescribing doctor" })).not.toBeInTheDocument();
  });
});
