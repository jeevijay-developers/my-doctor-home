import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Onboarding from "./Onboarding";
import { createTableMock } from "@/test/tableMock";
import { INDIA_STATES, getCitiesForState } from "@/lib/indiaStatesCities";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Radix Select is not drivable in jsdom; swap for a native <select> with the same API.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <select value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/auth" element={<div>auth page</div>} />
        <Route path="/admin/dashboard" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );

const next = () => fireEvent.click(screen.getByRole("button", { name: /Next/ }));
const ph = (p: string) => screen.getByPlaceholderText(p);
const type = (p: string, v: string) => fireEvent.change(ph(p), { target: { value: v } });

const fillStep1 = () => {
  type("Rahul Sharma", "Dr. Asha Rao");
  fireEvent.change(document.querySelectorAll("select")[0], { target: { value: "Cardiologist" } });
  type("MBBS, MD (Cardiology)", "MBBS");
  type("15", "12");
  type("500", "600");
  type("Tell patients about your practice...", "Heart care");
};

const fillStep2 = () => {
  type("Sharma Heart Care", "Asha Heart Care");
  const state = INDIA_STATES[0];
  fireEvent.change(document.querySelectorAll("select")[0], { target: { value: state } });
  fireEvent.change(document.querySelectorAll("select")[1], { target: { value: getCitiesForState(state)[0] } });
  type("98765 43210", "9876543210");
  type("Building, Street, Area, City", "12 MG Road");
};

const toStep3 = async () => {
  await screen.findByText("Tell Us About You");
  fillStep1();
  next();
  await screen.findByPlaceholderText("Sharma Heart Care");
  fillStep2();
  next();
  await screen.findByRole("button", { name: /Go Live/ });
};

describe("Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    mock.current.client.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: { full_name: "Meta Name" } } } });
    mock.current.tables.profiles = { data: { onboarding_completed: false, full_name: null } };
  });

  it("sends signed-out visitors to /auth", async () => {
    mock.current.client.auth.getUser.mockResolvedValue({ data: { user: null } });
    renderPage();
    expect(await screen.findByText("auth page")).toBeInTheDocument();
  });

  it("sends already-onboarded doctors to the dashboard", async () => {
    mock.current.tables.profiles = { data: { onboarding_completed: true } };
    renderPage();
    expect(await screen.findByText("dashboard page")).toBeInTheDocument();
  });

  it("prefills the name from auth metadata", async () => {
    renderPage();
    await screen.findByText("Tell Us About You");
    expect(ph("Rahul Sharma")).toHaveValue("Meta Name");
  });

  it("step 1 validates each required field in order", async () => {
    renderPage();
    await screen.findByText("Tell Us About You");
    type("Rahul Sharma", "");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your full name");
    type("Rahul Sharma", "Asha");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please select your specialization");
    fireEvent.change(document.querySelectorAll("select")[0], { target: { value: "Cardiologist" } });
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your qualifications");
    type("MBBS, MD (Cardiology)", "MBBS");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter years of experience");
    type("15", "5");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your consultation fee");
    expect(screen.queryByPlaceholderText("Sharma Heart Care")).not.toBeInTheDocument();
  });

  it("a fee of 0 (free consultation) is accepted", async () => {
    renderPage();
    await screen.findByText("Tell Us About You");
    fillStep1();
    type("500", "0");
    next();
    expect(await screen.findByPlaceholderText("Sharma Heart Care")).toBeInTheDocument();
  });

  it("step 2 validates clinic, state, city, phone format and address", async () => {
    renderPage();
    await screen.findByText("Tell Us About You");
    fillStep1();
    next();
    await screen.findByPlaceholderText("Sharma Heart Care");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your clinic/hospital name");
    type("Sharma Heart Care", "C");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please select your state");
    const state = INDIA_STATES[0];
    fireEvent.change(document.querySelectorAll("select")[0], { target: { value: state } });
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please select your city");
    fireEvent.change(document.querySelectorAll("select")[1], { target: { value: getCitiesForState(state)[0] } });
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your phone number");
    type("98765 43210", "12345");
    next();
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/valid 10-digit Indian mobile/));
    type("98765 43210", "5876543210"); // must start with 6-9
    next();
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/valid 10-digit Indian mobile/));
    type("98765 43210", "9876543210");
    next();
    expect(toast.error).toHaveBeenLastCalledWith("Please enter your full address");
  });

  it("changing state clears the chosen city", async () => {
    renderPage();
    await screen.findByText("Tell Us About You");
    fillStep1();
    next();
    await screen.findByPlaceholderText("Sharma Heart Care");
    const [s1, s2] = [INDIA_STATES[0], INDIA_STATES[1]];
    fireEvent.change(document.querySelectorAll("select")[0], { target: { value: s1 } });
    fireEvent.change(document.querySelectorAll("select")[1], { target: { value: getCitiesForState(s1)[0] } });
    expect((document.querySelectorAll("select")[1] as HTMLSelectElement).value).toBe(getCitiesForState(s1)[0]);
    fireEvent.change(document.querySelectorAll("select")[0], { target: { value: s2 } });
    expect((document.querySelectorAll("select")[1] as HTMLSelectElement).value).toBe("");
  });

  it("Go Live saves the profile with a dr- slug and marks onboarding completed", async () => {
    mock.current.tables.profiles = (ops: any[]) =>
      ops.some((o) => o[0] === "update") ? { data: null, error: null } : ops.some((o) => o[0] === "maybeSingle")
        ? { data: { onboarding_completed: false, full_name: null } }
        : { data: [] };
    renderPage();
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: /Go Live/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Your clinic website is now live!"));
    const upd = mock.current.queries.find((q: any) => q.table === "profiles" && q.ops.some((o: any[]) => o[0] === "update"));
    const payload = upd.ops.find((o: any[]) => o[0] === "update")[1];
    expect(payload).toMatchObject({
      full_name: "Dr. Asha Rao",
      specialization: "Cardiologist",
      experience_years: 12,
      clinic_name: "Asha Heart Care",
      slug: "dr-asha-rao",
      onboarding_completed: true,
    });
    expect(mock.current.hasOp(upd, "eq", "id", "u1")).toBe(true);
  });

  it("a taken slug gets a random suffix", async () => {
    let firstSelect = true;
    mock.current.tables.profiles = (ops: any[]) => {
      if (ops.some((o) => o[0] === "update")) return { data: null, error: null };
      if (ops.some((o) => o[0] === "maybeSingle")) return { data: { onboarding_completed: false } };
      if (ops.some((o) => o[0] === "eq" && o[1] === "slug") && firstSelect) {
        firstSelect = false;
        return { data: [{ id: "someone-else" }] };
      }
      return { data: [] };
    };
    renderPage();
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: /Go Live/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    expect(upd.ops.find((o: any[]) => o[0] === "update")[1].slug).toMatch(/^dr-asha-rao-[a-z0-9]{1,4}$/);
  });

  it("a save error is shown and the wizard does not advance to the success step", async () => {
    mock.current.tables.profiles = (ops: any[]) =>
      ops.some((o) => o[0] === "update") ? { data: null, error: { message: "db down" } }
        : ops.some((o) => o[0] === "maybeSingle") ? { data: { onboarding_completed: false } } : { data: [] };
    renderPage();
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: /Go Live/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("db down"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Go Live/ })).toBeEnabled();
  });




  it("persists the consultation fee and bio the doctor entered", async () => {
    mock.current.tables.profiles = (ops: any[]) =>
      ops.some((o) => o[0] === "update") ? { data: null, error: null }
        : ops.some((o) => o[0] === "maybeSingle") ? { data: { onboarding_completed: false } } : { data: [] };
    renderPage();
    await toStep3();
    fireEvent.click(screen.getByRole("button", { name: /Go Live/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const upd = mock.current.queries.find((q: any) => q.ops.some((o: any[]) => o[0] === "update"));
    const payload = upd.ops.find((o: any[]) => o[0] === "update")[1];
    expect(payload.consultation_fee).toBe(600);
    // profiles.bio exists since 20261102100000_db_security_fixes.sql
    expect(payload).toHaveProperty("bio");
  });
});
