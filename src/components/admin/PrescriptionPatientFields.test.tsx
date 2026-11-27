import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PrescriptionPatientFields, { type PatientFieldsValue } from "./PrescriptionPatientFields";

// The picker itself is covered in PatientCombobox.test.tsx; here it is a stand-in.
vi.mock("./PatientCombobox", () => ({
  default: (p: any) => (
    <div>
      <button role="combobox" aria-label="Patient" id={p.id}>{p.value ? p.valueLabel : "Search patient by name or phone…"}</button>
      <button onClick={() => p.onSelect({ id: "p1", name: "Aaryan", phone: "8871876376", gender: "male", age: 34, weight: 62.5 })}>pick-aaryan</button>
      <span data-testid="ctx">{p.clinicId}|{p.practitionerId ?? ""}</span>
    </div>
  ),
}));

const value = (over: Partial<PatientFieldsValue> = {}): PatientFieldsValue => ({
  patient_id: "", patient_name: "", date: "2026-11-18", patient_age: "", patient_weight: "", ...over,
});

const renderFields = (v: PatientFieldsValue) => {
  const onChange = vi.fn();
  render(<PrescriptionPatientFields idPrefix="t" selectLabel="Linked Patient" clinicId="clinic-1" practitionerId="pr-1" value={v} onChange={onChange} />);
  return onChange;
};

describe("PrescriptionPatientFields", () => {
  it("shows the name field when no patient is linked", () => {
    renderFields(value());
    expect(screen.getByLabelText(/patient name/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear patient/i })).not.toBeInTheDocument();
  });

  it("hides the name field and offers Clear when a patient is linked", () => {
    renderFields(value({ patient_id: "p1", patient_name: "Aaryan", patient_age: "34", patient_weight: "62.5" }));
    expect(screen.queryByLabelText(/patient name/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Age")).toHaveValue("34");
    expect(screen.getByLabelText(/weight/i)).toHaveValue("62.5");
    expect(screen.getByRole("button", { name: /clear patient/i })).toBeInTheDocument();
  });

  it("shows the stored name on the picker for a linked patient that is in no result list", () => {
    renderFields(value({ patient_id: "gone", patient_name: "Old Patient", patient_age: "50" }));
    expect(screen.queryByLabelText(/patient name/i)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Patient" })).toHaveTextContent("Old Patient");
    expect(screen.getByLabelText("Age")).toHaveValue("50");
    expect(screen.getByRole("button", { name: /clear patient/i })).toBeInTheDocument();
  });

  it("passes the clinic and prescribing doctor to the picker", () => {
    renderFields(value());
    expect(screen.getByTestId("ctx")).toHaveTextContent("clinic-1|pr-1");
  });

  it("does not touch the saved age and weight just by being shown (editing an existing prescription)", () => {
    const onChange = renderFields(value({ patient_id: "p1", patient_name: "Aaryan", patient_age: "30", patient_weight: "70" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Age")).toHaveValue("30");
  });

  it("fills name, age and weight when a patient is chosen", () => {
    const onChange = renderFields(value());
    fireEvent.click(screen.getByText("pick-aaryan"));
    expect(onChange).toHaveBeenCalledWith({ patient_id: "p1", patient_name: "Aaryan", patient_age: "34", patient_weight: "62.5" });
  });

  it("clears the link, name, age and weight but keeps the date", () => {
    const onChange = renderFields(value({ patient_id: "p1", patient_name: "Aaryan", patient_age: "34", patient_weight: "62.5" }));
    fireEvent.click(screen.getByRole("button", { name: /clear patient/i }));
    expect(onChange).toHaveBeenCalledWith({ patient_id: "", patient_name: "", patient_age: "", patient_weight: "" });
  });

  it("reports edits to the date, age and weight as partial changes", () => {
    const onChange = renderFields(value({ patient_id: "p1", patient_name: "Aaryan" }));
    fireEvent.change(screen.getByLabelText("Age"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText(/weight/i), { target: { value: "70.5" } });
    expect(onChange).toHaveBeenCalledWith({ patient_age: "41" });
    expect(onChange).toHaveBeenCalledWith({ patient_weight: "70.5" });
  });
});
