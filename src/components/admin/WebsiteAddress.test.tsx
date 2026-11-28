import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WebsiteAddressCard from "./WebsiteAddressCard";

const h = vi.hoisted(() => ({
  profile: null as any, role: "owner", perms: {} as Record<string, boolean>, active: [] as unknown[],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: h.profile, role: h.role, can: (k: string) => !!h.perms[k] }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ active: h.active }) }));

import { toast } from "sonner";

const profile = { id: "c1", slug: "dr-asha-rao", slug_locked: false, clinic_name: "Sunrise Clinic" };
const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = { ...profile };
  h.role = "owner";
  h.perms = {};
  h.active = [{ id: "p1" }];
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("WebsiteAddressCard (read-only)", () => {
  it("shows the address and explains it will change when a second doctor joins (single doctor)", () => {
    render(<WebsiteAddressCard />);
    expect(screen.getByText("doctylia.com/dr/dr-asha-rao")).toBeInTheDocument();
    expect(screen.getByText("Your address changes automatically to your clinic name when you add a second doctor. Old links keep working.")).toBeInTheDocument();
  });

  it("has no editing controls", () => {
    render(<WebsiteAddressCard />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save address|Use clinic name/ })).toBeNull();
  });

  it("uses the team wording for a clinic with two active doctors", () => {
    h.active = [{ id: "p1" }, { id: "p2" }];
    h.profile = { ...profile, slug: "sunrise-clinic" };
    render(<WebsiteAddressCard />);
    expect(screen.getByText("Your address uses your clinic name. Old links keep working.")).toBeInTheDocument();
    expect(screen.queryByText(/changes automatically/)).toBeNull();
  });

  it("copies the full link and confirms", async () => {
    render(<WebsiteAddressCard />);
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://doctylia.com/dr/dr-asha-rao"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("tells the user when copying fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<WebsiteAddressCard />);
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("tells the user when the clipboard is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<WebsiteAddressCard />);
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("opens the site in a new tab", () => {
    render(<WebsiteAddressCard />);
    const open = screen.getByRole("link", { name: /Open/ });
    expect(open).toHaveAttribute("href", "/dr/dr-asha-rao");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("keeps a very long address inside the card (wraps instead of overflowing)", () => {
    const long = "a".repeat(50);
    h.profile = { ...profile, slug: long };
    render(<WebsiteAddressCard />);
    expect(screen.getByText(`doctylia.com/dr/${long}`).className).toMatch(/break-all/);
  });

  it("shows 'Not set' and no Copy/Open when there is no address yet", () => {
    h.profile = { ...profile, slug: null };
    render(<WebsiteAddressCard />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open/ })).toBeNull();
  });

  it("is visible to staff only with Edit Profile, and never to a doctor login", () => {
    h.role = "staff";
    const { container, rerender } = render(<WebsiteAddressCard />);
    expect(container).toBeEmptyDOMElement();
    h.perms = { "profile.edit": true };
    rerender(<WebsiteAddressCard />);
    expect(screen.getByText("Website address")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    h.role = "doctor";
    rerender(<WebsiteAddressCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
