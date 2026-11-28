import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WebsiteAddressCard from "./WebsiteAddressCard";
import ClinicAddressBanner from "./ClinicAddressBanner";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  profile: null as any, role: "owner", perms: {} as Record<string, boolean>, refetch: vi.fn(), active: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, role: h.role, can: (k: string) => !!h.perms[k], refetch: h.refetch }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ active: h.active }) }));

import { toast } from "sonner";

const profile = { id: "c1", slug: "dr-asha-rao", slug_locked: false, clinic_name: "Sunrise Clinic", full_name: "Asha Rao", city: "Kota" };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mock.current = createTableMock();
  h.profile = { ...profile };
  h.role = "owner";
  h.perms = {};
  h.active = [{ id: "p1" }, { id: "p2" }];
  mock.current.rpcs.is_clinic_slug_available = (a: any) => ({ available: a._slug !== "taken-one", code: a._slug === "taken-one" ? "SLUG_TAKEN" : null });
  mock.current.rpcs.suggest_clinic_slug = () => "sunrise-clinic";
  mock.current.rpcs.set_clinic_slug = (a: any) => ({ ok: true, slug: a._slug });
});

describe("WebsiteAddressCard", () => {
  it("shows the current address and keeps Save disabled until a valid free address is typed", async () => {
    render(<WebsiteAddressCard />);
    expect(screen.getByText("doctylia.com/dr/dr-asha-rao")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save address" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "sunrise-clinic" } });
    await screen.findByText("This address is available.");
    expect(save).toBeEnabled();
  });

  it("explains a taken address, a reserved word and a bad format without calling the database for the last two", async () => {
    render(<WebsiteAddressCard />);
    const input = screen.getByLabelText("New address");
    fireEvent.change(input, { target: { value: "taken-one" } });
    await screen.findByText(/already used by another clinic/);
    expect(screen.getByRole("button", { name: "Save address" })).toBeDisabled();
    mock.current.rpc.mockClear();
    fireEvent.change(input, { target: { value: "admin" } });
    await screen.findByText(/reserved/);
    fireEvent.change(input, { target: { value: "ab" } });
    await screen.findByText(/3-50 letters/);
    expect(mock.current.rpc).not.toHaveBeenCalled();
  });

  it("fills the clinic-name suggestion", async () => {
    render(<WebsiteAddressCard />);
    fireEvent.click(screen.getByRole("button", { name: /Use clinic name/ }));
    await waitFor(() => expect(screen.getByLabelText("New address")).toHaveValue("sunrise-clinic"));
    expect(mock.current.rpc).toHaveBeenCalledWith("suggest_clinic_slug", { _clinic_name: "Sunrise Clinic", _city: "Kota" });
  });

  it("confirms (old links keep working), saves through set_clinic_slug, toasts and refetches", async () => {
    render(<WebsiteAddressCard />);
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "sunrise-clinic" } });
    await screen.findByText("This address is available.");
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText(/Your new address will be/)).toBeInTheDocument();
    expect(mock.current.rpc).not.toHaveBeenCalledWith("set_clinic_slug", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: /Change address/ }));
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("set_clinic_slug", { _slug: "sunrise-clinic" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(h.refetch).toHaveBeenCalled();
  });

  it("shows the coded error when the save is refused", async () => {
    mock.current.rpcs.set_clinic_slug = () => ({ data: { ok: false, error: "SLUG_TAKEN" }, error: null });
    render(<WebsiteAddressCard />);
    fireEvent.change(screen.getByLabelText("New address"), { target: { value: "sunrise-clinic" } });
    await screen.findByText("This address is available.");
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    fireEvent.click(await screen.findByRole("button", { name: /Change address/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/already used/)));
    expect(h.refetch).not.toHaveBeenCalled();
  });

  it("is visible to staff only with Edit Profile, and never to a doctor login", () => {
    h.role = "staff";
    const { container, rerender } = render(<WebsiteAddressCard />);
    expect(container).toBeEmptyDOMElement();
    h.perms = { "profile.edit": true };
    rerender(<WebsiteAddressCard />);
    expect(screen.getByText("Website address")).toBeInTheDocument();
    h.role = "doctor";
    rerender(<WebsiteAddressCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ClinicAddressBanner", () => {
  it("offers the suggested address to the owner of a 2+ doctor clinic", async () => {
    render(<ClinicAddressBanner />);
    expect(await screen.findByText("Use your clinic name in your website address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use sunrise-clinic" })).toBeInTheDocument();
  });

  it("Not now hides it and is remembered per clinic", async () => {
    const { unmount } = render(<ClinicAddressBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Use your clinic name in your website address")).toBeNull();
    unmount();
    render(<ClinicAddressBanner />);
    await waitFor(() => expect(screen.queryByText("Use your clinic name in your website address")).toBeNull());
  });

  it("Use <suggested> confirms then saves", async () => {
    render(<ClinicAddressBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Use sunrise-clinic" }));
    fireEvent.click(await screen.findByRole("button", { name: /Change address/ }));
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("set_clinic_slug", { _slug: "sunrise-clinic" }));
  });

  it("is hidden for single-doctor clinics, staff, locked slugs and when the address already matches", async () => {
    h.active = [{ id: "p1" }];
    const a = render(<ClinicAddressBanner />);
    await waitFor(() => expect(a.container).toBeEmptyDOMElement());
    a.unmount();
    h.active = [{ id: "p1" }, { id: "p2" }];
    h.role = "staff";
    const b = render(<ClinicAddressBanner />);
    expect(b.container).toBeEmptyDOMElement();
    b.unmount();
    h.role = "owner";
    h.profile = { ...profile, slug_locked: true };
    const c = render(<ClinicAddressBanner />);
    expect(c.container).toBeEmptyDOMElement();
    c.unmount();
    h.profile = { ...profile, slug: "sunrise-clinic" };
    const d = render(<ClinicAddressBanner />);
    await waitFor(() => expect(mock.current.rpc).toHaveBeenCalledWith("suggest_clinic_slug", expect.anything()));
    expect(d.container).toBeEmptyDOMElement();
  });
});
