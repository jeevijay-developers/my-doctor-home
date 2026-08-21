import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppointmentsPage from "./AppointmentsPage";

const { profileState } = vi.hoisted(() => ({
  profileState: { id: "doctor-1", consultation_fee: 500 as number | undefined },
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile: profileState,
    loading: false,
    isStaff: false,
    can: () => true,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({
    isPremium: false,
    appointmentsCap: 100,
    appointmentsUsed: 0,
    nearCap: false,
    loading: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => {
    const promise = Promise.resolve(resolved);
    return Object.assign(promise, {
      select: () => chain(resolved),
      eq: () => chain(resolved),
      in: () => chain(resolved),
      or: () => chain(resolved),
      neq: () => chain(resolved),
      order: () => chain(resolved),
      range: () => Promise.resolve(resolved),
      update: () => chain(resolved),
    });
  };
  return {
    supabase: {
      from: vi.fn(() => chain({ data: [], count: 0 })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

async function openNewAppointment() {
  render(
    <MemoryRouter>
      <AppointmentsPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /new appointment/i }));
  await waitFor(() => {
    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();
  });
}

describe("AppointmentsPage - amount autofill", () => {
  beforeEach(() => {
    profileState.consultation_fee = 500;
  });

  it("pre-fills Amount with the doctor's default consultation fee when adding an appointment", async () => {
    await openNewAppointment();
    const amount = screen.getByPlaceholderText("0") as HTMLInputElement;
    expect(amount.value).toBe("500");
  });

  it("falls back to a blank Amount when no default consultation fee is set", async () => {
    profileState.consultation_fee = 0;
    await openNewAppointment();
    const amount = screen.getByPlaceholderText("0") as HTMLInputElement;
    expect(amount.value).toBe("");
  });

  it("uses the current consultation fee at the time the modal opens, not a stale initial value", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AppointmentsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /new appointment/i }));
    await waitFor(() => {
      expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("500");
    });
    unmount();

    profileState.consultation_fee = 800;
    await openNewAppointment();
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("800");
  });
});
