import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PatientsPage from "./PatientsPage";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  profile: { id: "doc-1" },
  isStaff: false,
  granted: [] as string[],
  trial: "full",
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: h.profile,
    isStaff: h.isStaff,
    can: (k: string) => !h.isStaff || h.granted.includes(k),
  }),
}));
vi.mock("@/contexts/TrialStatusContext", () => ({ useTrialStatus: () => ({ accessLevel: h.trial }) }));
vi.mock("sonner", () => ({ toast: { error: h.error, success: h.success, info: h.info } }));

const patients = [
  { id: "p1", name: "Ravi Kumar", phone: "9876500001", email: null, age: 40, gender: "male", first_visit: "2026-09-01", last_visit: "2026-10-20", total_visits: 3, notes: null, created_at: "2026-09-01T00:00:00Z" },
  { id: "p2", name: "=HYPERLINK(\"http://evil\")", phone: "9876500002", email: null, age: null, gender: null, first_visit: null, last_visit: null, total_visits: 0, notes: null, created_at: "2026-09-02T00:00:00Z" },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <PatientsPage />
    </MemoryRouter>,
  );

const patientQueries = () => mock.current.opsOf("patients");

describe("PatientsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isStaff = false;
    h.granted = [];
    h.trial = "full";
    mock.current = createTableMock();
    mock.current.tables.patients = (ops: any[]) =>
      ops.some((o) => o[0] === "insert" || o[0] === "delete") ? { data: null, error: null } : { data: patients, count: 2, error: null };
  });
  afterEach(() => vi.restoreAllMocks());

  it("loads only this doctor's patients, newest visit first, and shows the count", async () => {
    renderPage();
    expect((await screen.findAllByText("Ravi Kumar")).length).toBeGreaterThan(0);
    const q = patientQueries()[0];
    expect(mock.current.hasOp(q, "eq", "doctor_id", "doc-1")).toBe(true);
    expect(mock.current.hasOp(q, "order", "last_visit")).toBe(true);
    expect(screen.getByText("2 patients")).toBeInTheDocument();
  });

  it("search is debounced and sanitised before it reaches the or() filter", async () => {
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "ra),x(%" } });
    await waitFor(
      () => expect(patientQueries().some((q: any) => q.ops.some((o: any[]) => o[0] === "or"))).toBe(true),
      { timeout: 2000 },
    );
    const q = patientQueries().find((q: any) => q.ops.some((o: any[]) => o[0] === "or"));
    const clause = String(q.ops.find((o: any[]) => o[0] === "or")[1]);
    expect(clause.split(",").length).toBe(2);
    expect(clause).not.toMatch(/[()]/);
  });

  it("doctor sees Add Patient and the delete (select) control", async () => {
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    expect(screen.getByRole("button", { name: /Add Patient/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select items to delete" })).toBeInTheDocument();
  });

  it("staff cannot add patients without patients.add", async () => {
    h.isStaff = true;
    h.granted = ["patients.view"];
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    expect(screen.queryByRole("button", { name: /Add Patient/ })).not.toBeInTheDocument();
  });

  it("staff with patients.add can add; deletion stays doctor-only for staff", async () => {
    h.isStaff = true;
    h.granted = ["patients.view", "patients.add"];
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    expect(screen.getByRole("button", { name: /Add Patient/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select items to delete" })).not.toBeInTheDocument();
  });

  it("Add Patient is disabled during the grace period", async () => {
    h.trial = "grace";
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    expect(screen.getByRole("button", { name: /Add Patient/ })).toBeDisabled();
  });

  const openAdd = async () => {
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    fireEvent.click(screen.getByRole("button", { name: /Add Patient/ }));
    await screen.findByText("Name *");
  };
  const submitAdd = () => {
    const btns = screen.getAllByRole("button", { name: "Add Patient" });
    fireEvent.click(btns[btns.length - 1]);
  };

  it("rejects an invalid phone number and inserts nothing", async () => {
    await openAdd();
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0], { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile"), { target: { value: "12345" } });
    submitAdd();
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(patientQueries().some((q: any) => q.ops.some((o: any[]) => o[0] === "insert"))).toBe(false);
  });

  it("inserts a valid patient for this doctor with a normalised phone", async () => {
    await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile"), { target: { value: "9876500009" } });
    submitAdd();
    await waitFor(() => expect(h.success).toHaveBeenCalledWith("Patient added"));
    const ins = patientQueries().find((q: any) => q.ops.some((o: any[]) => o[0] === "insert"));
    const row = ins.ops.find((o: any[]) => o[0] === "insert")[1];
    expect(row).toMatchObject({ doctor_id: "doc-1", name: "New Person" });
    expect(String(row.phone)).toContain("9876500009");
  });

  it("duplicate patients get a specific message", async () => {
    mock.current.tables.patients = (ops: any[]) =>
      ops.some((o) => o[0] === "insert") ? { data: null, error: { code: "23505", message: "dup" } } : { data: patients, count: 2 };
    await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "New Person" } });
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile"), { target: { value: "9876500009" } });
    submitAdd();
    await waitFor(() => expect(h.error).toHaveBeenCalledWith("A patient with this name and phone number already exists."));
  });

  it("rejects a whitespace-only patient name", async () => {
    await openAdd();
    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "   " } });
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile"), { target: { value: "9876500009" } });
    submitAdd();
    await new Promise((r) => setTimeout(r, 50));
    expect(patientQueries().some((q: any) => q.ops.some((o: any[]) => o[0] === "insert"))).toBe(false);
  });

  it("bulk delete is scoped to the selected ids AND this doctor", async () => {
    renderPage();
    await screen.findAllByText("Ravi Kumar");
    fireEvent.click(screen.getByRole("button", { name: "Select items to delete" }));
    fireEvent.click(screen.getAllByLabelText("Select Ravi Kumar")[0]);
    const toolbar = await screen.findByRole("toolbar", { name: "Bulk actions" });
    fireEvent.click(Array.from(toolbar.querySelectorAll("button")).find((b) => /Delete/.test(b.textContent || ""))!);
    const confirm = (await screen.findAllByRole("button", { name: /^Delete/ })).pop()!;
    fireEvent.click(confirm);
    await waitFor(() => expect(h.success).toHaveBeenCalledWith("1 patient deleted"));
    const del = patientQueries().find((q: any) => q.ops.some((o: any[]) => o[0] === "delete"));
    expect(del.ops.find((o: any[]) => o[0] === "in")).toEqual(["in", "id", ["p1"]]);
    expect(mock.current.hasOp(del, "eq", "doctor_id", "doc-1")).toBe(true);
  });

  describe("CSV export", () => {
    let blobs: Blob[];
    beforeEach(() => {
      blobs = [];
      (URL as any).createObjectURL = vi.fn((b: Blob) => (blobs.push(b), "blob:x"));
      (URL as any).revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });
    const exportCsv = async () => {
      renderPage();
      await screen.findAllByText("Ravi Kumar");
      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
      await waitFor(() => expect(blobs.length).toBe(1));
      const buf = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsText(blobs[0]);
      });
      return buf;
    };

    it("exports every patient with a header row, a BOM, and phone numbers as text", async () => {
      const csv = await exportCsv();
      expect(blobs[0].type).toContain("text/csv");
      expect(csv).toContain("Name,Phone,Email,Age,Gender,First Visit,Last Visit,Total Visits,Notes");
      expect(csv).toContain('="9876500001"');
      expect(csv).toContain("Ravi Kumar");
      expect(h.success).toHaveBeenCalledWith("Exported 2 patients to CSV");
    });

    it("scopes the export query to this doctor", async () => {
      await exportCsv();
      const qs = patientQueries().filter((q: any) => q.ops.some((o: any[]) => o[0] === "range"));
      expect(qs.every((q: any) => mock.current.hasOp(q, "eq", "doctor_id", "doc-1"))).toBe(true);
    });

    it("neutralises spreadsheet formulas in patient names", async () => {
      const csv = await exportCsv();
      expect(csv).not.toMatch(/"=HYPERLINK/);
    });
  });
});
