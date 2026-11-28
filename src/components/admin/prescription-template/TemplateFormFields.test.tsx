import { useState } from "react";
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TemplateFormFields, { emptyTemplateFormValues } from "./TemplateFormFields";
import { TEMPLATE_PRESETS, defaultTemplateConfig } from "@/lib/prescriptionTemplate/defaults";
import { newCustomBlock } from "@/lib/prescriptionTemplate/config";
import type { TemplateConfig } from "@/lib/prescriptionTemplate/types";

const Harness = ({ config }: { config: TemplateConfig }) => {
  const [values, setValues] = useState(emptyTemplateFormValues());
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  return (
    <>
      <TemplateFormFields
        config={config}
        idPrefix="t"
        values={values}
        onChange={(p) => setValues((v) => ({ ...v, ...p }))}
        extra={extra}
        onExtraChange={(id, v) => setExtra((e) => ({ ...e, [id]: v }))}
        renderMedicines={() => <div>MEDICINES-EDITOR</div>}
      />
      <pre data-testid="out">{JSON.stringify({ values, extra })}</pre>
    </>
  );
};
const out = () => JSON.parse(screen.getByTestId("out").textContent!) as { values: Record<string, string>; extra: Record<string, unknown> };
const dental = () => TEMPLATE_PRESETS.find((p) => p.key === "dental")!.build();

describe("TemplateFormFields", () => {
  it("the standard template asks for diagnosis, medicines, advice and follow-up, in that order", () => {
    const { container } = render(<Harness config={defaultTemplateConfig()} />);
    const text = container.textContent!;
    const at = (s: string) => text.indexOf(s);
    expect(at("Diagnosis")).toBeGreaterThan(-1);
    expect(at("Diagnosis")).toBeLessThan(at("MEDICINES-EDITOR"));
    expect(at("MEDICINES-EDITOR")).toBeLessThan(at("General advice"));
    expect(at("General advice")).toBeLessThan(at("Follow-up date"));
  });

  it("writes advice and follow-up values", () => {
    render(<Harness config={defaultTemplateConfig()} />);
    fireEvent.change(screen.getByLabelText("General advice"), { target: { value: "Rest" } });
    fireEvent.change(screen.getByLabelText("Follow-up date"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Diagnosis"), { target: { value: "Flu" } });
    expect(out().values).toMatchObject({ advice: "Rest", follow_up_date: "2026-12-01", diagnosis: "Flu" });
  });

  it("leaves out sections the template switched off, and print-only ones never have inputs", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "medicines" || b.type === "advice" ? { ...b, enabled: false } : b));
    render(<Harness config={cfg} />);
    expect(screen.queryByText("MEDICINES-EDITOR")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("General advice")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Follow-up date")).toBeInTheDocument();
  });

  it("no diagnosis input when the patient box does not show the diagnosis", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "patient_info" ? { ...b, fields: b.fields.filter((f) => f !== "diagnosis") } : b));
    render(<Harness config={cfg} />);
    expect(screen.queryByLabelText("Diagnosis")).not.toBeInTheDocument();
  });

  it("dental template: text, choice, multi-choice and pain answers are collected by field id", () => {
    render(<Harness config={dental()} />);
    fireEvent.change(screen.getByLabelText("OPD No."), { target: { value: "14023" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "IOPAR" }));
    fireEvent.click(screen.getByRole("button", { name: "RVG" }));
    fireEvent.click(screen.getByRole("button", { name: "3 · Severe" }));
    expect(out().extra).toMatchObject({ cf_opd_no: "14023", cf_mlc: "Yes", cf_investigations: ["IOPAR", "RVG"], cf_pain: 3 });

    // Tapping the chosen option again clears it.
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "IOPAR" }));
    expect(out().extra).toMatchObject({ cf_investigations: ["RVG"] });
    expect(out().extra.cf_mlc).toBeUndefined();
  });

  it("tooth chart: pick a status, tap teeth to mark them, tap again to clear", () => {
    render(<Harness config={dental()} />);
    const tooth = (n: string) => screen.getByRole("button", { name: new RegExp(`Clinical findings tooth ${n}\\b`) });

    fireEvent.click(tooth("16")); // default status is "decayed"
    expect(out().extra.cf_teeth).toEqual({ "16": "decayed" });

    fireEvent.click(screen.getByRole("button", { name: /Root stump/ }));
    fireEvent.click(tooth("36"));
    expect(out().extra.cf_teeth).toEqual({ "16": "decayed", "36": "root_stump" });
    expect(tooth("36")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(tooth("36")); // same status again clears it
    expect(out().extra.cf_teeth).toEqual({ "16": "decayed" });

    fireEvent.click(tooth("16")); // the brush is now root stump, so this re-marks 16 with it
    expect(out().extra.cf_teeth).toEqual({ "16": "root_stump" });

    fireEvent.click(screen.getByRole("button", { name: "Clear chart" }));
    expect(out().extra.cf_teeth).toBeUndefined();
  });

  it("a required field is starred in its label", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks.push({ id: "cf_x", type: "custom", enabled: true, label: "OPD No.", fieldType: "text", options: [], required: true, carryForward: false, placement: "section" });
    render(<Harness config={cfg} />);
    expect(screen.getByText("OPD No. *")).toBeInTheDocument();
  });
});

describe("TemplateFormFields - complaint, symptoms, vitals, advice kinds and placed fields", () => {
  it("asks for the complaint and symptoms the patient box lists, and stores them under the reserved keys", () => {
    render(<Harness config={defaultTemplateConfig()} />);
    fireEvent.change(screen.getByLabelText("Complaint"), { target: { value: "Fever" } });
    fireEvent.change(screen.getByLabelText("Symptoms"), { target: { value: "Chills" } });
    expect(out().extra).toMatchObject({ sys_complaint: "Fever", sys_symptoms: "Chills" });
  });

  it("does not ask for them when the patient box does not list them", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "patient_info" ? { ...b, fields: ["patient_name", "diagnosis"] } : b));
    render(<Harness config={cfg} />);
    expect(screen.queryByLabelText("Complaint")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Symptoms")).not.toBeInTheDocument();
  });

  it("shows an input for each vital the template offers, with its unit, and nothing for the rest", () => {
    render(<Harness config={defaultTemplateConfig()} />);
    expect(screen.getByLabelText("Blood pressure (mmHg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Pulse (bpm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Temperature (°F)")).toBeInTheDocument();
    expect(screen.getByLabelText("SpO2 (%)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Weight (kg)")).not.toBeInTheDocument(); // not offered by default
  });

  it("keeps only what can be a vital while typing, and stores it under the vital's key", () => {
    render(<Harness config={defaultTemplateConfig()} />);
    fireEvent.change(screen.getByLabelText("Blood pressure (mmHg)"), { target: { value: "12x0/8o" } });
    fireEvent.change(screen.getByLabelText("Pulse (bpm)"), { target: { value: "7a2" } });
    expect(out().extra).toMatchObject({ sys_vital_blood_pressure: "120/8", sys_vital_pulse: "72" });
  });

  it("BMI follows height and weight once both are filled in, and is not editable then", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "vitals" ? { ...b, fields: ["height", "weight", "bmi"] } : b));
    render(<Harness config={cfg} />);
    const bmi = screen.getByLabelText("BMI") as HTMLInputElement;
    expect(bmi.readOnly).toBe(false);
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "170" } });
    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "70" } });
    expect((screen.getByLabelText("BMI") as HTMLInputElement).value).toBe("24.2");
    expect((screen.getByLabelText("BMI") as HTMLInputElement).readOnly).toBe(true);
  });

  it("asks only for the kinds of advice the template offers", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "advice" ? { ...b, fields: ["general", "diet"] } : b));
    render(<Harness config={cfg} />);
    expect(screen.getByLabelText("General advice")).toBeInTheDocument();
    expect(screen.getByLabelText("Diet advice")).toBeInTheDocument();
    expect(screen.queryByLabelText("Lifestyle advice")).not.toBeInTheDocument();
  });

  it("a switched-off vitals or advice section has no inputs, and an empty one does not leave a heading", () => {
    const cfg = defaultTemplateConfig();
    cfg.blocks = cfg.blocks.map((b) => (b.type === "vitals" ? { ...b, enabled: false } : b.type === "advice" ? { ...b, fields: [] } : b));
    render(<Harness config={cfg} />);
    expect(screen.queryByLabelText("Pulse (bpm)")).not.toBeInTheDocument();
    expect(screen.queryByText("Advice")).not.toBeInTheDocument();
  });

  it("custom fields placed in a section are asked for inside it, not as sections of their own", () => {
    const cfg = defaultTemplateConfig();
    const patient = newCustomBlock(cfg.blocks, "text", "Occupation", "patient_info");
    const vital = newCustomBlock(cfg.blocks, "number", "Blood sugar", "vitals");
    const advice = newCustomBlock(cfg.blocks, "textarea", "Dental advice", "advice");
    cfg.blocks.push(patient, vital, advice);
    const { container } = render(<Harness config={cfg} />);
    // Each one appears once, in document order of its section: patient box, vitals, advice.
    const text = container.textContent!;
    const at = (s: string) => text.indexOf(s);
    expect(at("Occupation")).toBeGreaterThan(-1);
    expect(at("Occupation")).toBeLessThan(at("Blood sugar"));
    expect(at("Blood sugar")).toBeLessThan(at("MEDICINES-EDITOR"));
    expect(at("MEDICINES-EDITOR")).toBeLessThan(at("Dental advice"));
    expect(screen.getAllByLabelText("Occupation")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Blood sugar"), { target: { value: "110" } });
    expect(out().extra[vital.id]).toBe("110");
  });
});
