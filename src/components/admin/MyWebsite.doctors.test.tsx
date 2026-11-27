import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyWebsite from "./MyWebsite";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { usePractitioners } from "@/hooks/usePractitioners";

// Services per doctor + the doctor on each review (multi-doctor clinics only).
const calls = vi.hoisted(() => [] as { table: string; method: string; args: unknown[] }[]);
const extra = vi.hoisted(() => ({
  servicePractitioners: [] as unknown[],
  reviews: [] as unknown[],
  rpcCalls: [] as { fn: string; args: unknown }[],
  rpcResult: null as unknown,
  insertedService: null as unknown,
  serviceError: null as unknown,
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: extra.toast, useToast: () => ({ toast: extra.toast }) }));

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useProfile", () => {
  const profile = { id: "doctor-1", full_name: "Dr. Test", slug: "dr-test" };
  return { useProfile: () => ({ profile, loading: false, isStaff: false, can: () => false }) };
});
vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: vi.fn() }));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string, resolved: any): any => {
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain(table, resolved);
    };
    return Object.assign(Promise.resolve(resolved), {
      select: record("select"),
      eq: record("eq"),
      order: record("order"),
      update: record("update"),
      insert: record("insert"),
      delete: record("delete"),
      // Only a new service is ever read back with .single() after an insert.
      single: () => Promise.resolve(table === "services" && calls.some((c) => c.table === "services" && c.method === "insert") ? extra.insertedService : resolved),
    });
  };
  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "website_settings") return chain(table, { data: { id: "ws-1", doctor_id: "doctor-1", show_online_consultation: false } });
        if (table === "services") {
          return chain(table, { data: [{ id: "service-1", name: "General Consultation", description: "Routine care", price: 500, type: "clinic", duration: 30, active: true, sort_order: 0 }], error: extra.serviceError });
        }
        if (table === "working_hours") return chain(table, { data: [], error: null });
        if (table === "service_practitioners") return chain(table, { data: extra.servicePractitioners, error: null });
        if (table === "reviews") return chain(table, { data: extra.reviews, error: null });
        return chain(table, { data: [] });
      }),
      rpc: vi.fn(async (fn: string, args: unknown) => { extra.rpcCalls.push({ fn, args }); return extra.rpcResult; }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
    },
  };
});

const DOCS = [
  { id: "pr-1", display_name: "Asha Rao", is_active: true, is_primary: true },
  { id: "pr-2", display_name: "Vikram Shah", is_active: true, is_primary: false },
  { id: "pr-3", display_name: "Old Doc", is_active: false, is_primary: false },
];
const multi = () =>
  vi.mocked(usePractitioners).mockReturnValue({
    primary: DOCS[0], isMulti: true, practitioners: DOCS, active: DOCS.filter((d) => d.is_active),
    byId: (id: string) => DOCS.find((d) => d.id === id),
  } as any);

beforeEach(() => {
  calls.length = 0;
  extra.servicePractitioners = [];
  extra.reviews = [];
  extra.rpcCalls = [];
  extra.serviceError = null;
  extra.toast.mockClear();
  extra.rpcResult = { data: { ok: true, count: 1 }, error: null };
  extra.insertedService = { data: { id: "service-new" }, error: null };
  vi.mocked(usePractitioners).mockReturnValue({ primary: null, isMulti: false } as any);
  vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
});

const renderMyWebsite = () => render(<MemoryRouter><MyWebsite /></MemoryRouter>);
const openServices = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Services" }));
  await screen.findByDisplayValue("General Consultation");
};
const offered = () => screen.getByRole("group", { name: /offered by/i });
const save = () => fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

describe("MyWebsite - services per doctor", () => {
  it("single-doctor clinic: no Offered by control, no mapping query, no RPC", async () => {
    renderMyWebsite();
    await openServices();
    expect(screen.queryByText(/offered by/i)).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(calls.some((c) => c.table === "website_settings" && c.method === "update")).toBe(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.some((c) => c.table === "service_practitioners")).toBe(false);
    expect(extra.rpcCalls).toEqual([]);
  });

  it("multi: shows active doctors only and reflects an existing mapping", async () => {
    multi();
    extra.servicePractitioners = [{ service_id: "service-1", practitioner_id: "pr-2" }];
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "Vikram Shah" })).toHaveAttribute("aria-pressed", "true"));
    expect(within(offered()).getByRole("button", { name: "Asha Rao" })).toHaveAttribute("aria-pressed", "false");
    expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "false");
    expect(within(offered()).queryByRole("button", { name: "Old Doc" })).not.toBeInTheDocument();
  });

  it("multi: unmapped service defaults to All doctors", async () => {
    multi();
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("multi: a changed selection is saved via set_service_practitioners, an unchanged one is not", async () => {
    multi();
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(within(offered()).getByRole("button", { name: "Asha Rao" }));
    save();
    await waitFor(() =>
      expect(extra.rpcCalls).toEqual([{ fn: "set_service_practitioners", args: { _service_id: "service-1", _practitioner_ids: ["pr-1"] } }]),
    );
    save();
    await new Promise((r) => setTimeout(r, 50));
    expect(extra.rpcCalls).toHaveLength(1);
  });

  it("multi: All doctors clears an existing mapping (empty list)", async () => {
    multi();
    extra.servicePractitioners = [{ service_id: "service-1", practitioner_id: "pr-2" }];
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "Vikram Shah" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(within(offered()).getByRole("button", { name: "All doctors" }));
    save();
    await waitFor(() =>
      expect(extra.rpcCalls).toEqual([{ fn: "set_service_practitioners", args: { _service_id: "service-1", _practitioner_ids: [] } }]),
    );
  });

  it("multi: selecting every active doctor is saved as 'all' (empty list)", async () => {
    multi();
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(within(offered()).getByRole("button", { name: "Asha Rao" }));
    fireEvent.click(within(offered()).getByRole("button", { name: "Vikram Shah" }));
    save();
    await waitFor(() =>
      expect(extra.rpcCalls).toEqual([{ fn: "set_service_practitioners", args: { _service_id: "service-1", _practitioner_ids: [] } }]),
    );
  });

  it("multi: a refused save shows the mapped error text", async () => {
    multi();
    extra.rpcResult = { data: { ok: false, error: "FORBIDDEN" }, error: null };
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(within(offered()).getByRole("button", { name: "Asha Rao" }));
    save();
    await waitFor(() =>
      expect(extra.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "You don't have permission to change which doctors offer a service.", variant: "destructive" })),
    );
  });

  const serviceReads = () => calls.filter((c) => c.table === "services" && c.method === "select").length;

  it("a failed services update shows one destructive toast and skips the reload", async () => {
    multi();
    renderMyWebsite();
    await openServices();
    const before = serviceReads();
    extra.serviceError = { message: "permission denied for services" };
    fireEvent.change(screen.getByDisplayValue("General Consultation"), { target: { value: "Edited name" } });
    save();
    await waitFor(() => expect(extra.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "permission denied for services", variant: "destructive" })));
    expect(extra.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Changes saved!" }));
    expect(extra.toast.mock.calls.filter((c) => c[0].variant === "destructive")).toHaveLength(1);
    expect(serviceReads()).toBe(before);
    expect(screen.getByDisplayValue("Edited name")).toBeInTheDocument();
  });

  it("a failed mapping keeps the owner's selection and does not reload the page data", async () => {
    multi();
    extra.rpcResult = { data: { ok: false, error: "FORBIDDEN" }, error: null };
    renderMyWebsite();
    await openServices();
    await waitFor(() => expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "true"));
    const before = serviceReads();
    fireEvent.click(within(offered()).getByRole("button", { name: "Asha Rao" }));
    save();
    await waitFor(() => expect(extra.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(serviceReads()).toBe(before);
    expect(within(offered()).getByRole("button", { name: "Asha Rao" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a failed new-service insert is reported and the unsaved row stays", async () => {
    multi();
    extra.insertedService = { data: null, error: { message: "insert refused" } };
    renderMyWebsite();
    await openServices();
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));
    save();
    await waitFor(() => expect(extra.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "insert refused", variant: "destructive" })));
    expect(screen.getAllByPlaceholderText("Service name")).toHaveLength(2);
    expect(extra.rpcCalls).toEqual([]);
  });

  it("multi: a service mapped only to deactivated doctors warns instead of showing All doctors", async () => {
    multi();
    extra.servicePractitioners = [{ service_id: "service-1", practitioner_id: "pr-3" }];
    renderMyWebsite();
    await openServices();
    expect(await screen.findByText(/Only offered by doctors who are no longer active/)).toBeInTheDocument();
    expect(within(offered()).getByRole("button", { name: "All doctors" })).toHaveAttribute("aria-pressed", "false");
  });

  it("multi: a brand-new service is saved first and its returned id is used for the mapping", async () => {
    multi();
    renderMyWebsite();
    await openServices();
    fireEvent.click(screen.getByRole("button", { name: /add service/i }));
    const groups = screen.getAllByRole("group", { name: /offered by/i });
    expect(groups).toHaveLength(2);
    fireEvent.click(within(groups[1]).getByRole("button", { name: "Vikram Shah" }));
    save();
    await waitFor(() =>
      expect(extra.rpcCalls).toEqual([{ fn: "set_service_practitioners", args: { _service_id: "service-new", _practitioner_ids: ["pr-2"] } }]),
    );
  });
});

describe("MyWebsite - reviews by doctor", () => {
  const reviews = () => [
    { id: "r1", patient_name: "Pat One", rating: 5, review_text: "great", is_visible: true, is_pinned: false, created_at: "2026-01-01T00:00:00Z", practitioner_id: "pr-1" },
    { id: "r2", patient_name: "Pat Two", rating: 4, review_text: "good", is_visible: true, is_pinned: false, created_at: "2026-01-02T00:00:00Z", practitioner_id: "pr-2" },
  ];

  it("multi: shows the doctor on each review and filters by doctor", async () => {
    multi();
    extra.reviews = reviews();
    renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /^Reviews/ }));
    expect(await screen.findByText("Pat One")).toBeInTheDocument();
    expect(screen.getByText("Dr. Asha Rao", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Vikram Shah", { selector: "span" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter reviews by doctor"), { target: { value: "pr-2" } });
    expect(screen.queryByText("Pat One")).not.toBeInTheDocument();
    expect(screen.getByText("Pat Two")).toBeInTheDocument();
  });

  it("single-doctor clinic: no doctor badge and no filter", async () => {
    extra.reviews = reviews();
    renderMyWebsite();
    fireEvent.click(screen.getByRole("button", { name: /^Reviews/ }));
    expect(await screen.findByText("Pat One")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter reviews by doctor")).not.toBeInTheDocument();
    expect(screen.queryByText(/Asha Rao/)).not.toBeInTheDocument();
  });
});
