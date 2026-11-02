import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PrescriptionSlip, { type PrescriptionSlipData } from "./PrescriptionSlip";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

const profile = { full_name: "Test Doctor", clinic_name: "Test Clinic", slug: "test-doc", registration_number: "REG-123" };

const rx: PrescriptionSlipData = {
  id: "abcdef12-0000", patient_id: "11112222-0000", patient_name: "John Doe", diagnosis: "Bronchitis",
  medications: "", medicines: [], advice: "Rest", diet_advice: "Warm fluids", lifestyle_advice: null,
  follow_up_date: "2026-11-20", follow_up_instructions: "Come back if fever persists", date: "2026-11-02",
  patient_age: 34, patient_weight: 70, patient_gender: "male",
  visit: { reason_for_visit: "Cough", symptoms: "Night cough" } as any,
  vitals: { blood_pressure: "120/80", pulse: 72, spo2: 98 } as any,
};

describe("PrescriptionSlip actions and sections", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); document.body.classList.remove("printing-prescription-slip"); });

  it("Download PDF calls onDownload once; Close calls onClose", () => {
    const onDownload = vi.fn(), onClose = vi.fn();
    render(<PrescriptionSlip open onClose={onClose} profile={profile} prescription={rx} onDownload={onDownload} />);
    fireEvent.click(screen.getByRole("button", { name: /Download PDF/ }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: /Close/ })[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("Print marks the body for print CSS, calls window.print after a tick, and cleans up on afterprint", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={rx} onDownload={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    expect(document.body.classList.contains("printing-prescription-slip")).toBe(true);
    expect(print).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(150); });
    expect(print).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(document.body.classList.contains("printing-prescription-slip")).toBe(false);
    print.mockRestore();
  });

  it("renders the sections the PDF pipeline captures: header, body, footer and one row per block", () => {
    const { baseElement } = render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={rx} onDownload={() => {}} />);
    const root = baseElement.querySelector("[data-prescription-slip-print-root]")!;
    expect(root.querySelector("[data-prescription-slip-header]")).toBeTruthy();
    expect(root.querySelector("[data-prescription-slip-body]")).toBeTruthy();
    expect(root.querySelector("[data-prescription-slip-footer]")).toBeTruthy();
    expect(root.querySelectorAll("[data-prescription-slip-row]").length).toBeGreaterThan(0);
  });

  it("shows vitals, advice, follow-up, complaint, short ids and registration number", () => {
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={rx} onDownload={() => {}} />);
    expect(screen.getByText("120/80", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/72 bpm/)).toBeInTheDocument();
    expect(screen.getByText(/98%/)).toBeInTheDocument();
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Warm fluids")).toBeInTheDocument();
    expect(screen.queryByText(/Lifestyle Advice/)).not.toBeInTheDocument();
    expect(screen.getByText(/Come back if fever persists/)).toBeInTheDocument();
    expect(screen.getByText("Cough")).toBeInTheDocument();
    expect(screen.getByText("ABCDEF12")).toBeInTheDocument();
    expect(screen.getByText("11112222")).toBeInTheDocument();
    expect(screen.getAllByText(/REG-123/).length).toBeGreaterThan(0);
  });

  it("an unsaved preview shows PREVIEW as its id", () => {
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={{ ...rx, id: "" as any, patient_id: null }} onDownload={() => {}} />);
    expect(screen.getByText("PREVIEW")).toBeInTheDocument();
  });
});
