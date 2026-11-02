import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PermissionGate from "./PermissionGate";

const useProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useProfile", () => ({ useProfile: useProfileMock }));

const state = (over: Record<string, unknown>) => ({
  isStaff: false,
  loading: false,
  can: () => true,
  ...over,
});

describe("PermissionGate", () => {
  beforeEach(() => useProfileMock.mockReset());

  it("shows a spinner, never the children, while loading", () => {
    useProfileMock.mockReturnValue(state({ loading: true, isStaff: true, can: () => false }));
    const { container } = render(<PermissionGate permission="patients.view">secret</PermissionGate>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("always lets the doctor through, even for doctor-only (null) pages", () => {
    useProfileMock.mockReturnValue(state({ isStaff: false }));
    render(<PermissionGate permission={null}>secret</PermissionGate>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("lets staff in when they hold the permission", () => {
    useProfileMock.mockReturnValue(state({ isStaff: true, can: (k: string) => k === "patients.view" }));
    render(<PermissionGate permission="patients.view">secret</PermissionGate>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("blocks staff without the permission", () => {
    useProfileMock.mockReturnValue(state({ isStaff: true, can: () => false }));
    render(<PermissionGate permission="billing.manage">secret</PermissionGate>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("keeps doctor-only (null permission) pages closed to staff even if can() says yes", () => {
    useProfileMock.mockReturnValue(state({ isStaff: true, can: () => true }));
    render(<PermissionGate permission={null}>secret</PermissionGate>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
