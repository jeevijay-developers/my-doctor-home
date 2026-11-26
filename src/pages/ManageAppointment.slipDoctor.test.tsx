import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ManageAppointment from "./ManageAppointment";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/VideoConsultationCard", () => ({ default: () => <div>VIDEO-CARD</div> }));
// The real slips print `Dr. ${profile.full_name}`; these stand-ins show the same value.
vi.mock("@/components/doctor/AppointmentSlip", () => ({
  default: ({ open, profile }: { open: boolean; profile: any }) => (open ? <div>SLIP-DOCTOR Dr. {profile.full_name}|{profile.clinic_name}</div> : null),
}));
vi.mock("@/components/doctor/PaymentSlip", () => ({
  default: ({ open, profile }: { open: boolean; profile: any }) => (open ? <div>RECEIPT-DOCTOR Dr. {profile.full_name}|{profile.clinic_name}</div> : null),
}));
vi.mock("@/lib/downloadPdfFromNode", () => ({ downloadPdfFromNode: vi.fn() }));

const DR_A = { id: "p1", display_name: "Asha Rao", slug: "dr-a", slot_duration_minutes: null, bookable: true, is_primary: true, is_owner: true };
const DR_B = { id: "p2", display_name: "Dr. Meera Shah", slug: "dr-b", slot_duration_minutes: 20, bookable: true, is_primary: false, is_owner: false, registration_number: "REG-9", qualifications: "MD" };

const appt = (over: Record<string, unknown> = {}) => ({
  id: "a1", doctor_id: "d1", patient_name: "Ravi Kumar", patient_phone: "9876500001", service_name: "General Consultation",
  appointment_type: "online", date: "2999-05-20", time_slot: "10:00", status: "confirmed", token_number: "TK7M2QX9", amount: 500,
  reschedule_count: 0, chief_complaint: null, meeting_link: null, created_at: "2026-10-01T00:00:00Z",
  payment_status: "paid", payment_gateway: "razorpay", gateway_payment_id: "pay_1", gateway_order_id: "o_1", paid_at: "2026-11-20T10:00:00Z",
  ...over,
});

const open = async () => {
  render(
    <MemoryRouter initialEntries={["/dr/asha/manage"]}>
      <Routes><Route path="/dr/:slug/manage" element={<ManageAppointment />} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(mock.current.rpc).not.toBeUndefined());
  fireEvent.change(screen.getByLabelText("Token Number"), { target: { value: "tk7m2qx9" } });
  fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "9876500001" } });
  const btn = screen.getByRole("button", { name: /Find My Appointment/ });
  await waitFor(() => expect(btn).toBeEnabled());
  fireEvent.click(btn);
  fireEvent.click(await screen.findByRole("button", { name: "View booking slip" }));
  fireEvent.click(screen.getByRole("button", { name: "View payment receipt" }));
};

describe("ManageAppointment slip and receipt doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    const t = mock.current.tables;
    t.profiles = { data: { id: "d1", full_name: "Asha Rao", clinic_name: "Rao Clinic", slug: "asha" } };
    t.website_settings = { data: { cancellation_cutoff_hours: 2, booking_advance_days: 7 } };
    t.working_hours = { data: [] };
    mock.current.rpcs.get_upcoming_checkup = () => null;
    mock.current.rpcs.get_slot_counts = () => [];
  });

  it("multi-doctor visit: slip and receipt name the visit's own doctor, clinic stays the clinic's", async () => {
    mock.current.rpcs.get_public_practitioners = () => [DR_A, DR_B];
    mock.current.rpcs.get_appointment_by_token = () => [appt({ practitioner_id: "p2", practitioner_name: "Meera Shah" })];
    await open();
    expect(screen.getByText("SLIP-DOCTOR Dr. Meera Shah|Rao Clinic")).toBeInTheDocument();
    expect(screen.getByText("RECEIPT-DOCTOR Dr. Meera Shah|Rao Clinic")).toBeInTheDocument();
  });

  it("multi-doctor visit with the owner keeps the owner's profile", async () => {
    mock.current.rpcs.get_public_practitioners = () => [DR_A, DR_B];
    mock.current.rpcs.get_appointment_by_token = () => [appt({ practitioner_id: "p1", practitioner_name: "Asha Rao" })];
    await open();
    expect(screen.getByText("SLIP-DOCTOR Dr. Asha Rao|Rao Clinic")).toBeInTheDocument();
    expect(screen.getByText("RECEIPT-DOCTOR Dr. Asha Rao|Rao Clinic")).toBeInTheDocument();
  });

  it("single-doctor clinic is unchanged", async () => {
    mock.current.rpcs.get_public_practitioners = () => [DR_A];
    mock.current.rpcs.get_appointment_by_token = () => [appt({ practitioner_id: "p1", practitioner_name: "Asha Rao" })];
    await open();
    expect(screen.getByText("SLIP-DOCTOR Dr. Asha Rao|Rao Clinic")).toBeInTheDocument();
    expect(screen.getByText("RECEIPT-DOCTOR Dr. Asha Rao|Rao Clinic")).toBeInTheDocument();
  });

  it("a non-owner main doctor's visit shows their own name, not the owner's profile", async () => {
    const MAIN_B = { ...DR_B, is_primary: true };
    const OWNER_A = { ...DR_A, is_primary: false };
    mock.current.rpcs.get_public_practitioners = () => [OWNER_A, MAIN_B];
    mock.current.rpcs.get_appointment_by_token = () => [appt({ practitioner_id: "p2", practitioner_name: "Meera Shah" })];
    await open();
    expect(screen.getByText("SLIP-DOCTOR Dr. Meera Shah|Rao Clinic")).toBeInTheDocument();
  });

  it("the owner's visit keeps the clinic profile even when the owner is no longer the main doctor", async () => {
    const MAIN_B = { ...DR_B, is_primary: true };
    const OWNER_A = { ...DR_A, is_primary: false };
    mock.current.rpcs.get_public_practitioners = () => [OWNER_A, MAIN_B];
    mock.current.rpcs.get_appointment_by_token = () => [appt({ practitioner_id: "p1", practitioner_name: "Asha Rao" })];
    await open();
    expect(screen.getByText("SLIP-DOCTOR Dr. Asha Rao|Rao Clinic")).toBeInTheDocument();
  });
});
