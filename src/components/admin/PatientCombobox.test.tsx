import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import PatientCombobox, { sanitizePatientQuery, patientSearchFilter } from "./PatientCombobox";
import { createTableMock } from "@/test/tableMock";
import { istDayKey } from "@/lib/istDate";

const mock = vi.hoisted(() => ({ current: null as any }));
const prac = vi.hoisted(() => ({ isMulti: false }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ isMulti: prac.isMulti }) }));

Element.prototype.scrollIntoView = vi.fn();

const A = { id: "p1", name: "Aaryan", phone: "8871876376", gender: "male", age: 34, weight: 62.5 };
const M = { id: "p2", name: "Meena", phone: "9876543211", gender: "female", age: null, weight: null };
const many = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `Pat ${i}`, phone: `90000000${String(i).padStart(2, "0")}`, gender: null, age: null, weight: null }));

const isSearch = (ops: any[]) => ops.some((o) => o[0] === "or");
const searchQueries = () => mock.current.opsOf("patients").filter((q: any) => isSearch(q.ops));
const labels = () => screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"));

const setup = (props: Partial<React.ComponentProps<typeof PatientCombobox>> = {}) => {
  const onSelect = vi.fn();
  render(<PatientCombobox clinicId="clinic-1" value="" onSelect={onSelect} {...props} />);
  return onSelect;
};
const open = async () => {
  fireEvent.click(screen.getByRole("combobox", { name: "Patient" }));
  return screen.findByPlaceholderText("Name or phone number");
};

beforeEach(() => {
  vi.clearAllMocks();
  prac.isMulti = false;
  mock.current = createTableMock();
  mock.current.tables.patients = { data: [A, M], error: null };
});
afterEach(() => vi.useRealTimers());

describe("sanitizePatientQuery", () => {
  it("strips wildcard and filter-syntax characters", () => {
    expect(sanitizePatientQuery(`  a%b_c,d(e)f"g'h\\i*j  `)).toBe("a b c d e f g h i j");
    expect(patientSearchFilter("x),phone.eq.1")).not.toMatch(/[()]/);
    expect(patientSearchFilter("  ")).toBeNull();
  });
  it("adds the digits-only phone form", () => {
    expect(patientSearchFilter("98 765")).toBe("name.ilike.%98 765%,phone.ilike.%98 765%,phone.ilike.%98765%");
    expect(patientSearchFilter("meena")).toBe("name.ilike.%meena%,phone.ilike.%meena%");
  });
});

describe("PatientCombobox", () => {
  it("shows the placeholder when nothing is chosen", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Patient" })).toHaveTextContent("Search patient by name or phone…");
  });

  it("shows the stored patient label even when that patient is in no result", () => {
    mock.current.tables.patients = { data: [], error: null };
    setup({ value: "gone", valueLabel: "Old Patient" });
    expect(screen.getByRole("combobox", { name: "Patient" })).toHaveTextContent("Old Patient");
  });

  it("sends a debounced, sanitised, limited server search", async () => {
    setup();
    const input = await open();
    await screen.findByRole("option", { name: "Aaryan (8871876376)" });
    expect(searchQueries()).toHaveLength(0);

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "aar),phone.eq.1%" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(searchQueries()).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    vi.useRealTimers();

    expect(searchQueries()).toHaveLength(1);
    const q = searchQueries()[0];
    const or = q.ops.find((o: any[]) => o[0] === "or")[1] as string;
    expect(or).toBe("name.ilike.%aar phone.eq.1%,phone.ilike.%aar phone.eq.1%,phone.ilike.%1%");
    expect(or).not.toMatch(/[()"']/);
    expect(mock.current.hasOp(q, "eq", "doctor_id", "clinic-1")).toBe(true);
    expect(mock.current.hasOp(q, "limit", 20)).toBe(true);
    expect(q.ops.find((o: any[]) => o[0] === "select")[1]).toBe("id, name, phone, gender, age, weight");
  });

  it("ignores a stale response that arrives after a newer one", async () => {
    let releaseOld: () => void = () => {};
    const orig = mock.current.client.from;
    // Wrap every chained builder so the "old" search can be held back after the "new" one answers.
    const wrap = (b: any, rec: any): any =>
      new Proxy(b, {
        get(target, prop: string) {
          if (prop === "then") {
            return (res: any, rej: any) => {
              const term = ((rec.ops.find((o: any[]) => o[0] === "or") || [])[1] as string) || "";
              if (term.includes("old")) {
                return new Promise<void>((r) => { releaseOld = r; }).then(() => ({ data: [A], error: null })).then(res, rej);
              }
              if (term.includes("new")) return Promise.resolve({ data: [M], error: null }).then(res, rej);
              return Promise.resolve({ data: [], error: null }).then(res, rej);
            };
          }
          const v = (target as any)[prop];
          return typeof v === "function" ? (...args: unknown[]) => { v(...args); return wrap(b, rec); } : v;
        },
      });
    mock.current.client.from = (t: string) => {
      const b = orig(t);
      return t === "patients" ? wrap(b, mock.current.queries[mock.current.queries.length - 1]) : b;
    };
    setup();
    const input = await open();
    fireEvent.change(input, { target: { value: "old" } });
    await waitFor(() => expect(searchQueries().length).toBe(1), { timeout: 1500 });
    fireEvent.change(input, { target: { value: "new" } });
    expect(await screen.findByRole("option", { name: "Meena (9876543211)" }, { timeout: 1500 })).toBeInTheDocument();
    await act(async () => { releaseOld(); });
    expect(screen.queryByRole("option", { name: "Aaryan (8871876376)" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Meena (9876543211)" })).toBeInTheDocument();
  });

  it("empty query lists today's patients first, then recent without duplicates", async () => {
    mock.current.tables.appointments = (ops: any[]) =>
      ops.some((o) => o[0] === "eq" && o[1] === "date" && o[2] === istDayKey(new Date())) ? { data: [{ patient_id: "p1" }], error: null } : { data: [], error: null };
    mock.current.tables.patients = (ops: any[]) =>
      ops.some((o) => o[0] === "in") ? { data: [A], error: null } : { data: [A, M], error: null };
    setup();
    await open();
    expect(await screen.findByText("Today's patients")).toBeInTheDocument();
    expect(screen.getByText("Recent patients")).toBeInTheDocument();
    expect(labels()).toEqual(["Aaryan (8871876376)", "Meena (9876543211)"]);
    const appt = mock.current.opsOf("appointments")[0];
    expect(mock.current.hasOp(appt, "neq", "status", "cancelled")).toBe(true);
    expect(mock.current.hasOp(appt, "eq", "doctor_id", "clinic-1")).toBe(true);
  });

  it("in a multi-doctor clinic scopes today to the prescribing doctor and lists that doctor's patients first", async () => {
    prac.isMulti = true;
    mock.current.tables.appointments = { data: [], error: null };
    mock.current.tables.patients_with_doctors = { data: [M], error: null };
    mock.current.tables.patients = { data: [A, M], error: null };
    setup({ practitionerId: "pr-1" });
    await open();
    await screen.findByRole("option", { name: "Meena (9876543211)" });
    expect(labels()).toEqual(["Meena (9876543211)", "Aaryan (8871876376)"]);
    expect(mock.current.hasOp(mock.current.opsOf("appointments")[0], "eq", "practitioner_id", "pr-1")).toBe(true);
    expect(mock.current.opsOf("patients_with_doctors")[0].ops.some((o: any[]) => o[0] === "contains" && o[1] === "practitioner_ids")).toBe(true);
  });

  it("selecting a patient reports it and closes the list", async () => {
    const onSelect = setup();
    await open();
    fireEvent.click(await screen.findByRole("option", { name: "Aaryan (8871876376)" }));
    expect(onSelect).toHaveBeenCalledWith(A);
    await waitFor(() => expect(screen.queryByPlaceholderText("Name or phone number")).not.toBeInTheDocument());
  });

  it("says so when nothing matches", async () => {
    mock.current.tables.patients = { data: [], error: null };
    setup();
    await open();
    expect(await screen.findByText("No patient found — type the name below to add a new one")).toBeInTheDocument();
  });

  it("hints to keep typing when the page is full", async () => {
    mock.current.tables.patients = { data: many(20), error: null };
    setup();
    await open();
    expect(await screen.findByText("Showing the first 20 — keep typing to narrow")).toBeInTheDocument();
  });

  it("shows no hint under 20 results", async () => {
    setup();
    await open();
    await screen.findByRole("option", { name: "Aaryan (8871876376)" });
    expect(screen.queryByText(/keep typing to narrow/)).not.toBeInTheDocument();
  });
});
