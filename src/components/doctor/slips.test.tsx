import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentSlip from "./PaymentSlip";
import AppointmentSlip from "./AppointmentSlip";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AAA") } }));
vi.mock("@/assets/doctylia-logo.webp", () => ({ default: "logo.webp" }));

const profile = {
  full_name: "Asha Rao",
  clinic_name: "Asha Clinic",
  slug: "asha-rao",
  clinic_address: "12 MG Road, Pune",
  clinic_phone: "+91 98765 43210",
};

const paymentProps = (over: Record<string, unknown> = {}) => ({
  open: true,
  onClose: vi.fn(),
  profile,
  token: "ABC1234",
  service: { name: "General Consultation", price: 500 },
  type: "clinic" as const,
  date: new Date(2026, 10, 1),
  time: "10:00 AM",
  patientName: "Ravi Kumar",
  patientPhone: "9876500001",
  amount: 500,
  razorpayPaymentId: "pay_XYZ",
  razorpayOrderId: "order_XYZ",
  paidAt: "2026-10-31T06:30:00Z",
  onDownload: vi.fn(),
  ...over,
});

describe("PaymentSlip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the paid amount, patient, payment & order ids and the appointment date", () => {
    render(<PaymentSlip {...paymentProps()} />);
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("pay_XYZ")).toBeInTheDocument();
    expect(screen.getByText("order_XYZ")).toBeInTheDocument();
    expect(screen.getByText("Dr. Asha Rao")).toBeInTheDocument();
    expect(screen.getByText(/1 Nov 2026, 10:00 AM/)).toBeInTheDocument();
  });

  it("falls back to '-' when gateway ids are missing and leaves Paid On blank without paidAt", () => {
    render(<PaymentSlip {...paymentProps({ razorpayPaymentId: "", razorpayOrderId: "", paidAt: null })} />);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
  });

  it("derives a clinic name when none is set", () => {
    render(<PaymentSlip {...paymentProps({ profile: { full_name: "Asha Rao" } })} />);
    expect(screen.getByText("Dr. Asha Rao Clinic")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<PaymentSlip {...paymentProps({ open: false })} />);
    expect(screen.queryByText("Ravi Kumar")).not.toBeInTheDocument();
  });

  it("offers a download action", () => {
    const p = paymentProps();
    render(<PaymentSlip {...p} />);
    const dl = screen.getAllByRole("button").find((b) => /download/i.test(b.textContent || ""));
    expect(dl).toBeTruthy();
    fireEvent.click(dl!);
    expect(p.onDownload).toHaveBeenCalled();
  });
});

describe("AppointmentSlip", () => {
  const props = (over: Record<string, unknown> = {}) => ({
    open: true,
    onClose: vi.fn(),
    profile,
    settings: { auto_confirm: true },
    token: "ABC1234",
    service: { name: "General Consultation", price: 500 },
    type: "clinic" as const,
    date: new Date(2026, 10, 1),
    time: "10:00 AM",
    patientName: "Ravi Kumar",
    patientPhone: "9876500001",
    onDownload: vi.fn(),
    ...over,
  });

  it("shows token, long date, ₹ amount and Confirmed when auto_confirm is on", async () => {
    render(<AppointmentSlip {...props()} />);
    expect(screen.getByText("#ABC1234")).toBeInTheDocument();
    expect(screen.getByText("Sunday, 1 November 2026")).toBeInTheDocument();
    expect(screen.getByText("₹500")).toBeInTheDocument();
    expect(screen.getAllByText(/Confirmed/).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.querySelector("img[src^='data:image/png']")).toBeTruthy());
  });

  it("shows Pending when the doctor does not auto-confirm", () => {
    render(<AppointmentSlip {...props({ settings: { auto_confirm: false } })} />);
    expect(screen.getAllByText(/Pending/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Confirmed$/)).not.toBeInTheDocument();
  });

  it("forceConfirmed (paid online) overrides auto_confirm=false", () => {
    render(<AppointmentSlip {...props({ settings: { auto_confirm: false }, forceConfirmed: true })} />);
    expect(screen.getAllByText(/Confirmed/).length).toBeGreaterThan(0);
  });

  it("shows no amount when there is no service", () => {
    render(<AppointmentSlip {...props({ service: null })} />);
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });
});
