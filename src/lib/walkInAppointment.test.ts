import { beforeEach, describe, expect, it, vi } from "vitest";
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
        if (table === "website_settings") return chain({ data: {}, count: null });
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
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: /time slot/i }));
}

function chooseGender(label: "Male" | "Female" | "Other") {
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("combobox", { name: /gender/i }));
  fireEvent.click(screen.getByRole("option", { name: label }));
}

type Gender = "Male" | "Female" | "Other";
type Fill = { name?: string; phone?: string; service?: string; age?: string; gender?: Gender | null; weight?: string };

// Fills every required field by default; pass "" / null to leave one empty.
function fillForm(overrides: Fill = {}) {
  const defaults: Required<Fill> = { name: "Walk-in Patient", phone: "9876543210", service: "Clinic Visit", age: "34", gender: "Male", weight: "" };
  const v = { ...defaults, ...overrides };
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: v.name } });
  fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), { target: { value: v.phone } });
  fireEvent.change(screen.getByPlaceholderText("e.g. Clinic Visit"), { target: { value: v.service } });
  fireEvent.change(screen.getByPlaceholderText("Years"), { target: { value: v.age } });
  if (v.gender) chooseGender(v.gender);
  if (v.weight) fireEvent.change(screen.getByPlaceholderText("e.g. 62"), { target: { value: v.weight } });
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: /^add appointment$/i }));
const settle = () => new Promise((r) => setTimeout(r, 60));

beforeEach(() => {
  insertPayload.current = null;
});

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
    fillForm();
    submit();

    await waitFor(() => expect(insertPayload.current?.time_slot).toBeNull());
  });

  it("stores age, gender and weight with the appointment", async () => {
    await openNewAppointment();

    fillForm({ age: "34", gender: "Female", weight: "62.5" });
    submit();

    await waitFor(() => expect(insertPayload.current).not.toBeNull());
    expect(insertPayload.current).toMatchObject({
      patient_name: "Walk-in Patient",
      patient_phone: "9876543210",
      service_name: "Clinic Visit",
      patient_age: 34,
      patient_gender: "female",
      patient_weight: 62.5,
    });
  });

  it("leaves weight empty when it is not entered", async () => {
    await openNewAppointment();

    fillForm();
    submit();

    await waitFor(() => expect(insertPayload.current).not.toBeNull());
    expect(insertPayload.current?.patient_weight).toBeNull();
  });
});

describe("required fields", () => {
  it("does not submit without a phone number", async () => {
    await openNewAppointment();

    fillForm({ phone: "" });
    submit();

    expect(await screen.findByText("Phone number is required")).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("does not submit with an invalid phone number", async () => {
    await openNewAppointment();

    fillForm({ phone: "12345" });
    submit();

    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("does not submit without a service", async () => {
    await openNewAppointment();

    fillForm({ service: "   " });
    submit();

    expect(await screen.findByText("Service is required")).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("does not submit without an age", async () => {
    await openNewAppointment();

    fillForm({ age: "" });
    submit();

    expect(await screen.findByText("Age is required")).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("does not submit without a gender", async () => {
    await openNewAppointment();

    fillForm({ gender: null });
    submit();

    expect(await screen.findByText("Select the patient's gender")).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("rejects an age above 120 and an out-of-range weight", async () => {
    await openNewAppointment();

    fillForm({ age: "121" });
    submit();
    expect(await screen.findByText(/valid age/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Years"), { target: { value: "40" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 62"), { target: { value: "900" } });
    submit();
    expect(await screen.findByText(/between 0.5 and 500 kg/i)).toBeInTheDocument();

    await settle();
    expect(insertPayload.current).toBeNull();
  });
});

describe("counter payment", () => {
  it("records a cash payment on a walk-in by default, with no reference", async () => {
    await openNewAppointment();

    fillForm();
    submit();

    await waitFor(() => expect(insertPayload.current?.payment_status).toBe("paid"));
    expect(insertPayload.current?.payment_method).toBe("cash");
    expect(insertPayload.current?.paid_at).toEqual(expect.any(String));
    expect(insertPayload.current?.payment_reference).toBeNull();
  });

  it("leaves the payment pending when it was not received at the counter", async () => {
    await openNewAppointment();

    fillForm({ name: "Pay Later Patient" });
    fireEvent.click(screen.getByLabelText(/payment received at the counter/i));
    submit();

    await waitFor(() => expect(insertPayload.current?.patient_name).toBe("Pay Later Patient"));
    expect(insertPayload.current?.payment_status).toBe("pending");
    expect(insertPayload.current?.payment_method).toBeUndefined();
    expect(insertPayload.current?.payment_reference).toBeUndefined();
  });

  it("asks for a UTR on UPI and refuses to save without a valid 12-digit one", async () => {
    await openNewAppointment();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "UPI" }));
    expect(screen.getByLabelText(/UTR \/ UPI reference no/i)).toBeInTheDocument();

    submit();
    expect(await screen.findByText(/12-digit UTR/i)).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();

    fireEvent.change(screen.getByLabelText(/UTR \/ UPI reference no/i), { target: { value: "12345" } });
    submit();
    expect(await screen.findByText(/exactly 12 digits/i)).toBeInTheDocument();
    await settle();
    expect(insertPayload.current).toBeNull();
  });

  it("saves the UPI payment with its UTR", async () => {
    await openNewAppointment();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "UPI" }));
    fireEvent.change(screen.getByLabelText(/UTR \/ UPI reference no/i), { target: { value: "4123 4567 8901" } });
    submit();

    await waitFor(() => expect(insertPayload.current).not.toBeNull());
    expect(insertPayload.current).toMatchObject({
      payment_status: "paid",
      payment_method: "upi",
      payment_reference: "412345678901",
    });
  });

  it("saves a card payment with its approval code", async () => {
    await openNewAppointment();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Card" }));
    fireEvent.change(screen.getByLabelText(/approval code/i), { target: { value: "a1b2c3" } });
    submit();

    await waitFor(() => expect(insertPayload.current).not.toBeNull());
    expect(insertPayload.current).toMatchObject({ payment_method: "card", payment_reference: "A1B2C3" });
  });

  it("drops the reference when the method is switched back to cash", async () => {
    await openNewAppointment();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "UPI" }));
    fireEvent.change(screen.getByLabelText(/UTR \/ UPI reference no/i), { target: { value: "412345678901" } });
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(screen.queryByLabelText(/UTR \/ UPI reference no/i)).not.toBeInTheDocument();
    submit();

    await waitFor(() => expect(insertPayload.current).not.toBeNull());
    expect(insertPayload.current).toMatchObject({ payment_method: "cash", payment_reference: null });
  });
});

describe("walk-in display", () => {
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
