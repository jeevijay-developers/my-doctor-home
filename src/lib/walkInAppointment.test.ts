import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppointmentsPage from "@/components/admin/AppointmentsPage";

const { appointmentRows, insertPayload, profile } = vi.hoisted(() => ({
  appointmentRows: [] as Record<string, unknown>[],
  insertPayload: { current: null as Record<string, unknown> | null },
  profile: { id: "doctor-1", consultation_fee: 500 },
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({
    profile,
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
      single: () => chain(resolved),
      order: () => chain(resolved),
      range: () => Promise.resolve(resolved),
      update: () => chain(resolved),
      insert: (payload: Record<string, unknown>) => {
        insertPayload.current = payload;
        return chain({ error: null });
      },
    });
  };

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "appointments") return chain({ data: appointmentRows, count: appointmentRows.length });
        if (table === "website_settings") return chain({ data: { max_per_slot: 1 }, count: null });
        return chain({ data: [], count: 0 });
      }),
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
  render(createElement(MemoryRouter, null, createElement(AppointmentsPage)));
  fireEvent.click(screen.getByRole("button", { name: /new appointment/i }));
  await waitFor(() => expect(screen.getByPlaceholderText("0")).toBeInTheDocument());
}

function openTimeSlotSelect() {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox"));
}

describe("walk-in appointments", () => {
  it("exposes Walk-in as an Add Appointment time option", async () => {
    await openNewAppointment();

    openTimeSlotSelect();

    expect(screen.getByRole("option", { name: "Walk-in" })).toBeInTheDocument();
  });

  it("submits a null time_slot when Walk-in is selected", async () => {
    await openNewAppointment();

    openTimeSlotSelect();
    fireEvent.click(screen.getByRole("option", { name: "Walk-in" }));
    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Walk-in Patient" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number (optional)"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /add appointment/i }));

    await waitFor(() => expect(insertPayload.current?.time_slot).toBeNull());
  });

  it("allows an appointment to be submitted without a phone number", async () => {
    await openNewAppointment();

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "No Phone Patient" } });
    fireEvent.click(screen.getByRole("button", { name: /add appointment/i }));

    await waitFor(() => expect(insertPayload.current?.patient_phone).toBe(""));
  });

  it("displays Walk-in for an appointment with a null time_slot", async () => {
    appointmentRows.splice(0, appointmentRows.length, {
      id: "appointment-1",
      patient_name: "Walk-in Patient",
      patient_phone: "9876543210",
      patient_age: null,
      patient_gender: null,
      patient_email: null,
      service_name: "Consultation",
      appointment_type: "clinic",
      date: "2026-08-22",
      time_slot: null,
      status: "pending",
      payment_status: "pending",
      amount: 500,
      token_number: null,
      chief_complaint: null,
      notes: null,
    });

    render(createElement(MemoryRouter, null, createElement(AppointmentsPage)));

    await waitFor(() => expect(screen.getByText("Walk-in")).toBeInTheDocument());
  });
});