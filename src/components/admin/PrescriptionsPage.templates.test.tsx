import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrescriptionsPage from "./PrescriptionsPage";
import { createTableMock } from "@/test/tableMock";
import { TEMPLATE_PRESETS, defaultTemplateConfig } from "@/lib/prescriptionTemplate/defaults";

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
Element.prototype.scrollIntoView = vi.fn();

const PATIENTS = [{ id: "p1", name: "Aaryan", phone: "8871876376", gender: "male", age: 34, weight: 62.5 }];

const dentalConfig = () => TEMPLATE_PRESETS.find((p) => p.key === "dental")!.build();
const templateRow = (over: Record<string, unknown> = {}) => ({
  id: "t-dental", doctor_id: "doc-1", practitioner_id: null, name: "Dental case sheet", preset: "dental",
  config: dentalConfig(), is_default: true, created_at: "2026-11-27T10:00:00Z", updated_at: "2026-11-27T10:00:00Z", ...over,
});

const savedRows = () =>
  mock.current.opsOf("prescriptions").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));
const updates = () =>
  mock.current.opsOf("prescriptions").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "update").map((o: any[]) => o[1]));

const openNew = async () => {
  render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: /new prescription/i }));
  return screen.findByRole("dialog");
};
const choosePatient = async (dialog: HTMLElement, label: string) => {
  fireEvent.click(await within(dialog).findByRole("combobox", { name: /patient/i }));
  fireEvent.click(await screen.findByRole("option", { name: label }));
  await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Patient" })).toHaveTextContent(label));
};

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

describe("PrescriptionsPage - clinic without templates", () => {
  it("shows no template picker and sends none of the template columns (same payload as before templates)", async () => {
    const dialog = await openNew();
    expect(within(dialog).queryByRole("combobox", { name: "Template" })).not.toBeInTheDocument();
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.change(within(dialog).getByLabelText("Diagnosis"), { target: { value: "Flu" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    const row = savedRows()[0];
    expect(row).toMatchObject({ doctor_id: "doc-1", patient_id: "p1", diagnosis: "Flu", medicines: [] });
    for (const key of ["extra", "template_id", "template_snapshot", "advice", "diet_advice", "lifestyle_advice", "follow_up_date", "follow_up_instructions"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("still works when the templates table is not there yet (migration not applied)", async () => {
    mock.current.tables.prescription_templates = { data: null, error: { message: 'relation "prescription_templates" does not exist' } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(h.error).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("collects advice and follow-up, which the standard template now offers", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.change(within(dialog).getByLabelText("General advice"), { target: { value: " Rest well " } });
    fireEvent.change(within(dialog).getByLabelText("Follow-up date"), { target: { value: "2026-12-05" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0]).toMatchObject({ advice: "Rest well", follow_up_date: "2026-12-05" });
    expect(savedRows()[0]).not.toHaveProperty("diet_advice");
  });
});

describe("PrescriptionsPage - clinic with a default template", () => {
  beforeEach(() => {
    mock.current.tables.prescription_templates = { data: [templateRow()], error: null };
  });

  it("opens on the default template: its custom fields are shown and the template is named in the picker", async () => {
    const dialog = await openNew();
    expect(await within(dialog).findByLabelText("OPD No.")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Template" })).toHaveTextContent("Dental case sheet");
    expect(within(dialog).getByText("Past medical / dental / drug history")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Clinical findings tooth 16/ })).toBeInTheDocument();
  });

  it("saves the answers with the template id and a snapshot of the layout", async () => {
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.change(await within(dialog).findByLabelText("OPD No."), { target: { value: "14023" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "No" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Clinical findings tooth 16/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "IOPAR" }));
    fireEvent.change(within(dialog).getByLabelText("Diagnosis"), { target: { value: "Pulpitis" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));

    await waitFor(() => expect(savedRows()).toHaveLength(1));
    const row = savedRows()[0];
    expect(row).toMatchObject({
      patient_id: "p1", diagnosis: "Pulpitis", template_id: "t-dental",
      extra: { cf_opd_no: "14023", cf_mlc: "No", cf_teeth: { "16": "decayed" }, cf_investigations: ["IOPAR"] },
    });
    expect(row.template_snapshot).toEqual(dentalConfig());
    expect(row.extra).not.toHaveProperty("cf_allergies"); // unanswered fields are not stored
  });

  it("blocks saving until a required field is answered", async () => {
    const cfg = dentalConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.id === "cf_opd_no" && b.type === "custom" ? { ...b, required: true } : b));
    mock.current.tables.prescription_templates = { data: [templateRow({ config: cfg })], error: null };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    await within(dialog).findByLabelText(/OPD No\./);
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("OPD No. is required."));
    expect(savedRows()).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText(/OPD No\./), { target: { value: "9" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
  });

  it("choosing Standard drops the custom fields and the template columns", async () => {
    const dialog = await openNew();
    await within(dialog).findByLabelText("OPD No.");
    await choosePatient(dialog, "Aaryan (8871876376)");
    fireEvent.change(within(dialog).getByLabelText("OPD No."), { target: { value: "14023" } });

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Template" }));
    fireEvent.click(await screen.findByRole("option", { name: "Standard" }));
    expect(within(dialog).queryByLabelText("OPD No.")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    const row = savedRows()[0];
    for (const key of ["extra", "template_id", "template_snapshot"]) expect(row).not.toHaveProperty(key);
  });

  it("never saves medicines typed under another template when the chosen one has no medicines section", async () => {
    const cfg = dentalConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "medicines" ? { ...b, enabled: false } : b));
    mock.current.tables.prescription_templates = { data: [templateRow({ config: cfg })], error: null };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    await within(dialog).findByLabelText("OPD No.");
    expect(within(dialog).queryByRole("button", { name: /add medicine/i })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0].medicines).toEqual([]);
  });
});

describe("PrescriptionsPage - template switching", () => {
  it("a half-typed medicine does not block saving once the chosen template has no medicines section", async () => {
    const cfg = dentalConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "medicines" ? { ...b, enabled: false } : b));
    mock.current.tables.prescription_templates = {
      data: [templateRow({ id: "t-std-like", name: "No meds", config: cfg, is_default: false }), templateRow({ id: "t-gen", name: "General", config: defaultTemplateConfig(), is_default: true })],
      error: null,
    };
    const dialog = await openNew();
    await choosePatient(dialog, "Aaryan (8871876376)");
    // Type a medicine name only (invalid on its own) under the General template ...
    fireEvent.click(await within(dialog).findByRole("button", { name: /add medicine/i }));
    fireEvent.change(within(dialog).getByPlaceholderText("e.g. Paracetamol"), { target: { value: "Amox" } });
    // ... then switch to a template without a medicines section.
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Template" }));
    fireEvent.click(await screen.findByRole("option", { name: "No meds" }));
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /add medicine/i })).not.toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(h.error).not.toHaveBeenCalled();
    expect(savedRows()[0].medicines).toEqual([]);
  });
});

describe("PrescriptionsPage - editing an issued prescription", () => {
  const RX = {
    id: "rx-d", doctor_id: "doc-1", practitioner_id: null, patient_id: null, patient_name: "Harshit",
    diagnosis: "Pulpitis", medications: null, notes: null, date: "2026-11-27", created_at: "2026-11-27T10:00:00Z",
    patient_age: 23, patient_weight: null, visit_id: null, medicines: [], advice: null, diet_advice: null,
    lifestyle_advice: null, follow_up_date: null, follow_up_instructions: null,
    template_id: "t-dental", template_snapshot: dentalConfig(), extra: { cf_opd_no: "14023", cf_teeth: { "16": "decayed" } },
  };

  it("edits with the layout it was issued with, even if the clinic's default template has changed since", async () => {
    mock.current.tables.prescription_templates = { data: [templateRow({ id: "t-new", name: "Something else", config: defaultTemplateConfig() })], error: null };
    mock.current.tables.prescriptions = () => ({ data: [RX], count: 1, error: null });
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Harshit" }))[0]);
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /^edit$/i }));

    const opd = await within(sheet).findByLabelText("OPD No.");
    expect(opd).toHaveValue("14023");
    expect(within(sheet).getByRole("button", { name: /Clinical findings tooth 16, Decayed/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(opd, { target: { value: "14024" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ extra: { cf_opd_no: "14024", cf_teeth: { "16": "decayed" } }, diagnosis: "Pulpitis" });
    // The snapshot and template are never rewritten by an edit.
    expect(updates()[0]).not.toHaveProperty("template_snapshot");
    expect(updates()[0]).not.toHaveProperty("template_id");
  });

  it("an edit sends advice and follow-up only when the doctor changed them", async () => {
    const OLD = { ...RX, id: "rx-adv", patient_name: "Kiran", template_id: null, template_snapshot: null, extra: {}, advice: "Rest", follow_up_date: "2026-12-01" };
    mock.current.tables.prescriptions = () => ({ data: [OLD], count: 1, error: null });
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Kiran" }))[0]);
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /^edit$/i }));
    fireEvent.change(await within(sheet).findByLabelText("Diet advice"), { target: { value: "Less sugar" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).toMatchObject({ diet_advice: "Less sugar" });
    for (const k of ["advice", "follow_up_date", "lifestyle_advice", "follow_up_instructions"]) expect(updates()[0]).not.toHaveProperty(k);
  });

  it("an old prescription (no snapshot) edits exactly as before, with the standard fields", async () => {
    const OLD = { ...RX, id: "rx-old", patient_name: "Meena", template_id: null, template_snapshot: null, extra: {} };
    mock.current.tables.prescriptions = () => ({ data: [OLD], count: 1, error: null });
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Meena" }))[0]);
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: /^edit$/i }));
    expect(await within(sheet).findByLabelText("Diagnosis")).toHaveValue("Pulpitis");
    expect(within(sheet).queryByLabelText("OPD No.")).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(updates()[0]).not.toHaveProperty("extra");
  });
});

describe("PrescriptionsPage - who can open the template builder", () => {
  it("the owner and a doctor login see the Templates button; reception does not", async () => {
    const { unmount } = render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /templates/i })).toBeInTheDocument();
    unmount();

    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-vik" };
    const second = render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /templates/i })).toBeInTheDocument();
    second.unmount();

    who.current = { isStaff: true, role: "staff", myPractitionerId: null };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    await screen.findByRole("button", { name: /new prescription/i });
    expect(screen.queryByRole("button", { name: /templates/i })).not.toBeInTheDocument();
  });

  it("lists the clinic's templates and lets the owner create one from a preset", async () => {
    mock.current.tables.prescription_templates = { data: [templateRow()], error: null };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /templates/i }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Dental case sheet", { selector: "p" })).toBeInTheDocument();
    expect(within(dialog).getByText("Default")).toBeInTheDocument();
    expect(within(dialog).getByText("Whole clinic")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /General/ }));
    fireEvent.change(await within(dialog).findByLabelText("Template name"), { target: { value: "My general" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save template" }));
    await waitFor(() => {
      const inserts = mock.current.opsOf("prescription_templates").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));
      expect(inserts).toHaveLength(1);
      expect(inserts[0]).toMatchObject({ doctor_id: "doc-1", name: "My general", preset: "general", practitioner_id: null, is_default: false });
      expect(inserts[0].config).toEqual(defaultTemplateConfig());
    });
  });

  it("a doctor login may edit and delete only their own templates, and new ones are scoped to them", async () => {
    who.current = { isStaff: true, role: "doctor", myPractitionerId: "pr-me" };
    mock.current.tables.prescription_templates = {
      data: [
        templateRow({ id: "t-clinic", name: "Clinic slip", is_default: true }),
        templateRow({ id: "t-mine", name: "My slip", practitioner_id: "pr-me", is_default: false }),
        templateRow({ id: "t-other", name: "Colleague slip", practitioner_id: "pr-other", is_default: false }),
      ],
      error: null,
    };
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /templates/i }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("My slip", { selector: "p" });

    expect(within(dialog).getByRole("button", { name: "Edit My slip" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Edit Clinic slip" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Edit Colleague slip" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Delete Clinic slip" })).not.toBeInTheDocument();
    // Anyone can copy a template into their own.
    fireEvent.click(within(dialog).getByRole("button", { name: "Duplicate Clinic slip" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Save template" }));
    await waitFor(() => {
      const inserts = mock.current.opsOf("prescription_templates").flatMap((q: any) => q.ops.filter((o: any[]) => o[0] === "insert").map((o: any[]) => o[1]));
      expect(inserts[0]).toMatchObject({ name: "Clinic slip (copy)", practitioner_id: "pr-me", is_default: false });
    });
  });
});

describe("PrescriptionsPage - inspection fixes", () => {
  const ISSUED = {
    id: "rx-i", doctor_id: "doc-1", practitioner_id: null, patient_id: null, patient_name: "Harshit",
    diagnosis: "Pulpitis", medications: null, notes: null, date: "2026-11-27", created_at: "2026-11-27T10:00:00Z",
    patient_age: 23, patient_weight: null, visit_id: null, medicines: [], advice: null, diet_advice: null,
    lifestyle_advice: null, follow_up_date: null, follow_up_instructions: null,
    template_id: "t-dental", template_snapshot: dentalConfig(), extra: { cf_opd_no: "14023", cf_teeth: { "16": "decayed" }, cf_pain: 3 },
  };

  it("the side panel shows the answers to the template's own fields", async () => {
    mock.current.tables.prescriptions = () => ({ data: [ISSUED], count: 1, error: null });
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Harshit" }))[0]);
    const sheet = await screen.findByRole("dialog");
    const answers = within(sheet).getByTestId("template-answers");
    expect(within(answers).getByText("OPD No.")).toBeInTheDocument();
    expect(within(answers).getByText("14023")).toBeInTheDocument();
    expect(answers.querySelector('[data-tooth="16"]')).toHaveTextContent("D");
    expect(answers.querySelector('[data-pain-level="3"]')).toHaveAttribute("data-selected", "true");
    expect(within(answers).queryByText("Allergies")).not.toBeInTheDocument(); // unanswered
  });

  it("a prescription without template answers shows no answers section", async () => {
    mock.current.tables.prescriptions = () => ({ data: [{ ...ISSUED, template_snapshot: null, extra: {} }], count: 1, error: null });
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Harshit" }))[0]);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByTestId("template-answers")).not.toBeInTheDocument();
  });

  it("carries histories and allergies forward from the patient's last prescription, without overwriting typed answers", async () => {
    mock.current.tables.prescription_templates = { data: [templateRow()], error: null };
    const LAST = { extra: { cf_history: "Diabetic", cf_allergies: "Penicillin", cf_opd_no: "old-opd" }, template_snapshot: dentalConfig(), date: "2026-11-01" };
    mock.current.tables.prescriptions = (ops: any[]) =>
      ops.some((o) => o[0] === "insert")
        ? { data: { id: "rx1", patient_id: "p1", patient_name: "Aaryan", date: "2026-11-18", medicines: [] }, error: null }
        : ops.some((o) => o[0] === "eq" && o[1] === "patient_id")
          ? { data: [LAST], error: null }
          : { data: [], count: 0, error: null };
    const dialog = await openNew();
    fireEvent.change(await within(dialog).findByLabelText("Allergies"), { target: { value: "Sulpha (today)" } });
    await choosePatient(dialog, "Aaryan (8871876376)");

    await waitFor(() => expect(within(dialog).getByLabelText("Past medical / dental / drug history")).toHaveValue("Diabetic"));
    expect(within(dialog).getByLabelText("Allergies")).toHaveValue("Sulpha (today)"); // typed answer kept
    expect(within(dialog).getByLabelText("OPD No.")).toHaveValue(""); // not a carry-forward field
    expect(within(dialog).getByText(/filled in from the prescription of 2026-11-01/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /save prescription/i }));
    await waitFor(() => expect(savedRows()).toHaveLength(1));
    expect(savedRows()[0].extra).toMatchObject({ cf_history: "Diabetic", cf_allergies: "Sulpha (today)" });
  });

  it("widens the form for a template with its own fields", async () => {
    mock.current.tables.prescription_templates = { data: [templateRow()], error: null };
    const dialog = await openNew();
    await within(dialog).findByLabelText("OPD No.");
    expect(dialog.className).toMatch(/sm:max-w-2xl/);
  });

  it("asks before discarding unsaved changes in the template builder", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /templates/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /General/ }));
    fireEvent.change(await within(dialog).findByLabelText("Template name"), { target: { value: "Half done" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard your changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument());
    expect(within(dialog).getByLabelText("Template name")).toHaveValue("Half done");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await within(dialog).findByText("Your templates")).toBeInTheDocument();
  });

  it("an untouched builder closes without asking", async () => {
    render(<MemoryRouter><PrescriptionsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /templates/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /General/ }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Cancel" }));
    expect(await within(dialog).findByText("Your templates")).toBeInTheDocument();
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });
});

describe("PrescriptionsPage - template stays put once answers are typed (multi-doctor)", () => {
  const OWNER_PR = { id: "pr-own", user_id: "doc-1", display_name: "Test", qualifications: null, specialization: null, registration_number: null, signature_url: null, is_active: true, is_bookable: true, is_primary: true };
  const VIK = { id: "pr-vik", user_id: "u-vik", display_name: "Vikram Mehta", qualifications: null, specialization: null, registration_number: null, signature_url: null, is_active: true, is_bookable: true, is_primary: false };
  const vikCfg = () => {
    const c = defaultTemplateConfig();
    c.blocks.push({ id: "cf_vik", type: "custom", enabled: true, label: "Vik field", fieldType: "text", options: [], required: false, carryForward: false });
    return c;
  };
  beforeEach(() => {
    who.current = { isStaff: false, role: "owner", myPractitionerId: "pr-own" };
    const all = [OWNER_PR, VIK];
    const map = new Map(all.map((p) => [p.id, p]));
    prac.current = { practitioners: all, active: all, bookable: all, primary: OWNER_PR, access: { enabled: true }, isMulti: true, loading: false, refetch: vi.fn(), byId: (id: string | null | undefined) => (id ? map.get(id) : undefined) };
    mock.current.tables.prescription_templates = {
      data: [templateRow(), templateRow({ id: "t-vik", name: "Vikram slip", practitioner_id: "pr-vik", config: vikCfg(), is_default: true })],
      error: null,
    };
  });

  const pickDoctor = async (dialog: HTMLElement) => {
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Prescribing doctor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Vikram Mehta/ }));
  };

  it("without answers, choosing another doctor switches to that doctor's default template", async () => {
    const dialog = await openNew();
    await within(dialog).findByLabelText("OPD No.");
    await pickDoctor(dialog);
    expect(await within(dialog).findByLabelText("Vik field")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Template" })).toHaveTextContent("Vikram slip");
  });

  it("with answers typed, the template and the answers stay", async () => {
    const dialog = await openNew();
    fireEvent.change(await within(dialog).findByLabelText("OPD No."), { target: { value: "14023" } });
    await pickDoctor(dialog);
    await new Promise((r) => setTimeout(r, 50));
    expect(within(dialog).getByRole("combobox", { name: "Template" })).toHaveTextContent("Dental case sheet");
    expect(within(dialog).getByLabelText("OPD No.")).toHaveValue("14023");
  });
});
