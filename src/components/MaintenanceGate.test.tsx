import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MaintenanceGate from "./MaintenanceGate";

const settingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePlatformSettings", () => ({ usePlatformSettings: settingsMock }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MaintenanceGate>app content</MaintenanceGate>
    </MemoryRouter>,
  );

describe("MaintenanceGate", () => {
  beforeEach(() => settingsMock.mockReset());

  it("shows the maintenance page to the public when maintenance_mode is true", () => {
    settingsMock.mockReturnValue({ settings: { maintenance_mode: true }, loading: false });
    renderAt("/dr/some-doctor");
    expect(screen.getByText(/be right back/)).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });

  it("never locks out the superadmin panel", () => {
    settingsMock.mockReturnValue({ settings: { maintenance_mode: true }, loading: false });
    renderAt("/superadmin/settings");
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("never locks out auth pages", () => {
    settingsMock.mockReturnValue({ settings: { maintenance_mode: true }, loading: false });
    renderAt("/auth");
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("renders the app when the flag is not strictly boolean true", () => {
    settingsMock.mockReturnValue({ settings: { maintenance_mode: "true" }, loading: false });
    renderAt("/");
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  it("renders the app while settings are loading (no flash of maintenance page)", () => {
    settingsMock.mockReturnValue({ settings: { maintenance_mode: true }, loading: true });
    renderAt("/");
    expect(screen.getByText("app content")).toBeInTheDocument();
  });
});
