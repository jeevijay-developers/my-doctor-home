import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrescriptionSlip from "./PrescriptionSlip";

const profile = {
  full_name: "Test Doctor", specialization: "Dermatologist", qualifications: "MBBS, MD",
  clinic_name: "Test Clinic", address: "123 Main St", city: "Testville", phone: "9999999999",
};

const prescription = {
  id: "rx-1", patient_name: "John Doe", diagnosis: "Acute bronchitis",
  medications: "Amoxicillin 500mg\nTwice daily for 5 days", date: "2026-08-10",
  patient_age: 34, patient_weight: 70, patient_gender: "male",
};

describe("PrescriptionSlip", () => {
  it("renders doctor, patient info, diagnosis and medications", () => {
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={prescription} onDownload={() => {}} />);
    expect(screen.getAllByText(/Dr\. Test Doctor/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/MBBS, MD/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("male")).toBeInTheDocument();
    expect(screen.getByText("70 kg")).toBeInTheDocument();
    expect(screen.getByText("Acute bronchitis")).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin 500mg/)).toBeInTheDocument();
    expect(screen.getByText("Test Clinic")).toBeInTheDocument();
    expect(screen.queryByText(/notes/i)).not.toBeInTheDocument();
  });

  it("falls back to — for missing age/weight/gender/diagnosis", () => {
    const incomplete = { ...prescription, patient_age: null, patient_weight: null, patient_gender: null, diagnosis: null };
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={incomplete} onDownload={() => {}} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("renders nothing when prescription is null", () => {
    const { container } = render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={null} onDownload={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
