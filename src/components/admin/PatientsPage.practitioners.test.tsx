import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PatientsPage from "./PatientsPage";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({ who: {} as any, prac: {} as any, profile: { id: "doc-1" } }));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, isStaff: false, can: () => true, ...h.who }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => h.prac }));
vi.mock("@/contexts/TrialStatusContext", () => ({ useTrialStatus: () => ({ accessLevel: "full" }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const docs = [
  { id: "a", display_name: "Dr. Asha Rao", specialization: null, is_active: true, is_bookable: true, is_primary: true },
  { id: "b", display_name: "Bimal Shah", specialization: null, is_active: true, is_bookable: true, is_primary: false },
  { id: "c", display_name: "Chitra Nair", specialization: null, is_active: true, is_bookable: true, is_primary: false },
];
const multi = (isMulti: boolean) => ({
  isMulti, active: docs, bookable: docs, practitioners: docs,
  byId: (id?: string | null) => docs.find((d) => d.id === id),
});
const row = (id: string, name: string, ids: string[]) => ({
  id, name, phone: "98765" + id, email: null, age: 30, gender: "male", first_visit: null, last_visit: null,
  total_visits: 1, notes: null, created_at: "2026-09-01T00:00:00Z", practitioner_ids: ids, last_practitioner_id: ids[0] ?? null,
});

const renderPage = () => render(<MemoryRouter><PatientsPage /></MemoryRouter>);
const firstQuery = (table: string) => mock.current.opsOf(table)[0];

describe("PatientsPage - multi-doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.who = {};
    mock.current = createTableMock();
    const data = [row("1", "Ravi", ["a"]), row("2", "Sita", ["a", "b", "c"]), row("3", "Tara", [])];
    mock.current.tables.patients_with_doctors = { data, count: 3, error: null };
    mock.current.tables.patients = { data: data.map(({ practitioner_ids, last_practitioner_id, ...r }) => r), count: 3, error: null };
  });

  it("single-doctor clinic reads plain patients and shows no filter or chips", async () => {
    h.prac = multi(false);
    renderPage();
    expect((await screen.findAllByText("Ravi")).length).toBeGreaterThan(0);
    expect(mock.current.opsOf("patients_with_doctors")).toHaveLength(0);
    expect(screen.queryByLabelText("Doctor filter")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("patient-doctor-chips")).toHaveLength(0);
  });

  it("multi-doctor owner sees all doctors by default, chips (max 2 then +n)", async () => {
    h.prac = multi(true);
    renderPage();
    expect((await screen.findAllByText("Ravi")).length).toBeGreaterThan(0);
    const q = firstQuery("patients_with_doctors");
    expect(mock.current.hasOp(q, "eq", "doctor_id", "doc-1")).toBe(true);
    expect(q.ops.some((o: any[]) => o[0] === "contains")).toBe(false);
    expect(screen.getByLabelText("Doctor filter")).toBeInTheDocument();
    expect(screen.getAllByText("Dr Asha Rao").length).toBeGreaterThan(0); // never "Dr Dr."
    expect(screen.getAllByText("Dr Bimal Shah").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dr Chitra Nair")).not.toBeInTheDocument();
    expect(screen.getAllByText("+1").length).toBeGreaterThan(0);
  });

  it("a doctor login starts filtered to their own patients", async () => {
    h.prac = multi(true);
    h.who = { role: "doctor", myPractitionerId: "b" };
    renderPage();
    await screen.findAllByText("Ravi");
    const q = firstQuery("patients_with_doctors");
    expect(q.ops.find((o: any[]) => o[0] === "contains")?.slice(1)).toEqual(["practitioner_ids", ["b"]]);
  });

  it("reloads (debounced) when an appointment, visit or prescription changes in a multi-doctor clinic", async () => {
    h.prac = multi(true);
    renderPage();
    await screen.findAllByText("Ravi");
    const chan = mock.current.client.channel.mock.results.map((r: any) => r.value).find((c: any) =>
      c.on.mock.calls.some((call: any[]) => call[1]?.table === "appointments"));
    expect(chan).toBeTruthy();
    const tables = chan.on.mock.calls.map((call: any[]) => call[1].table); // the mock shares one channel object
    expect(tables).toEqual(expect.arrayContaining(["appointments", "patient_visits", "prescriptions"]));
    const before = mock.current.opsOf("patients_with_doctors").length;
    const handler = chan.on.mock.calls.find((call: any[]) => call[1].table === "prescriptions")[2];
    handler(); handler(); handler(); // a burst is one reload
    await waitFor(() => expect(mock.current.opsOf("patients_with_doctors").length).toBe(before + 1), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 1800));
    expect(mock.current.opsOf("patients_with_doctors").length).toBe(before + 1);
  });

  it("single-doctor clinic does not subscribe to appointment changes", async () => {
    h.prac = multi(false);
    renderPage();
    await screen.findAllByText("Ravi");
    const names = mock.current.client.channel.mock.calls.map((c: any[]) => c[0]);
    expect(names.some((n: string) => n.startsWith("patients-doctors-"))).toBe(false);
  });

  it("does not crash when the view query fails", async () => {
    h.prac = multi(true);
    mock.current.tables.patients_with_doctors = { data: null, count: null, error: { message: "boom" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();
    expect(await screen.findByText("No patients match your filters")).toBeInTheDocument();
  });
});
