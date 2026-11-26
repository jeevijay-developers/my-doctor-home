import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PatientMedicalRecord from "./PatientMedicalRecord";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const who = vi.hoisted(() => ({ current: { role: "doctor", myPractitionerId: "pr-b" as string | null } }));
const prac = vi.hoisted(() => ({ current: { isMulti: true } as any }));

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "doc-1" };
  return { useProfile: () => ({ profile, can: () => true, ...who.current }) };
});
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({ active: [], bookable: [], byId: () => undefined, ...prac.current }),
}));
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: () => ({ hasFeature: () => true, loading: false }) }));
// The tabs have their own tests; only the page shell matters here.
vi.mock("./medical-records/OverviewTab", () => ({ default: () => <div>overview</div> }));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/admin/patients/p1"]}>
      <Routes>
        <Route path="/admin/patients/:patientId" element={<PatientMedicalRecord />} />
      </Routes>
    </MemoryRouter>,
  );

const accessLogs = () => mock.current.client.rpc.mock.calls.filter((c: any[]) => c[0] === "log_clinical_access");

describe("PatientMedicalRecord - clinical access log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    who.current = { role: "doctor", myPractitionerId: "pr-b" };
    prac.current = { isMulti: true };
    mock.current = createTableMock();
    mock.current.tables.patients = {
      data: { id: "p1", name: "Kiran", phone: "9876543210", email: null, age: 30, gender: "female", last_visit: null, total_visits: 0 },
      error: null,
    };
  });

  it("logs a doctor login opening the record once, in a multi-doctor clinic", async () => {
    renderPage();
    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    await waitFor(() => expect(accessLogs()).toHaveLength(1));
    expect(accessLogs()[0][1]).toEqual({ _patient_id: "p1" });
  });

  it("does not log for the owner", async () => {
    who.current = { role: "owner", myPractitionerId: "pr-a" };
    renderPage();
    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    expect(accessLogs()).toHaveLength(0);
  });

  it("does not log in a single-doctor clinic", async () => {
    prac.current = { isMulti: false };
    renderPage();
    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    expect(accessLogs()).toHaveLength(0);
  });

  it("retries once after a failed write, and logs the error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    mock.current.rpcs.log_clinical_access = () => (++n === 1 ? { data: null, error: { message: "down" } } : { data: null, error: null });
    renderPage();
    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    await waitFor(() => expect(accessLogs()).toHaveLength(1));
    await waitFor(() => expect(accessLogs()).toHaveLength(2), { timeout: 4000 });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("after both attempts fail, opening the record again tries again", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mock.current.rpcs.log_clinical_access = () => ({ data: null, error: { message: "down" } });
    const first = renderPage();
    expect(await screen.findByText("Kiran")).toBeInTheDocument();
    await waitFor(() => expect(accessLogs()).toHaveLength(2), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 20));
    first.unmount();

    renderPage();
    await waitFor(() => expect(accessLogs()).toHaveLength(3), { timeout: 4000 });
    err.mockRestore();
  });
});
